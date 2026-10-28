/**
 * "Métodos estadísticos" of a valuation version, one per comparable type:
 * its own comparables, criteria and scales, saved as a whole; the regression
 * and the goal programming (solved here with HiGHS) with their trace. A
 * reference: it changes no approach, the market's value or the conclusion.
 *
 * A version that kept its regression in the market approach (before this
 * apartado existed) is read from there, as it was, until the appraiser saves
 * here; nothing of the market is changed.
 */
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { ENGINE_VERSION } from "../engine/config";
import { Trace } from "../engine/trace";
import { asRecord, catalogId, decimal, findValuation, versionPrecision, writableVersion, type Tx } from "./access";
import { solveGoalProgram } from "./goal-programming-solver";
import { loadMarketForStatistics } from "./market.service";
import type { ComparableType } from "./market-types";
import {
  computeStatisticalGoal,
  computeStatisticalRegression,
  defaultStatisticalSettings,
  statisticalFromMarket,
  statisticalGoalProblem,
  type MarketReferenceDto,
  type StatisticalCalculationDto,
  type StatisticalComparableDto,
  type StatisticalSettingsDto,
} from "./statistical-types";

/** The engine run of each apartado: MOTOR.ESTADISTICO.TERRENO_VENTA… */
export const statisticalRunKey = (type: ComparableType) => `MOTOR.ESTADISTICO.${type}`;

/** Stored settings over the defaults, so a field added later has its value. */
function settingsOf(stored: Prisma.JsonValue, type: ComparableType): StatisticalSettingsDto {
  const defaults = defaultStatisticalSettings(type);
  const settings = asRecord(stored) as Partial<StatisticalSettingsDto>;
  return {
    ...defaults,
    ...settings,
    comparableType: type,
    regression: { ...defaults.regression, ...settings.regression },
    goal: { ...defaults.goal, ...settings.goal },
  };
}

const comparablesOf = (stored: Prisma.JsonValue) => (Array.isArray(stored) ? stored as unknown as StatisticalComparableDto[] : []);

/** What the market's homologation of the same type gave, for the comparison table. */
async function marketReference(tx: Tx, versionId: number, type: ComparableType): Promise<MarketReferenceDto | null> {
  const approach = await tx.enfoqueMercado.findFirst({
    where: { IdVersionAvaluo: versionId, tipoComparable: { SClave: type } },
    select: { NValorPromedioHomologado: true, NValorHomologadoUtilizado: true, NValorMercado: true, NSuperficieSujeto: true },
  });
  if (!approach) return null;
  const run = await tx.ejecucionCalculo.findFirst({
    where: { IdVersionAvaluo: versionId, SClaveCalculo: `MOTOR.MERCADO.${type}` },
    select: { JValoresSalida: true },
    orderBy: { DFechaEjecucion: "desc" },
  });
  const stats = asRecord(asRecord(run?.JValoresSalida ?? null).stats as Prisma.JsonValue ?? null) as { median?: number };
  return {
    mean: decimal(approach.NValorPromedioHomologado),
    median: typeof stats.median === "number" ? stats.median : null,
    adoptedUnitValue: decimal(approach.NValorHomologadoUtilizado),
    value: decimal(approach.NValorMercado),
    subjectArea: decimal(approach.NSuperficieSujeto),
  };
}

/** The apartado of a version as stored, or read from the market's regression of before, or new. */
async function loadStatistical(tx: Tx, versionId: number, type: ComparableType) {
  const row = await tx.metodoEstadistico.findUnique({ where: { IdVersionAvaluo_STipoComparable: { IdVersionAvaluo: versionId, STipoComparable: type } } });
  if (row) return { settings: settingsOf(row.JConfiguracion, type), comparables: comparablesOf(row.JComparables), configured: true, fromMarket: false };
  const legacy = statisticalFromMarket(await loadMarketForStatistics(tx, versionId, type));
  if (legacy) return { ...legacy, configured: false, fromMarket: true };
  return { settings: defaultStatisticalSettings(type), comparables: [], configured: false, fromMarket: false };
}

