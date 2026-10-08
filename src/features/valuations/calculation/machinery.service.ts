/**
 * Machinery and equipment (MEH) of a valuation version: the cost and market
 * captures, each saved as a whole, and the stored value of each approach with
 * its trace. The conclusion takes these values when the valuation is of
 * machinery and equipment.
 */
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { ENGINE_VERSION } from "../engine/config";
import { computeMachineryCost, computeMachineryMarket } from "../engine/machinery";
import { Trace } from "../engine/trace";
import { asRecord, catalogId, findValuation, writableVersion, type Tx } from "./access";
import { recomputeConclusion } from "./conclusion.service";
import type { MachineryInputPayload } from "./machinery-schemas";
import {
  DEFAULT_MACHINERY_COST,
  DEFAULT_MACHINERY_MARKET,
  EMPTY_MACHINERY_ITEM,
  MACHINERY_CONSERVATION_TWICE,
  MACHINERY_PROPERTY_TYPE,
  alignedCharacteristics,
  emptyAttachment,
  emptyOffer,
  toMachineryCostEngineInput,
  toMachineryMarketEngineInput,
  type MachineryCalculationDto,
  type MachineryCostDto,
  type MachineryMarketDto,
} from "./machinery-types";

const COST_KEY = "MOTOR.MAQUINARIA.COSTOS";
const MARKET_KEY = "MOTOR.MAQUINARIA.MERCADO";

/** Stored captures filled with the defaults of the fields they do not carry. */
function costOf(stored: Prisma.JsonValue | null): MachineryCostDto {
  const cost = asRecord(stored) as Partial<MachineryCostDto>;
  return {
    ...DEFAULT_MACHINERY_COST,
    ...cost,
    item: { ...EMPTY_MACHINERY_ITEM, ...cost.item },
    attachments: (cost.attachments ?? []).map((row, index) => ({ ...emptyAttachment(index), ...row })),
  };
}

function marketOf(stored: Prisma.JsonValue | null): MachineryMarketDto {
  const market = asRecord(stored) as Partial<MachineryMarketDto>;
  const offers = (market.offers ?? []).map((row, index) => ({ ...emptyOffer(index), ...row }));
  return { ...DEFAULT_MACHINERY_MARKET, ...market, offers, characteristics: alignedCharacteristics(market.characteristics, offers.length) };
}

async function isMachineryValuation(tx: Tx, propertyTypeId: number) {
  const type = await tx.tipoInmueble.findUnique({ where: { IdTipoInmueble: propertyTypeId }, select: { SClave: true } });
  return type?.SClave === MACHINERY_PROPERTY_TYPE;
}

export async function getMachineryCalculation(publicId: string, organizationId: number): Promise<MachineryCalculationDto> {
  return prisma.$transaction(async (tx) => {
    const avaluo = await findValuation(tx, publicId, organizationId);
    const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
    const [applies, approach] = await Promise.all([
      isMachineryValuation(tx, avaluo.IdTipoInmueble),
      versionId ? tx.enfoqueMaquinaria.findUnique({ where: { IdVersionAvaluo: versionId } }) : null,
    ]);
    return {
      cost: costOf(approach?.JCostos ?? null),
      market: marketOf(approach?.JMercado ?? null),
      configured: { cost: Boolean(approach?.JCostos), market: Boolean(approach?.JMercado) },
      applies,
      locked: avaluo.BBloqueado,
    };
  });
}

/** Replaces the captures sent (costs, market or both) and recomputes both approaches. */
export async function saveMachineryCalculation(publicId: string, user: AuthUser, payload: MachineryInputPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const current = await tx.enfoqueMaquinaria.findUnique({ where: { IdVersionAvaluo: versionId }, select: { JCostos: true } });
    const data = {
      ...(payload.cost
        ? {
            JCostos: {
              ...payload.cost,
              // A valuation keeps the setting it was first saved with unless the request states another.
              conservationTwice: payload.cost.conservationTwice
                ?? (current?.JCostos ? costOf(current.JCostos).conservationTwice : MACHINERY_CONSERVATION_TWICE),
            } as Prisma.InputJsonValue,
          }
        : {}),
      ...(payload.market ? { JMercado: payload.market as Prisma.InputJsonValue } : {}),
    };
    await tx.enfoqueMaquinaria.upsert({ where: { IdVersionAvaluo: versionId }, create: { IdVersionAvaluo: versionId, ...data }, update: data });
    await recomputeMachinery(tx, versionId);
  });
}

/** Recomputes both approaches from what is stored, saves the values and their traces, and updates the conclusion. */
async function recomputeMachinery(tx: Tx, versionId: number) {
  const approach = await tx.enfoqueMaquinaria.findUnique({ where: { IdVersionAvaluo: versionId } });
  if (!approach) return;
  await tx.ejecucionCalculo.deleteMany({ where: { IdVersionAvaluo: versionId, SClaveCalculo: { in: [COST_KEY, MARKET_KEY] } } });

  const cost = approach.JCostos ? costOf(approach.JCostos) : null;
  const costInput = cost ? toMachineryCostEngineInput(cost) : null;
  const costTrace = new Trace();
  const costResult = costInput?.ok ? computeMachineryCost(costInput.input, costTrace) : null;

  const market = approach.JMercado ? marketOf(approach.JMercado) : null;
  const marketInput = market ? toMachineryMarketEngineInput(market) : null;
  const marketTrace = new Trace();
  const marketResult = marketInput?.ok ? computeMachineryMarket(marketInput.input, marketTrace) : null;

  await tx.enfoqueMaquinaria.update({
    where: { IdEnfoqueMaquinaria: approach.IdEnfoqueMaquinaria },
    data: { NValorFisico: costResult?.physicalValue ?? null, NValorMercado: marketResult?.value ?? null },
  });

  const store = async (key: string, permitted: string, input: unknown, result: { trace: Trace }, rounding: unknown) => {
    const calculation = await catalogId(
      (catalogKey) => tx.calculoPermitido.findUnique({ where: { SClave: catalogKey } }),
      permitted,
      (row) => row.IdCalculoPermitido,
    );
    const { trace, ...output } = result;
    await tx.ejecucionCalculo.create({
      data: {
        IdVersionAvaluo: versionId,
        IdCalculoPermitido: calculation,
        SClaveCalculo: key,
        SVersionCalculo: ENGINE_VERSION,
        JValoresEntrada: input as Prisma.InputJsonValue,
        JValoresSalida: output as unknown as Prisma.InputJsonValue,
        SPoliticaRedondeo: JSON.stringify(rounding).slice(0, 120),
        BExitoso: true,
        resultados: {
          create: trace.steps.map((step, index) => ({
            SClaveResultado: step.key.slice(0, 120),
            NValorNumerico: Number.isFinite(step.value) ? step.value : null,
            IOrden: index,
          })),
        },
      },
    });
  };
  if (costInput?.ok && costResult) await store(COST_KEY, "VALOR_NETO_REPOSICION", costInput.input, costResult, { physicalValue: cost?.rounding ?? null });
  if (marketInput?.ok && marketResult) await store(MARKET_KEY, "VALOR_HOMOLOGADO", marketInput.input, marketResult, { market: market?.rounding ?? null });

  await recomputeConclusion(tx, versionId);
}
