/**
 * AppSection Composition Registry
 *
 * Declares the semantic composition of each AppSection.
 *
 * Each section may optionally define:
 * - fixedModules: semantic descriptors for fixed/semantic zones
 * - sequence: full document order including fixed modules and editable slots
 *
 * If fixedModules is absent or empty:
 * - the section has NO fixed zone
 * - its document/editor behavior is the canonical editable zone
 *
 * This registry is SURFACE-AGNOSTIC:
 * - no React components
 * - no Preview JSX
 * - no Editor JSX
 * - no PDF renderer references
 *
 * Surface-specific registries (editor, preview, PDF) will map
 * semantic kinds to actual renderers later.
 */

import type { ValuationSectionKey } from "./section-registry";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type FixedModuleDescriptor = {
  /** Unique identifier for this fixed module within the section */
  id: string;
  /** Semantic kind — surface registries map this to actual renderers */
  kind: string;
};

/** A step in the document sequence: either a fixed module or an editable zone slot */
export type CompositionSequenceItem =
  | { type: "fixed"; kind: string }
  | { type: "editable" };

export type AppSectionComposition = {
  /** Canonical section key */
  sectionKey: ValuationSectionKey;
  /** Fixed semantic modules in deterministic order. Absent = no fixed zone. */
  fixedModules?: FixedModuleDescriptor[];
  /**
   * Full document sequence including fixed modules and editable slots.
   * When absent, the section renders as pure editable zone.
   * When present, it defines the exact interleaving of fixed and editable content.
   */
  sequence?: CompositionSequenceItem[];
};

/* ------------------------------------------------------------------ */
/*  Registry                                                            */
/* ------------------------------------------------------------------ */

const compositionRegistry: AppSectionComposition[] = [
  {
    sectionKey: "CARATULA",
    fixedModules: [
      { id: "cover-main", kind: "caratula-cover" },
      { id: "assumptions", kind: "caratula-assumptions" },
      { id: "conclusion", kind: "caratula-conclusion" },
    ],
    sequence: [
      { type: "fixed", kind: "caratula-cover" },
      { type: "editable" },
      { type: "fixed", kind: "caratula-assumptions" },
      { type: "fixed", kind: "caratula-conclusion" },
    ],
  },
  {
    sectionKey: "TERRENO",
    fixedModules: [
      { id: "terrain-main", kind: "terreno-main" },
    ],
    sequence: [
      { type: "fixed", kind: "terreno-main" },
      { type: "editable" },
    ],
  },
  // DATOS_GENERALES, CONSTRUCCION, and all other sections:
  // no fixedZone field → canonical editable zone only
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const compositionByKey = new Map<ValuationSectionKey, AppSectionComposition>(
  compositionRegistry.map((c) => [c.sectionKey, c]),
);

/**
 * Get the composition definition for a section.
 * Returns undefined if no explicit composition exists (canonical editable zone).
 */
export function getSectionComposition(
  sectionKey: ValuationSectionKey,
): AppSectionComposition | undefined {
  return compositionByKey.get(sectionKey);
}

/**
 * Get fixed modules for a section.
 * Returns empty array if no fixed zone exists.
 */
export function getFixedModules(
  sectionKey: ValuationSectionKey,
): FixedModuleDescriptor[] {
  return compositionByKey.get(sectionKey)?.fixedModules ?? [];
}

/**
 * Get the document sequence for a section.
 * Returns undefined if no sequence exists (canonical editable zone).
 */
export function getCompositionSequence(
  sectionKey: ValuationSectionKey,
): CompositionSequenceItem[] | undefined {
  return compositionByKey.get(sectionKey)?.sequence;
}

/**
 * Check whether a section has a fixed semantic zone.
 */
export function hasFixedZone(sectionKey: ValuationSectionKey): boolean {
  const modules = getFixedModules(sectionKey);
  return modules.length > 0;
}
