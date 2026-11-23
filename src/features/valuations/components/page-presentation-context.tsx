"use client";

/**
 * The page presentation of the document being shown (binding margin, title
 * bars): the preview, the external preview window and the dictamen read the
 * same choice through it.
 */
import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from "react";

import { documentPaletteVars } from "../services/document-palette";
import { DEFAULT_PAGE_PRESENTATION, type PagePresentation } from "../services/page-presentation";

const PagePresentationContext = createContext<PagePresentation>(DEFAULT_PAGE_PRESENTATION);

export function PagePresentationProvider({ presentation, children }: { presentation: PagePresentation; children?: ReactNode }) {
  return <PagePresentationContext.Provider value={presentation}>{children}</PagePresentationContext.Provider>;
}

/** How this document lays out its pages; the default outside a document. */
export const usePagePresentation = () => useContext(PagePresentationContext);

/**
 * The colours of this document as the CSS variables its root sets: the blues
 * it always printed, or its palette with the text and tints that go with it.
 */
export function useDocumentPaletteStyle(): CSSProperties {
  const { palette } = usePagePresentation();
  return useMemo(() => documentPaletteVars(palette) as CSSProperties, [palette]);
}
