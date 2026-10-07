import { ownBaseSource } from "./sources/own-base.source";
import type { ComparableSearchSource } from "./types";

/**
 * Every source the search asks, in the order their results break ties. A new
 * one (a listings portal) implements ComparableSearchSource in ./sources and
 * is added here; while its account is missing, its isAvailable answers false.
 */
export const comparableSearchSources: ComparableSearchSource[] = [ownBaseSource];
