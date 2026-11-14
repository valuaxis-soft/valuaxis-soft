/**
 * The live formulas of the calculation panels follow the document
 * (services/live-formulas.ts): after the document is saved, every panel field
 * whose formula reads a concept or a cell is read again against it, and a
 * capture whose values changed is saved again through its own service, which
 * checks it, recomputes the approach and chains what depends on it (market →
 * costs and income → conclusion). A reference deleted or circular keeps its
 * last value; the panel says why.
 *
 * Only versions with live formulas pay for it: the captures are first looked
 * at for a reference, and the document is loaded only then. It never makes
 * the document save fail: a capture that cannot be saved again is left as it
 * was and logged.
 */
import type { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { initialSectionsFor } from "../components/workspace/model/initial-hydration";
import { getValuationByPublicId } from "../repositories/valuation.repository";
import { buildFormulaIndex, type FormulaIndex } from "../services/formula-references";
import {
  followComparableFormulas,
  followStatisticalFormulas,
  hasLiveReferences,
  resolveCaptureFormulas,
  withValueAtPath,
  type LiveFormulaOwner,
} from "../services/live-formulas";
import { asRecord } from "./access";
import { storedFormulas, type CapturedFormulas, type PercentFields } from "./captured-formulas";
import { getConclusionCalculation, saveConclusionSettings } from "./conclusion.service";
import { conclusionSettingsSchema } from "./conclusion-schemas";
import { CONCLUSION_PERCENT_FIELDS } from "./conclusion-types";
import { getConstructionTypes, saveConstructionTypes } from "./construction-types.service";
import { getCostCalculation, saveCostCalculation } from "./cost.service";
import { constructionTypesSchema, costInputSchema } from "./cost-schemas";
import { COST_PERCENT_FIELDS } from "./cost-types";
import { getIncomeCalculation, saveIncomeCalculation } from "./income.service";
import { incomeInputSchema } from "./income-schemas";
import { INCOME_PERCENT_FIELDS } from "./income-types";
import { getMachineryCalculation, saveMachineryCalculation } from "./machinery.service";
import { machineryInputSchema } from "./machinery-schemas";
import { getMarketCalculation, saveMarketSettings, updateComparable } from "./market.service";
import { comparableInputSchema, marketSettingsSchema } from "./market-schemas";
import { COMPARABLE_TYPES, comparableFormValues, type ComparableType } from "./market-types";
import { getStatisticalCalculation, saveStatisticalCalculation } from "./statistical.service";
import { statisticalInputSchema } from "./statistical-schemas";

const liveIn = (formulas: unknown) => Object.values(storedFormulas(formulas)).some(hasLiveReferences);

/** The captures of the version that hold a live formula, by the calculation they belong to. */
async function capturesWithLiveFormulas(versionId: number): Promise<Set<LiveFormulaOwner>> {
  const [cost, constructions, income, conclusion, markets, machinery, comparables, statistical] = await Promise.all([
    prisma.enfoqueCosto.findUnique({ where: { IdVersionAvaluo: versionId }, select: { JConfiguracion: true } }),
    prisma.construccionAvaluo.findMany({ where: { IdVersionAvaluo: versionId }, select: { JDatosAdicionales: true } }),
    prisma.enfoqueIngreso.findUnique({ where: { IdVersionAvaluo: versionId }, select: { JConfiguracion: true } }),
    prisma.resumenValor.findUnique({ where: { IdVersionAvaluo: versionId }, select: { JConfiguracion: true } }),
    prisma.enfoqueMercado.findMany({ where: { IdVersionAvaluo: versionId }, select: { JConfiguracion: true, tipoComparable: { select: { SClave: true } } } }),
    prisma.enfoqueMaquinaria.findUnique({ where: { IdVersionAvaluo: versionId }, select: { JCostos: true, JMercado: true } }),
    prisma.comparableAvaluo.findMany({ where: { IdVersionAvaluo: versionId, BIncluido: true }, select: { JPropiedadSnapshot: true, tipoComparable: { select: { SClave: true } } } }),
    prisma.metodoEstadistico.findMany({ where: { IdVersionAvaluo: versionId }, select: { STipoComparable: true, JConfiguracion: true, JComparables: true } }),
  ]);
  const formulasOf = (json: Prisma.JsonValue | null | undefined, key = "formulas") => asRecord(json ?? null)[key];
  const owners = new Set<LiveFormulaOwner>();
  for (const market of markets) {
    const type = market.tipoComparable.SClave as ComparableType;
    if (COMPARABLE_TYPES.includes(type) && liveIn(formulasOf(market.JConfiguracion))) owners.add(`MERCADO:${type}`);
  }
  // The comparables' cards, characteristics and homologation factors keep theirs with the property.
  for (const comparable of comparables) {
    const type = comparable.tipoComparable.SClave as ComparableType;
    if (COMPARABLE_TYPES.includes(type) && liveIn(formulasOf(comparable.JPropiedadSnapshot))) owners.add(`MERCADO:${type}`);
  }
  // The alternative methods keep each formula as the value typed: any tag in the apartado is one.
  for (const row of statistical) {
    const type = row.STipoComparable as ComparableType;
    if (COMPARABLE_TYPES.includes(type) && hasLiveReferences(JSON.stringify([row.JConfiguracion, row.JComparables]))) owners.add(`ESTADISTICO:${type}`);
  }
  if (constructions.some((row) => liveIn(formulasOf(row.JDatosAdicionales, "typeFormulas")))) owners.add("CONSTRUCCIONES");
  if (liveIn(formulasOf(cost?.JConfiguracion))) owners.add("COSTOS");
  if (liveIn(formulasOf(income?.JConfiguracion))) owners.add("INGRESOS");
  if (liveIn(formulasOf(machinery?.JCostos)) || liveIn(formulasOf(machinery?.JMercado))) owners.add("MAQUINARIA");
  if (liveIn(formulasOf(conclusion?.JConfiguracion))) owners.add("CONCLUSION");
  return owners;
}

/** A capture with its formulas read again: null when no value changed. */
function followed<T extends object>(capture: T, formulas: CapturedFormulas | undefined, index: FormulaIndex, owner: LiveFormulaOwner, percent?: PercentFields) {
  if (!formulas || !Object.values(formulas).some(hasLiveReferences)) return null;
  const update = resolveCaptureFormulas(formulas, index, owner, percent);
  const changes = Object.entries(update.values);
  if (!changes.length) return null;
  const next = changes.reduce((current, [path, value]) => withValueAtPath(current, path, value), capture);
  return { ...next, formulas: update.formulas };
}

/**
 * Reads the live formulas of the valuation's working version again against
 * its document and saves the captures whose values changed. Returns the
 * calculations saved again, for the editor to bring their pages up to date.
 */
export async function refreshLiveFormulas(publicId: string, user: AuthUser): Promise<LiveFormulaOwner[]> {
  try {
    return await followLiveFormulas(publicId, user);
  } catch (error) {
    console.error("[LIVE_FORMULAS] No se pudieron leer las fórmulas", { publicId, error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

async function followLiveFormulas(publicId: string, user: AuthUser): Promise<LiveFormulaOwner[]> {
  const avaluo = await prisma.avaluo.findFirst({
    where: { UIdentificadorPublico: publicId, IdOrganizacion: user.organizationId, BActivo: true, DFechaEliminacion: null },
    select: { IdVersionTrabajo: true, BBloqueado: true },
  });
  if (!avaluo?.IdVersionTrabajo || avaluo.BBloqueado) return [];
  const owners = await capturesWithLiveFormulas(avaluo.IdVersionTrabajo);
  if (!owners.size) return [];

  const valuation = await getValuationByPublicId(publicId, user.organizationId);
  if (!valuation) return [];
  const index = buildFormulaIndex(initialSectionsFor(valuation));
  const organizationId = user.organizationId;
  const saved: LiveFormulaOwner[] = [];
  /** Saves a capture again through its service; one that fails is left as it was. */
  const attempt = async (owner: LiveFormulaOwner, run: () => Promise<boolean>) => {
    try {
      if (await run()) saved.push(owner);
    } catch (error) {
      console.error("[LIVE_FORMULAS] No se pudo actualizar", { publicId, owner, error: error instanceof Error ? error.message : String(error) });
    }
  };

  // In the order the server chains them: markets, construction types, costs, income, machinery, conclusion.
  for (const type of COMPARABLE_TYPES) {
    if (!owners.has(`MERCADO:${type}`)) continue;
    await attempt(`MERCADO:${type}`, async () => {
      const market = await getMarketCalculation(publicId, organizationId, type);
      // Each comparable whose card, characteristics or factors read the document is saved as its card does (it recomputes the market).
      let comparables = 0;
      for (const comparable of market.comparables) {
        const next = followComparableFormulas(comparable, index, `MERCADO:${type}`);
        if (!next) continue;
        await updateComparable(publicId, user, comparable.id, comparableInputSchema.parse(comparableFormValues(next)));
        comparables += 1;
      }
      const next = market.configured ? followed(market.settings, market.settings.formulas, index, `MERCADO:${type}`) : null;
      if (next) await saveMarketSettings(publicId, user, marketSettingsSchema.parse(next));
      return Boolean(next) || comparables > 0;
    });
  }
  // After the markets, which they compare with.
  for (const type of COMPARABLE_TYPES) {
    if (!owners.has(`ESTADISTICO:${type}`)) continue;
    await attempt(`ESTADISTICO:${type}`, async () => {
      const statistical = await getStatisticalCalculation(publicId, organizationId, type);
      const next = statistical.configured ? followStatisticalFormulas({ settings: statistical.settings, comparables: statistical.comparables }, index, `ESTADISTICO:${type}`) : null;
      if (next) await saveStatisticalCalculation(publicId, user, statisticalInputSchema.parse(next));
      return Boolean(next);
    });
  }
  if (owners.has("CONSTRUCCIONES")) {
    await attempt("CONSTRUCCIONES", async () => {
      const types = await getConstructionTypes(publicId, organizationId);
      const next = followed({ types: types.types }, types.formulas, index, "CONSTRUCCIONES");
      if (next) await saveConstructionTypes(publicId, user, constructionTypesSchema.parse(next));
      return Boolean(next);
    });
  }
  if (owners.has("COSTOS")) {
    await attempt("COSTOS", async () => {
      const cost = await getCostCalculation(publicId, organizationId);
      const next = cost.configured ? followed(cost, cost.formulas, index, "COSTOS", COST_PERCENT_FIELDS) : null;
      if (next) await saveCostCalculation(publicId, user, costInputSchema.parse(next));
      return Boolean(next);
    });
  }
  if (owners.has("INGRESOS")) {
    await attempt("INGRESOS", async () => {
      const income = await getIncomeCalculation(publicId, organizationId);
      const next = income.configured ? followed(income, income.formulas, index, "INGRESOS", INCOME_PERCENT_FIELDS) : null;
      if (next) await saveIncomeCalculation(publicId, user, incomeInputSchema.parse(next));
      return Boolean(next);
    });
  }
  if (owners.has("MAQUINARIA")) {
    await attempt("MAQUINARIA", async () => {
      const machinery = await getMachineryCalculation(publicId, organizationId);
      const cost = machinery.configured.cost ? followed(machinery.cost, machinery.cost.formulas, index, "MAQUINARIA") : null;
      const market = machinery.configured.market ? followed(machinery.market, machinery.market.formulas, index, "MAQUINARIA") : null;
      if (cost || market) await saveMachineryCalculation(publicId, user, machineryInputSchema.parse({ ...(cost ? { cost } : {}), ...(market ? { market } : {}) }));
      return Boolean(cost || market);
    });
  }
  if (owners.has("CONCLUSION")) {
    await attempt("CONCLUSION", async () => {
      const conclusion = await getConclusionCalculation(publicId, organizationId);
      const next = conclusion.configured ? followed(conclusion, conclusion.formulas, index, "CONCLUSION", CONCLUSION_PERCENT_FIELDS) : null;
      if (next) await saveConclusionSettings(publicId, user, conclusionSettingsSchema.parse(next));
      return Boolean(next);
    });
  }
  return saved;
}
