/**
 * Preview Fixed-Module Renderer Registry
 *
 * Maps semantic fixed-module kinds to Preview-specific React components.
 *
 * This registry is PREVIEW-SPECIFIC:
 * - contains React components
 * - used only by Preview rendering path
 * - does NOT affect Editor or PDF
 *
 * Semantic kinds come from composition-registry.ts (React-free).
 * This registry resolves them to actual Preview renderers.
 */

import type { ComponentType } from "react";
import {
  CaratulaCoverModule,
  CaratulaAssumptionsModule,
  CaratulaConclusionModule,
} from "./caratula-preview-modules";
import { TerrainMainModule } from "./terreno-preview-modules";

/* ------------------------------------------------------------------ */
/*  Registry                                                            */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const previewModuleRegistry: Record<string, ComponentType<any>> = {
  "caratula-cover": CaratulaCoverModule,
  "caratula-assumptions": CaratulaAssumptionsModule,
  "caratula-conclusion": CaratulaConclusionModule,
  "terreno-main": TerrainMainModule,
};

/**
 * Resolve a semantic fixed-module kind to its Preview renderer.
 * Returns undefined if no renderer is registered for the kind.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPreviewFixedModule(
  kind: string,
): ComponentType<any> | undefined {
  return previewModuleRegistry[kind];
}
