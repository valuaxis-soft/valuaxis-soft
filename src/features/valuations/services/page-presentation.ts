/**
 * How the pages of a document are laid out: the left margin for binding, the
 * style of the title bars of its blocks and of the document's title band
 * ("DICTAMEN VALUATORIO") under the page header. One choice for the whole
 * document, kept on its carátula section like the thousands separator.
 *
 * Pure TypeScript — no React, no side effects.
 */
import type { AppSection } from "../model";
import { DOCUMENT_SETTINGS_SECTION_ID } from "./number-presentation";

/** "normal" keeps the page as always; "wide" leaves 1.5 cm more on the left for binding. */
export type BindingMargin = "normal" | "wide";

/** "filled" prints the blue bars; "outline" dark text over a thin rule, without the fill. */
export type TitleBarStyle = "filled" | "outline";

/**
 * "filled" prints the band in dark blue with white letters; "outline" white
 * with blue letters and a blue line between the page header and the band, as
 * the appraiser's Excel (20 Oct 2026).
 */
export type TitleBandStyle = "filled" | "outline";

export type PagePresentation = {
  bindingMargin: BindingMargin;
  titleBars: TitleBarStyle;
  titleBand: TitleBandStyle;
};

/** What a document prints until the appraiser chooses: as documents always printed. */
export const DEFAULT_PAGE_PRESENTATION: PagePresentation = { bindingMargin: "normal", titleBars: "filled", titleBand: "filled" };

/** Room added to the left of every page, in document pixels (96 per inch): 1.5 cm for "wide". */
export const BINDING_MARGIN_EXTRA_PX: Record<BindingMargin, number> = { normal: 0, wide: 57 };

export const isBindingMargin = (value: unknown): value is BindingMargin => value === "normal" || value === "wide";
export const isTitleBarStyle = (value: unknown): value is TitleBarStyle => value === "filled" || value === "outline";
export const isTitleBandStyle = (value: unknown): value is TitleBandStyle => value === "filled" || value === "outline";

/** The page presentation a document chose, read from its carátula section; the default for what it did not choose. */
export function documentPagePresentation(sections: ReadonlyArray<Pick<AppSection, "id" | "bindingMargin" | "titleBars" | "titleBand">>): PagePresentation {
  const cover = sections.find((section) => section.id === DOCUMENT_SETTINGS_SECTION_ID) ?? sections[0];
  return {
    bindingMargin: isBindingMargin(cover?.bindingMargin) ? cover.bindingMargin : DEFAULT_PAGE_PRESENTATION.bindingMargin,
    titleBars: isTitleBarStyle(cover?.titleBars) ? cover.titleBars : DEFAULT_PAGE_PRESENTATION.titleBars,
    titleBand: isTitleBandStyle(cover?.titleBand) ? cover.titleBand : DEFAULT_PAGE_PRESENTATION.titleBand,
  };
}
