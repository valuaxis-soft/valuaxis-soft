"use client";

/**
 * The number presentation of the document being shown, for every component
 * that writes a number: the editor, the preview, the external preview window
 * and the dictamen read the same choice through it.
 */
import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_NUMBER_PRESENTATION, type NumberPresentation } from "../services/number-presentation";

const NumberPresentationContext = createContext<NumberPresentation>(DEFAULT_NUMBER_PRESENTATION);

export function NumberPresentationProvider({ presentation, children }: { presentation: NumberPresentation; children?: ReactNode }) {
  return <NumberPresentationContext.Provider value={presentation}>{children}</NumberPresentationContext.Provider>;
}

/** How this document writes its numbers; the default outside a document. */
export const useNumberPresentation = () => useContext(NumberPresentationContext);
