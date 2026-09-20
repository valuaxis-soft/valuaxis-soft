/**
 * Canonical document presentation theme for the appraisal report Preview.
 *
 * Two variants control ONLY visual presentation:
 *   - "caratula"  → compact, restrained blue hierarchy, thin rules
 *   - "standard"  → formal report: dark blue bars, dense typography
 *
 * The variant MUST NOT control element order, ownership, row creation,
 * columns, DnD, persistence, numbering data, or visibility logic.
 */

import { createContext, useContext, type ReactNode } from "react";

/* ── Variant type ──────────────────────────────────────────────── */
export type DocumentThemeVariant = "caratula" | "standard";

/* ── Token shape ───────────────────────────────────────────────── */
export interface DocumentThemeTokens {
  /** Block / Sección title */
  sectionTitle: string;
  /** Apartado / Sub-section title (typography only — no border) */
  apartadoTitle: string;
  /** Apartado blue rule beneath title — fixed-width decorative element */
  apartadoRule: string;
  /** Concept label text */
  conceptLabel: string;
  /** Concept value text */
  conceptValue: string;
  /** Grid for label + value row */
  conceptRowGrid: string;
  /** Wrapper for a ContentLayoutV2 row */
  contentRow: string;
  /** Gap between blocks in a page */
  sectionGap: string;
  /** Page content padding */
  pagePadding: string;
}

/* ── Carátula variant ──────────────────────────────────────────── */
const CARATULA_THEME: DocumentThemeTokens = {
  sectionTitle:
    "mb-1 border-b border-[#00285A]/30 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-[#00285A]",
  apartadoTitle:
    "mb-1 text-[11px] font-semibold uppercase text-[#2F5495]",
  apartadoRule:
    "mb-1 h-[2px] w-[300px] bg-[#2F5495]",
  conceptLabel:
    "min-w-0 text-[10px] font-medium text-[#1a1a1a] leading-snug",
  conceptValue:
    "min-w-0 text-[10px] text-[#333333] whitespace-pre-wrap break-words leading-snug",
  conceptRowGrid:
    "grid min-w-0 w-full max-w-full grid-cols-[minmax(130px,0.9fr)_minmax(0,1.1fr)] gap-x-3 gap-y-0 items-start",
  contentRow: "mt-2 grid gap-1",
  sectionGap: "space-y-2",
  pagePadding: "px-5 pb-7 pt-3 sm:px-8",
};

/* ── Standard variant ──────────────────────────────────────────── */
const STANDARD_THEME: DocumentThemeTokens = {
  sectionTitle:
    "mb-2 bg-[#00285A] px-3 py-1.5 text-center text-[12px] font-black uppercase leading-tight text-white",
  apartadoTitle:
    "mb-1 text-[11px] font-bold uppercase text-[#2F5495]",
  apartadoRule:
    "mb-1 h-[2px] w-[300px] bg-[#2F5495]",
  conceptLabel:
    "min-w-0 text-[11px] font-semibold text-[#1a1a1a] leading-snug",
  conceptValue:
    "min-w-0 text-[11px] text-[#333333] whitespace-pre-wrap break-words leading-snug",
  conceptRowGrid:
    "grid min-w-0 w-full max-w-full grid-cols-[minmax(160px,0.9fr)_minmax(0,1.1fr)] gap-x-4 gap-y-0 items-start",
  contentRow: "mt-1.5 grid gap-1",
  sectionGap: "space-y-4",
  pagePadding: "px-5 pb-10 pt-3 sm:px-8",
};

/* ── Theme map ─────────────────────────────────────────────────── */
const THEMES: Record<DocumentThemeVariant, DocumentThemeTokens> = {
  caratula: CARATULA_THEME,
  standard: STANDARD_THEME,
};

/* ── React context ─────────────────────────────────────────────── */
const DocumentThemeContext = createContext<DocumentThemeTokens>(STANDARD_THEME);

export function DocumentThemeProvider({
  variant,
  children,
}: {
  variant: DocumentThemeVariant;
  children: ReactNode;
}) {
  return (
    <DocumentThemeContext.Provider value={THEMES[variant]}>
      {children}
    </DocumentThemeContext.Provider>
  );
}

/**
 * Hook to consume the current document theme tokens.
 * Must be used inside a <DocumentThemeProvider>.
 */
export function useDocumentTheme(): DocumentThemeTokens {
  return useContext(DocumentThemeContext);
}
