/**
 * Loads what the calculation memory shows: the version the dictamen prints
 * (working, or final once concluded), its calculations as the editor's panels
 * read them, and the engine runs the server stored for that version. Every
 * read is scoped to the user's organization; another's valuation is not found.
 */
import type { AuthUser } from "@/features/auth/model";
import { getLetterhead } from "@/features/firm/firm.service";
import { getDocumentHeaderImage } from "@/features/files/services/valuation-document-header-image";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getConclusionCalculation } from "../calculation/conclusion.service";
import { getCostCalculation } from "../calculation/cost.service";
import { getIncomeCalculation } from "../calculation/income.service";
import { getMachineryCalculation } from "../calculation/machinery.service";
import { getMarketCalculation } from "../calculation/market.service";
import { COMPARABLE_TYPES } from "../calculation/market-types";
import { caratulaFromValuation, initialMetaFor, initialSectionsFor, mergeDocumentHeaderImage } from "../components/workspace/model/initial-hydration";
import { getValuationByPublicId } from "../repositories/valuation.repository";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";
import { buildCalculationMemory, type StoredRun } from "./calculation-memory";

async function storedRuns(publicId: string, organizationId: number): Promise<StoredRun[]> {
  const avaluo = await prisma.avaluo.findFirst({
    where: { UIdentificadorPublico: publicId, IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null },
    select: { IdVersionTrabajo: true, IdVersionFinal: true },
  });
  const versionId = avaluo?.IdVersionTrabajo ?? avaluo?.IdVersionFinal;
  if (!versionId) return [];
  const runs = await prisma.ejecucionCalculo.findMany({
    where: { IdVersionAvaluo: versionId, SClaveCalculo: { startsWith: "MOTOR." }, BExitoso: true },
    select: { SClaveCalculo: true, SVersionCalculo: true, resultados: { select: { SClaveResultado: true, NValorNumerico: true } } },
    orderBy: { DFechaEjecucion: "desc" },
  });
  const byKey = new Map<string, StoredRun>();
  for (const run of runs) {
    if (byKey.has(run.SClaveCalculo)) continue;
    byKey.set(run.SClaveCalculo, {
      key: run.SClaveCalculo,
      version: run.SVersionCalculo,
      results: Object.fromEntries(run.resultados.map((row) => [row.SClaveResultado, row.NValorNumerico === null ? null : Number(row.NValorNumerico)])),
    });
  }
  return [...byKey.values()];
}

/** The memory of a valuation of the user's organization, with what its header prints. */
export async function loadCalculationMemory(user: AuthUser, publicId: string, generatedAt = new Date()) {
  const valuation = await getValuationByPublicId(publicId, user.organizationId);
  if (!valuation) throw new ValuationWorkflowError("Avalúo no encontrado", 404);

  const [letterhead, headerImage, markets, cost, income, machinery, conclusion, stored] = await Promise.all([
    getLetterhead(user.organizationId),
    // The header prints without the valuation's own image when it cannot be read.
    getDocumentHeaderImage(user, publicId).catch(() => null),
    Promise.all(COMPARABLE_TYPES.map((type) => getMarketCalculation(publicId, user.organizationId, type))),
    getCostCalculation(publicId, user.organizationId),
    getIncomeCalculation(publicId, user.organizationId),
    getMachineryCalculation(publicId, user.organizationId),
    getConclusionCalculation(publicId, user.organizationId),
    storedRuns(publicId, user.organizationId),
  ]);

  const sections = mergeDocumentHeaderImage(initialSectionsFor(valuation), headerImage);
  const meta = initialMetaFor(valuation);
  const caratula = caratulaFromValuation(valuation, meta, sections);
  const memory = buildCalculationMemory({
    sections,
    calculations: { markets, cost, income, machinery, conclusion },
    stored,
    folio: caratula.folio || meta.folio,
    valuationDate: caratula.fechaAvaluo,
    firmName: letterhead.legalName?.trim() || letterhead.name,
    concluded: valuation.locked,
    generatedAt,
  });
  return { memory, sections, caratula, letterhead, propertyKind: valuation.propertyKind };
}
