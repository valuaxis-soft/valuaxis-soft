import { EMPTY_TITLE_FILLER } from "./block-title";

export function normalizeConceptTitle(title: string) {
  return title.replace(/[\s:]+$/g, "");
}

/**
 * The title as the dictamen prints it, with its colon. A title the appraiser
 * deleted comes back from the database as «Campo sin título» (its column
 * takes no empty text): it prints as no title, never «Campo sin título:» (FAL-31).
 */
export function formatConceptTitleWithColon(title: string) {
  const normalized = normalizeConceptTitle(title);
  if (normalized.trim() === EMPTY_TITLE_FILLER) return "";
  return normalized.trim() ? `${normalized}:` : "";
}
