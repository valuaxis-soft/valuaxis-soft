"use client";

/** The print rules of the dictamen being shown (services/print-version.ts); the current ones outside one. */
import { createContext, useContext, type ReactNode } from "react";

import { CURRENT_PRINT_VERSION } from "../services/print-version";

const PrintVersionContext = createContext(CURRENT_PRINT_VERSION);

export function PrintVersionProvider({ version, children }: { version: number; children?: ReactNode }) {
  return <PrintVersionContext.Provider value={version}>{children}</PrintVersionContext.Provider>;
}

export const usePrintVersion = () => useContext(PrintVersionContext);
