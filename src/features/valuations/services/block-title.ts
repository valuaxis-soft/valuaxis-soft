/**
 * Whether the title of a block or a subbloque is printed (video 7.1, 0:29 and
 * 1:28): the appraiser can leave it empty, or keep it in the editor and
 * choose «Imprimir título: no». Either way the dictamen prints no heading for
 * it: no «NO SE PROPORCIONÓ», no bar or frame with nothing inside, and the
 * block takes no number.
 *
 * Pure TypeScript — no React, no side effects.
 */
import { stripLeadingRomanNumeral } from "../components/datos-generales-display";

/** What the title of a block or a subbloque needs to say whether it prints. */
export type TitledContainer = { title: string; titleHidden?: boolean };

/**
 * What the database keeps for an empty title, as its column takes none: read
 * back, it is an empty title, not a title the appraiser wrote.
 */
export const EMPTY_TITLE_FILLER = "Campo sin título";

/** The title as the appraiser wrote it, without the roman numeral the dictamen adds. */
export function blockTitleText(title: string) {
  return stripLeadingRomanNumeral(title ?? "").trim();
}

/** Whether the dictamen prints the title: written, and not turned off with «Imprimir título». */
export function titlePrints(container: TitledContainer) {
  return container.titleHidden !== true && blockTitleText(container.title) !== "";
}

/** A title read from the database: the filler an empty title was saved with reads as empty again. */
export function savedTitle(title: string) {
  return title.trim().toLowerCase() === EMPTY_TITLE_FILLER.toLowerCase() ? "" : title;
}
