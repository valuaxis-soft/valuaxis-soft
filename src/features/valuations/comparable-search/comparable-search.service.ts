/**
 * The search as the API uses it: it finds the valuation in the user's
 * organization, asks the sources, and turns the chosen results into
 * comparables through the same path as the Excel import.
 */
import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { findValuation } from "../calculation/access";
import { getMarketCalculation, importComparables } from "../calculation/market.service";
import type { ComparableType } from "../calculation/market-types";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";
import { identityKeys, withProvenance } from "./normalize";
import { runComparableSearch } from "./orchestrator";
import { comparableSearchSources } from "./registry";
import type { AddFoundComparablesPayload } from "./schemas";
import type { ComparableSearchQuery, ComparableSearchResponse } from "./types";

export async function searchComparables(
  publicId: string,
  user: Pick<AuthUser, "organizationId">,
  query: ComparableSearchQuery,
): Promise<ComparableSearchResponse> {
  // Not found unless the valuation is of the user's organization: the search never starts for another tenant.
  const avaluo = await findValuation(prisma, publicId, user.organizationId);
  const current = await getMarketCalculation(publicId, user.organizationId, query.type);
  return runComparableSearch(
    comparableSearchSources,
    query,
    { organizationId: user.organizationId, valuationId: avaluo.IdAvaluo },
    { existing: current.comparables },
  );
}

/**
 * Adds the chosen results as comparables of the valuation, each with the note
 * of where it was found. Offers the valuation already has are skipped.
 */
export async function addFoundComparables(
  publicId: string,
  user: AuthUser,
  type: ComparableType,
  payload: AddFoundComparablesPayload,
) {
  const current = await getMarketCalculation(publicId, user.organizationId, type);
  if (current.locked) throw new ValuationWorkflowError("El avalúo está concluido; reábrelo para editarlo.", 409);
  const seen = new Set(current.comparables.flatMap(identityKeys));
  const comparables = payload.results.flatMap((result) => {
    const source = comparableSearchSources.find((item) => item.id === result.sourceId);
    if (!source) throw new ValuationWorkflowError("La fuente del comparable no existe.", 400);
    const keys = identityKeys(result.comparable);
    if (keys.some((key) => seen.has(key))) return [];
    for (const key of keys) seen.add(key);
    return [{ ...withProvenance(result.comparable, source.label, result.origin), factors: [] }];
  });
  if (comparables.length) await importComparables(publicId, user, type, comparables);
  return { added: comparables.length, skipped: payload.results.length - comparables.length };
}
