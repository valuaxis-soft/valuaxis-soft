/**
 * Runs a search on every available source at once. Each source has its own
 * time limit and its own failure: one that breaks or takes too long is
 * reported next to the results of the others, and never fails the search.
 */
import { rankAndDeduplicate, withinRanges } from "./normalize";
import { foundComparableSchema } from "./schemas";
import type {
  ComparableSearchContext,
  ComparableSearchHit,
  ComparableSearchQuery,
  ComparableSearchResponse,
  ComparableSearchSource,
  ComparableSourceStatus,
  FoundComparable,
} from "./types";

export const SOURCE_TIMEOUT_MS = 8_000;

class SourceTimeoutError extends Error {}

type Options = {
  timeoutMs?: number;
  /** Comparables the valuation already has: they are not offered again. */
  existing?: Pick<FoundComparable, "location" | "area" | "price" | "url">[];
  /** Where the real error of a failed source goes; the appraiser only reads that it failed. */
  onError?: (sourceId: string, error: unknown) => void;
};

type SourceOutcome = { status: ComparableSourceStatus; hits: ComparableSearchHit[] } | null;

async function runSource(
  source: ComparableSearchSource,
  query: ComparableSearchQuery,
  base: Omit<ComparableSearchContext, "signal">,
  options: Required<Pick<Options, "timeoutMs" | "onError">>,
): Promise<SourceOutcome> {
  const controller = new AbortController();
  const context = { ...base, signal: controller.signal };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SourceTimeoutError()), options.timeoutMs);
  });
  try {
    const found = await Promise.race([
      (async () => ((await source.isAvailable(context)) ? source.search(query, context) : null))(),
      timeout,
    ]);
    if (found === null) return null;
    // A source answers in the shape the capture form accepts, or its result is not offered.
    const hits = found.flatMap((result): ComparableSearchHit[] => {
      const comparable = foundComparableSchema.safeParse(result.comparable);
      if (!comparable.success || !withinRanges(query, comparable.data)) return [];
      return [{ ...result, comparable: comparable.data, key: `${source.id}:${result.id}`, sourceId: source.id, sourceLabel: source.label }];
    });
    return { status: { id: source.id, label: source.label, count: hits.length, error: null }, hits };
  } catch (error) {
    controller.abort();
    if (!(error instanceof SourceTimeoutError)) options.onError(source.id, error);
    const message = error instanceof SourceTimeoutError ? "No respondió a tiempo." : "No se pudo consultar.";
    return { status: { id: source.id, label: source.label, count: 0, error: message }, hits: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function runComparableSearch(
  sources: ComparableSearchSource[],
  query: ComparableSearchQuery,
  context: Omit<ComparableSearchContext, "signal">,
  options: Options = {},
): Promise<ComparableSearchResponse> {
  const settings = {
    timeoutMs: options.timeoutMs ?? SOURCE_TIMEOUT_MS,
    onError: options.onError ?? ((sourceId: string, error: unknown) => console.error(`[COMPARABLE_SEARCH] ${sourceId}`, error)),
  };
  const outcomes = (await Promise.all(sources.map((source) => runSource(source, query, context, settings))))
    .filter((outcome) => outcome !== null);
  const results = rankAndDeduplicate(query.text, outcomes.flatMap((outcome) => outcome.hits), options.existing).slice(0, query.limit);
  return {
    results,
    // What each source contributed to the list shown, after duplicates.
    sources: outcomes.map(({ status }) => ({ ...status, count: results.filter((hit) => hit.sourceId === status.id).length })),
  };
}
