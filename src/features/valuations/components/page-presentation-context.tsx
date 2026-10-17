"use client";

/**
 * The page presentation of the document being shown (binding margin, title
 * bars): the preview, the external preview window and the dictamen read the
 * same choice through it.
 */
import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_PAGE_PRESENTATION, type PagePresentation } from "../services/page-presentation";

const PagePresentationContext = createContext<PagePresentation>(DEFAULT_PAGE_PRESENTATION);

export function PagePresentationProvider({ presentation, children }: { presentation: PagePresentation; children?: ReactNode }) {
  return <PagePresentationContext.Provider value={presentation}>{children}</PagePresentationContext.Provider>;
}

/** How this document lays out its pages; the default outside a document. */
export const usePagePresentation = () => useContext(PagePresentationContext);
