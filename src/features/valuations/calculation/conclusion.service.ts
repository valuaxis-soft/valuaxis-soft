/**
 * Summary of values and concluded value of a valuation version (ResumenValor),
 * recomputed whenever an approach changes.
 */
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { concludeValue } from "../engine/conclusion";
import { DEFAULT_ENGINE_CONFIG, ENGINE_VERSION } from "../engine/config";
import { Trace } from "../engine/trace";
import { asRecord, catalogId, decimal, findValuation, writableVersion, type Tx } from "./access";
import type { ConclusionSettingsPayload } from "./conclusion-schemas";
import { canConclude, defaultMethod, type ConclusionCalculationDto, type ConclusionMethod } from "./conclusion-types";

const CALCULATION_KEY = "MOTOR.CONCLUSION";

async function approachValues(tx: Tx, versionId: number) {
  const [costs, markets, income] = await Promise.all([
    tx.enfoqueCosto.findUnique({ where: { IdVersionAvaluo: versionId }, select: { NValorFisicoTotal: true } }),
    tx.enfoqueMercado.findMany({
      where: { IdVersionAvaluo: versionId, tipoComparable: { SClave: { in: ["INMUEBLE_VENTA", "TERRENO_VENTA"] } } },
      select: { NValorMercado: true, tipoComparable: { select: { SClave: true } } },
    }),
    tx.enfoqueIngreso.findUnique({ where: { IdVersionAvaluo: versionId }, select: { NValorCapitalizacion: true } }),
  ]);
  const market = ["INMUEBLE_VENTA", "TERRENO_VENTA"]
    .map((key) => markets.find((row) => row.tipoComparable.SClave === key && row.NValorMercado !== null))
    .find(Boolean);
  return {
    values: {
      costos: decimal(costs?.NValorFisicoTotal),
      mercado: decimal(market?.NValorMercado),
      ingresos: decimal(income?.NValorCapitalizacion),
    },
    marketSource: (market?.tipoComparable.SClave ?? null) as ConclusionCalculationDto["marketSource"],
  };
}

async function load(tx: Tx, versionId: number) {
  const [summary, { values, marketSource }] = await Promise.all([
    tx.resumenValor.findUnique({ where: { IdVersionAvaluo: versionId } }),
    approachValues(tx, versionId),
  ]);
  const configuration = asRecord(summary?.JConfiguracion ?? null) as { method?: ConclusionMethod };
  return {
    values,
    marketSource,
    method: configuration.method ?? defaultMethod(values),
    justification: summary?.SJustificacion ?? null,
    configured: Boolean(configuration.method),
  };
}

export async function getConclusionCalculation(publicId: string, organizationId: number): Promise<ConclusionCalculationDto> {
  return prisma.$transaction(async (tx) => {
    const avaluo = await findValuation(tx, publicId, organizationId);
    const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
    if (!versionId) {
      const values = { costos: null, mercado: null, ingresos: null };
      return { values, marketSource: null, method: defaultMethod(values), justification: null, configured: false, locked: avaluo.BBloqueado };
    }
    return { ...(await load(tx, versionId)), locked: avaluo.BBloqueado };
  });
}

export async function saveConclusionSettings(publicId: string, user: AuthUser, payload: ConclusionSettingsPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const data = { JConfiguracion: { method: payload.method } as Prisma.InputJsonValue, SJustificacion: payload.justification };
    await tx.resumenValor.upsert({ where: { IdVersionAvaluo: versionId }, create: { IdVersionAvaluo: versionId, ...data }, update: data });
    await recomputeConclusion(tx, versionId);
  });
}

/** Stores each approach value and the concluded value, with the trace. */
export async function recomputeConclusion(tx: Tx, versionId: number) {
  const current = await load(tx, versionId);
  await tx.ejecucionCalculo.deleteMany({ where: { IdVersionAvaluo: versionId, SClaveCalculo: CALCULATION_KEY } });
  const trace = new Trace();
  const result = canConclude(current) ? concludeValue({ values: current.values, method: current.method }, DEFAULT_ENGINE_CONFIG, trace) : null;
  const data = {
    NValorEnfoqueCostos: result?.summary.costos ?? current.values.costos,
    NValorEnfoqueMercado: result?.summary.mercado ?? current.values.mercado,
    NValorEnfoqueIngresos: result?.summary.ingresos ?? current.values.ingresos,
    NValorConcluido: result?.value ?? null,
    SValorConLetra: result?.valueInWords ?? null,
  };
  await tx.resumenValor.upsert({ where: { IdVersionAvaluo: versionId }, create: { IdVersionAvaluo: versionId, ...data }, update: data });
  if (!result) return;
  const calculation = await catalogId(
    (key) => tx.calculoPermitido.findUnique({ where: { SClave: key } }),
    "VALOR_FINAL",
    (row) => row.IdCalculoPermitido,
  );
  await tx.ejecucionCalculo.create({
    data: {
      IdVersionAvaluo: versionId,
      IdCalculoPermitido: calculation,
      SClaveCalculo: CALCULATION_KEY,
      SVersionCalculo: ENGINE_VERSION,
      JValoresEntrada: { values: current.values, method: current.method } as unknown as Prisma.InputJsonValue,
      JValoresSalida: result as unknown as Prisma.InputJsonValue,
      SPoliticaRedondeo: JSON.stringify({ conclusion: DEFAULT_ENGINE_CONFIG.rounding.conclusion }),
      BExitoso: true,
      resultados: {
        create: trace.steps.map((step, index) => ({ SClaveResultado: step.key.slice(0, 120), NValorNumerico: step.value, IOrden: index })),
      },
    },
  });
}
