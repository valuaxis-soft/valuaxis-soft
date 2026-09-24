/**
 * Income approach of a valuation version: rentable units, deductions and the
 * capitalization rate, and the stored result with its trace. The rent comes
 * from the rent market (comparables of type INMUEBLE_RENTA).
 */
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { DEFAULT_ENGINE_CONFIG, ENGINE_VERSION } from "../engine/config";
import { computeIncomeApproach } from "../engine/income";
import { Trace } from "../engine/trace";
import { asRecord, catalogId, decimal, findValuation, writableVersion, type Tx } from "./access";
import { recomputeConclusion } from "./conclusion.service";
import type { IncomeInputPayload } from "./income-schemas";
import { DEFAULT_INCOME, toIncomeEngineInput, type IncomeCalculationDto, type IncomeInputDto } from "./income-types";

const CALCULATION_KEY = "MOTOR.INGRESOS";

async function rentMarket(tx: Tx, versionId: number): Promise<IncomeCalculationDto["rentMarket"]> {
  const market = await tx.enfoqueMercado.findFirst({
    where: { IdVersionAvaluo: versionId, tipoComparable: { SClave: "INMUEBLE_RENTA" } },
    select: { NValorHomologadoUtilizado: true, NSuperficieSujeto: true },
  });
  return { adoptedUnitRent: decimal(market?.NValorHomologadoUtilizado), subjectArea: decimal(market?.NSuperficieSujeto) };
}

async function loadInput(tx: Tx, versionId: number) {
  const approach = await tx.enfoqueIngreso.findUnique({
    where: { IdVersionAvaluo: versionId },
    include: { deduccionesIngreso: { orderBy: { IOrden: "asc" } } },
  });
  if (!approach) return { input: DEFAULT_INCOME, configured: false };
  const configuration = asRecord(approach.JConfiguracion) as Partial<IncomeInputDto>;
  return {
    configured: true,
    input: {
      rentableUnits: configuration.rentableUnits?.length ? configuration.rentableUnits : DEFAULT_INCOME.rentableUnits,
      deductions: approach.deduccionesIngreso.map((row) => ({ concept: row.SConcepto, rate: decimal(row.NPorcentaje) })),
      ratingColumns: configuration.ratingColumns ?? DEFAULT_INCOME.ratingColumns,
      appliedRate: decimal(approach.NTasaMercado),
    } satisfies IncomeInputDto,
  };
}

export async function getIncomeCalculation(publicId: string, organizationId: number): Promise<IncomeCalculationDto> {
  return prisma.$transaction(async (tx) => {
    const avaluo = await findValuation(tx, publicId, organizationId);
    const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
    if (!versionId) {
      return { ...DEFAULT_INCOME, rentMarket: { adoptedUnitRent: null, subjectArea: null }, configured: false, locked: avaluo.BBloqueado };
    }
    const [{ input, configured }, market] = await Promise.all([loadInput(tx, versionId), rentMarket(tx, versionId)]);
    return { ...input, rentMarket: market, configured, locked: avaluo.BBloqueado };
  });
}

export async function saveIncomeCalculation(publicId: string, user: AuthUser, payload: IncomeInputPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const configuration = { rentableUnits: payload.rentableUnits, ratingColumns: payload.ratingColumns };
    // NTasaMercado keeps the rate the appraiser captured; NTasaAplicada, the one used.
    const approach = await tx.enfoqueIngreso.upsert({
      where: { IdVersionAvaluo: versionId },
      create: { IdVersionAvaluo: versionId, JConfiguracion: configuration, NTasaMercado: payload.appliedRate },
      update: { JConfiguracion: configuration, NTasaMercado: payload.appliedRate },
    });
    await tx.deduccionIngreso.deleteMany({ where: { IdEnfoqueIngreso: approach.IdEnfoqueIngreso } });
    if (payload.deductions.length) {
      await tx.deduccionIngreso.createMany({
        data: payload.deductions.map((row, index) => ({
          IdEnfoqueIngreso: approach.IdEnfoqueIngreso,
          SConcepto: row.concept,
          NPorcentaje: row.rate,
          IOrden: index,
        })),
      });
    }
    await recomputeIncome(tx, versionId);
  });
}

/** Recomputes the approach from what is stored, saves the result and its trace, and updates the conclusion. */
export async function recomputeIncome(tx: Tx, versionId: number) {
  await recomputeIncomeValues(tx, versionId);
  await recomputeConclusion(tx, versionId);
}

async function recomputeIncomeValues(tx: Tx, versionId: number) {
  const approach = await tx.enfoqueIngreso.findUnique({ where: { IdVersionAvaluo: versionId } });
  if (!approach) return;
  const [{ input }, market] = await Promise.all([loadInput(tx, versionId), rentMarket(tx, versionId)]);
  const engineInput = toIncomeEngineInput({ ...input, rentMarket: market });
  await tx.ejecucionCalculo.deleteMany({ where: { IdVersionAvaluo: versionId, SClaveCalculo: CALCULATION_KEY } });
  if (!engineInput.ok) {
    await tx.enfoqueIngreso.update({
      where: { IdEnfoqueIngreso: approach.IdEnfoqueIngreso },
      data: {
        NIngresoBrutoMensual: null, NPorcentajeDeducciones: null, NRentaNetaMensual: null, NRentaNetaAnual: null,
        NTasaResultante: null, NTasaAplicada: null, NValorCapitalizacion: null,
      },
    });
    return;
  }
  const trace = new Trace();
  const result = computeIncomeApproach(engineInput.input, DEFAULT_ENGINE_CONFIG, trace);
  await tx.enfoqueIngreso.update({
    where: { IdEnfoqueIngreso: approach.IdEnfoqueIngreso },
    data: {
      NIngresoBrutoMensual: result.grossMonthlyRent,
      NPorcentajeDeducciones: result.deductionsRate,
      NRentaNetaMensual: result.netMonthlyRent,
      NRentaNetaAnual: result.netAnnualRent,
      NTasaResultante: result.tableRate,
      NTasaAplicada: result.appliedRate,
      NValorCapitalizacion: result.value,
    },
  });
  const deductions = await tx.deduccionIngreso.findMany({ where: { IdEnfoqueIngreso: approach.IdEnfoqueIngreso } });
  for (const row of deductions) {
    await tx.deduccionIngreso.update({
      where: { IdDeduccionIngreso: row.IdDeduccionIngreso },
      data: { NValor: row.NPorcentaje === null ? null : Number(row.NPorcentaje) * result.grossMonthlyRent },
    });
  }
  const calculation = await catalogId(
    (key) => tx.calculoPermitido.findUnique({ where: { SClave: key } }),
    "CAPITALIZACION",
    (row) => row.IdCalculoPermitido,
  );
  await tx.ejecucionCalculo.create({
    data: {
      IdVersionAvaluo: versionId,
      IdCalculoPermitido: calculation,
      SClaveCalculo: CALCULATION_KEY,
      SVersionCalculo: ENGINE_VERSION,
      JValoresEntrada: engineInput.input as unknown as Prisma.InputJsonValue,
      JValoresSalida: { ...result, rentMarket: null } as unknown as Prisma.InputJsonValue,
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
}
