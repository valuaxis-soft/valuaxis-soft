/**
 * Search of comparables for the market approach. The appraiser asks for a
 * zone; every available source answers with offers, and the ones chosen become
 * comparables of the valuation. Sources are independent: the firm's own base
 * today, listing portals later (see registry.ts).
 */
import type { ComparableInputPayload } from "../calculation/market-schemas";
import type { ComparableType } from "../calculation/market-types";

export type ComparableSearchQuery = {
  /** Zone, colonia, municipio or street, as the appraiser types it. */
  text: string;
  type: ComparableType;
  /** Area in m² and price (monthly rent for rent comparables); null leaves that side open. */
  areaMin: number | null;
  areaMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  limit: number;
};

/** What a source may know when it searches. It never receives more than its own tenant. */
export type ComparableSearchContext = {
  organizationId: number;
  /** The valuation the search is for: its own comparables are never an answer. */
  valuationId: number;
  /** Aborted when the source runs out of time; pass it to fetch. */
  signal: AbortSignal;
};

/** A comparable as a source found it: what the capture form takes, without factors (those depend on the subject). */
export type FoundComparable = Omit<ComparableInputPayload, "factors">;

export type ComparableSearchResult = {
  /** Identifies the result inside its source. */
  id: string;
  /** Where the source took it from, in words: "avalúo AV-2026-0012", a listing number. */
  origin: string | null;
  /** Day the offer was captured or published, YYYY-MM-DD. */
  capturedOn: string | null;
  photoCount: number;
  comparable: FoundComparable;
};

export interface ComparableSearchSource {
  /** Stable key: it travels to the browser and back when a result is added. */
  id: string;
  /** Name the appraiser sees on each result. */
  label: string;
  /** False while the source cannot answer (no account, no key): it is then left out, without an error. */
  isAvailable(context: ComparableSearchContext): boolean | Promise<boolean>;
  /** Results of the query's type, within its ranges, at most `query.limit`. */
  search(query: ComparableSearchQuery, context: ComparableSearchContext): Promise<ComparableSearchResult[]>;
}

/** A result with the source it came from. */
export type ComparableSearchHit = ComparableSearchResult & {
  /** Unique across sources. */
  key: string;
  sourceId: string;
  sourceLabel: string;
};

/** How each source that ran answered; a failed one does not hide the others. */
export type ComparableSourceStatus = { id: string; label: string; count: number; error: string | null };

export type ComparableSearchResponse = { results: ComparableSearchHit[]; sources: ComparableSourceStatus[] };
