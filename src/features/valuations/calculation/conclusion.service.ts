/**
 * Summary of values and concluded value of a valuation version (ResumenValor),
 * recomputed whenever an approach changes.
 */
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { concludeValue } from "../engine/conclusion";
import { ENGINE_VERSION } from "../engine/config";
import { Trace } from "../engine/trace";
import { asRecord, catalogId, decimal, findValuation, formulasOrThrow, writableVersion, type Tx } from "./access";
import { storedFormulas } from "./captured-formulas";
import type { ConclusionSettingsPayload } from "./conclusion-schemas";
import { MACHINERY_PROPERTY_TYPE } from "./machinery-types";
import { getCanonicalSectionKey } from "../sections/section-registry";
import {
  REPORT_APPROACHES,
  excludedReportApproaches,
  marketLeftOut,
  sectionReportApproaches,
  valuesForConclusion,
  type ReportApproach,
} from "../services/report-approaches";
import {
  CONCLUSION_PERCENT_FIELDS,
  SUMMARY_SOURCES,
  canConclude,
  conclusionEngineConfig,
  conclusionInput,
  defaultMethod,
  type ConclusionCalculationDto,
  type ConclusionMethod,
  type ConclusionSummaryRow,
  type SummarySource,
} from "./conclusion-types";

const CALCULATION_KEY = "MOTOR.CONCLUSION";

/**
 * The approaches the saved document leaves out of the dictamen ("Agregar al
 * informe valuatorio" off), read from the configuration of their sections.
 */
export async function reportExclusionsOf(tx: Tx, versionId: number): Promise<Set<ReportApproach>> {
  const keys = await tx.seccionDocumento.findMany({ where: { IdVersionAvaluo: versionId }, select: { IdSeccionDocumento: true, SClave: true } });
  const ids = keys.filter((section) => sectionReportApproaches({ id: section.SClave }).length > 0).map((section) => section.IdSeccionDocumento);
  if (!ids.length) return new Set();
  const sections = await tx.seccionDocumento.findMany({ where: { IdSeccionDocumento: { in: ids } }, select: { SClave: true, JConfiguracion: true } });
  return excludedReportApproaches(sections.map((section) => {
    const config = asRecord(section.JConfiguracion ?? null);
    const excluded = Array.isArray(config.excludedFromReport) ? config.excludedFromReport.filter((item): item is string => typeof item === "string") : [];
    return { id: getCanonicalSectionKey(section.SClave), excludedFromReport: excluded };
  }));
}

/** The same exclusions in a stable order, to compare a save with what was stored. */
export const exclusionKey = (excluded: ReadonlySet<ReportApproach>) => REPORT_APPROACHES.filter((approach) => excluded.has(approach)).join(",");

/**
 * Every value the valuation has for the resumen de valores: the approaches,
 * the rent market and the statistical methods of the market for sale
 * (buildings, else land). An approach left out of the dictamen is null.
 */
async function availableValues(tx: Tx, versionId: number, excluded: ReadonlySet<ReportApproach>): Promise<Record<SummarySource, number | null>> {
  const [costs, markets, income, statistical] = await Promise.all([
    tx.enfoqueCosto.findUnique({ where: { IdVersionAvaluo: versionId }, select: { NValorFisicoTotal: true } }),
    tx.enfoqueMercado.findMany({ where: { IdVersionAvaluo: versionId }, select: { NValorMercado: true, tipoComparable: { select: { SClave: true } } } }),
    tx.enfoqueIngreso.findUnique({ where: { IdVersionAvaluo: versionId }, select: { NValorCapitalizacion: true } }),
    tx.metodoEstadistico.findMany({ where: { IdVersionAvaluo: versionId }, select: { STipoComparable: true, NValorRegresion: true, NValorMetas: true } }),
  ]);
  const market = (key: string) => decimal(markets.find((row) => row.tipoComparable.SClave === key && row.NValorMercado !== null)?.NValorMercado);
  const sale = statistical.find((row) => row.STipoComparable === "INMUEBLE_VENTA") ?? statistical.find((row) => row.STipoComparable === "TERRENO_VENTA");
  return {
    costos: excluded.has("costos") ? null : decimal(costs?.NValorFisicoTotal),
    "mercado-inmuebles": excluded.has("mercado-inmuebles") ? null : market("INMUEBLE_VENTA"),
    "mercado-terrenos": excluded.has("mercado-terrenos") ? null : market("TERRENO_VENTA"),
    "mercado-rentas": excluded.has("mercado-rentas") ? null : market("INMUEBLE_RENTA") ?? market("TERRENO_RENTA"),
    ingresos: excluded.has("ingresos") ? null : decimal(income?.NValorCapitalizacion),
    regresion: decimal(sale?.NValorRegresion),
    metas: decimal(sale?.NValorMetas),
  };
}

const isSummarySource = (value: unknown): value is SummarySource => typeof value === "string" && (SUMMARY_SOURCES as readonly string[]).includes(value);

/** The rows stored in the configuration, only the well-formed ones. */
function storedSummaryRows(value: unknown): ConclusionSummaryRow[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((row) => {
    const record = asRecord(row);
    return isSummarySource(record.source) ? [{ source: record.source, label: typeof record.label === "string" ? record.label : "" }] : [];
  });
}