/** The goal program solved for the data, when it is on and its data are complete. */
async function solvedGoal(calculation: Pick<StatisticalCalculationDto, "settings" | "comparables">): Promise<StatisticalCalculationDto["goal"]> {
  const stated = statisticalGoalProblem(calculation);
  if (!stated?.ok) return null;
  return { problem: stated.problem, solution: await solveGoalProgram(stated.problem) };
}

export async function getStatisticalCalculation(publicId: string, organizationId: number, type: ComparableType): Promise<StatisticalCalculationDto> {
  const loaded = await prisma.$transaction(async (tx) => {
    const avaluo = await findValuation(tx, publicId, organizationId);
    const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
    if (!versionId) return { settings: defaultStatisticalSettings(type), comparables: [], configured: false, fromMarket: false, locked: avaluo.BBloqueado, market: null };
    const [stored, precision, market] = await Promise.all([
      loadStatistical(tx, versionId, type),
      versionPrecision(tx, versionId),
      marketReference(tx, versionId, type),
    ]);
    return { ...stored, locked: avaluo.BBloqueado, precision, market };
  });
  // Solved outside the transaction: HiGHS needs no database.
  return { ...loaded, goal: await solvedGoal(loaded) };
}

/** Replaces the apartado of the type sent and stores both methods' results and trace. */
export async function saveStatisticalCalculation(publicId: string, user: AuthUser, payload: Pick<StatisticalCalculationDto, "settings" | "comparables">) {
  const type = payload.settings.comparableType;
  const goal = await solvedGoal(payload);
  await prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const data = {
      JConfiguracion: payload.settings as unknown as Prisma.InputJsonValue,
      JComparables: payload.comparables as unknown as Prisma.InputJsonValue,
    };
    await tx.metodoEstadistico.upsert({
      where: { IdVersionAvaluo_STipoComparable: { IdVersionAvaluo: versionId, STipoComparable: type } },
      create: { IdVersionAvaluo: versionId, STipoComparable: type, ...data },
      update: data,
    });
    await storeResults(tx, versionId, { ...payload, goal });
  });
}

/** The values of both methods on the row, and their steps in the engine run of the apartado. */
async function storeResults(tx: Tx, versionId: number, calculation: Pick<StatisticalCalculationDto, "settings" | "comparables" | "goal">) {
  const type = calculation.settings.comparableType;
  const key = statisticalRunKey(type);
  await tx.ejecucionCalculo.deleteMany({ where: { IdVersionAvaluo: versionId, SClaveCalculo: key } });
  const trace = new Trace();
  const regression = computeStatisticalRegression(calculation, trace);
  const goal = computeStatisticalGoal(calculation, trace);
  const regressionValue = regression?.ok ? regression.result.value : null;
  const goalValue = goal?.outcome.ok ? goal.outcome.fit.estimate : null;
  await tx.metodoEstadistico.update({
    where: { IdVersionAvaluo_STipoComparable: { IdVersionAvaluo: versionId, STipoComparable: type } },
    data: { NValorRegresion: regressionValue, NValorMetas: goalValue },
  });
  if (!trace.steps.length) return;
  const calculationId = await catalogId(
    (catalogKey) => tx.calculoPermitido.findUnique({ where: { SClave: catalogKey } }),
    "VALOR_HOMOLOGADO",
    (row) => row.IdCalculoPermitido,
  );
  await tx.ejecucionCalculo.create({
    data: {
      IdVersionAvaluo: versionId,
      IdCalculoPermitido: calculationId,
      SClaveCalculo: key,
      SVersionCalculo: ENGINE_VERSION,
      JValoresEntrada: { comparables: calculation.comparables.length, variables: calculation.settings.variables } as unknown as Prisma.InputJsonValue,
      JValoresSalida: {
        regression: regression?.ok
          ? { n: regression.result.fit.n, coefficients: regression.result.fit.coefficients, value: regressionValue, unitValue: regression.result.unitValue, rSquared: regression.result.fit.rSquared }
          : null,
        goal: goal?.outcome.ok
          ? { n: goal.outcome.fit.n, coefficients: goal.outcome.fit.coefficients, objective: goal.outcome.fit.objective, value: goalValue }
          : null,
      } as Prisma.InputJsonValue,
      SPoliticaRedondeo: "ninguno",
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