async function approachValues(tx: Tx, versionId: number): Promise<Pick<ConclusionCalculationDto, "values" | "marketSource" | "excluded">> {
  const excluded = await reportExclusionsOf(tx, versionId);
  const excludedList = REPORT_APPROACHES.filter((approach) => excluded.has(approach));
  // A machinery valuation concludes with its own cost and market approaches; it has no income approach.
  const version = await tx.versionAvaluo.findUnique({
    where: { IdVersionAvaluo: versionId },
    select: {
      avaluo: { select: { tipoInmueble: { select: { SClave: true } } } },
      enfoqueMaquinaria: { select: { NValorFisico: true, NValorMercado: true } },
    },
  });
  if (version?.avaluo.tipoInmueble.SClave === MACHINERY_PROPERTY_TYPE) {
    // An approach left out of the dictamen does not conclude: the equipment's market is left out with both markets for sale.
    const mercado = marketLeftOut(excluded) ? null : decimal(version.enfoqueMaquinaria?.NValorMercado);
    return {
      values: { costos: excluded.has("costos") ? null : decimal(version.enfoqueMaquinaria?.NValorFisico), mercado, ingresos: null },
      marketSource: mercado === null ? null : "MAQUINARIA_VENTA",
      excluded: excludedList,
    };
  }
  const [costs, markets, income] = await Promise.all([
    tx.enfoqueCosto.findUnique({ where: { IdVersionAvaluo: versionId }, select: { NValorFisicoTotal: true } }),
    tx.enfoqueMercado.findMany({
      where: { IdVersionAvaluo: versionId, tipoComparable: { SClave: { in: ["INMUEBLE_VENTA", "TERRENO_VENTA"] } } },
      select: { NValorMercado: true, tipoComparable: { select: { SClave: true } } },
    }),
    tx.enfoqueIngreso.findUnique({ where: { IdVersionAvaluo: versionId }, select: { NValorCapitalizacion: true } }),
  ]);
  const marketValue = (key: string) => decimal(markets.find((row) => row.tipoComparable.SClave === key && row.NValorMercado !== null)?.NValorMercado);
  // The market value comes from buildings, else from land, among the markets that stay in the dictamen.
  const { values, marketSource } = valuesForConclusion({
    costos: decimal(costs?.NValorFisicoTotal),
    ingresos: decimal(income?.NValorCapitalizacion),
    markets: { buildings: marketValue("INMUEBLE_VENTA"), land: marketValue("TERRENO_VENTA") },
  }, excluded);
  return { values, marketSource, excluded: excludedList };
}

async function load(tx: Tx, versionId: number) {
  const [summary, { values, marketSource, excluded }] = await Promise.all([
    tx.resumenValor.findUnique({ where: { IdVersionAvaluo: versionId } }),
    approachValues(tx, versionId),
  ]);
  const available = await availableValues(tx, versionId, new Set(excluded));
  const configuration = asRecord(summary?.JConfiguracion ?? null) as { method?: ConclusionMethod; rounding?: number | null; formulas?: unknown; summaryRows?: unknown };
  const summaryRows = storedSummaryRows(configuration.summaryRows);
  return {
    values,
    marketSource,
    excluded,
    available,
    ...(summaryRows ? { summaryRows } : {}),
    method: configuration.method ?? defaultMethod(values),
    justification: summary?.SJustificacion ?? null,
    ...(configuration.rounding === undefined ? {} : { rounding: configuration.rounding }),
    formulas: storedFormulas(configuration.formulas),
    configured: Boolean(configuration.method),
  };
}

export async function getConclusionCalculation(publicId: string, organizationId: number): Promise<ConclusionCalculationDto> {
  return prisma.$transaction(async (tx) => {
    const avaluo = await findValuation(tx, publicId, organizationId);
    const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
    if (!versionId) {
      const values = { costos: null, mercado: null, ingresos: null };
      return { values, marketSource: null, excluded: [], method: defaultMethod(values), justification: null, configured: false, locked: avaluo.BBloqueado };
    }
    return { ...(await load(tx, versionId)), locked: avaluo.BBloqueado };
  });
}

export async function saveConclusionSettings(publicId: string, user: AuthUser, payload: ConclusionSettingsPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const previous = await load(tx, versionId);
    const formulas = formulasOrThrow({
      next: payload,
      sent: payload.formulas,
      previous,
      previousFormulas: previous.formulas,
      percent: CONCLUSION_PERCENT_FIELDS,
    });
    // The resumen's rows change only when sent; an empty list lists the approaches as always.
    const summaryRows = payload.summaryRows ?? previous.summaryRows;
    const configuration = {
      method: payload.method,
      ...(payload.rounding === undefined ? {} : { rounding: payload.rounding }),
      formulas,
      ...(summaryRows?.length ? { summaryRows } : {}),
    };
    const data = { JConfiguracion: configuration as Prisma.InputJsonValue, SJustificacion: payload.justification };
    await tx.resumenValor.upsert({ where: { IdVersionAvaluo: versionId }, create: { IdVersionAvaluo: versionId, ...data }, update: data });
    await recomputeConclusion(tx, versionId);
  });
}

/** Stores each approach value and the concluded value, with the trace. */
export async function recomputeConclusion(tx: Tx, versionId: number) {
  const current = await load(tx, versionId);
  await tx.ejecucionCalculo.deleteMany({ where: { IdVersionAvaluo: versionId, SClaveCalculo: CALCULATION_KEY } });
  const trace = new Trace();
  const config = conclusionEngineConfig(current);
  const result = canConclude(current) ? concludeValue(conclusionInput(current), config, trace) : null;
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
      JValoresEntrada: conclusionInput(current) as unknown as Prisma.InputJsonValue,
      JValoresSalida: result as unknown as Prisma.InputJsonValue,
      SPoliticaRedondeo: JSON.stringify({ conclusion: config.rounding.conclusion }),
      BExitoso: true,
      resultados: {
        create: trace.steps.map((step, index) => ({ SClaveResultado: step.key.slice(0, 120), NValorNumerico: step.value, IOrden: index })),
      },
    },
  });
}
