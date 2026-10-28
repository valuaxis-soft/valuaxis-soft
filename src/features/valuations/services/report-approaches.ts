/**
 * "Agregar al informe valuatorio": each approach of the valuation can be left
 * out of the dictamen. An approach left out does not print (its section, or
 * its pages when the section holds another approach too) and does not enter
 * the conclusion. The choice is kept on the approach's own section
 * (`excludedFromReport`), so the document carries it and the server reads it
 * from the saved document when it concludes.
 */
import type { Approach } from "@/features/valuations/engine/conclusion";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";

export type ReportApproach = "costos" | "mercado-inmuebles" | "mercado-terrenos" | "mercado-rentas" | "ingresos";

export const REPORT_APPROACHES: readonly ReportApproach[] = ["costos", "mercado-inmuebles", "mercado-terrenos", "mercado-rentas", "ingresos"];

export const REPORT_APPROACH_LABELS: Record<ReportApproach, string> = {
  costos: "Enfoque de costos",
  "mercado-inmuebles": "Mercado de venta de inmuebles",
  "mercado-terrenos": "Mercado de venta de terrenos",
  "mercado-rentas": "Mercado de rentas",
  ingresos: "Enfoque de ingresos",
};

/** The approaches each section holds, by its registry key. */
const SECTION_APPROACHES: Record<string, readonly ReportApproach[]> = {
  COSTOS: ["costos"],
  MERCADO_VENTA: ["mercado-inmuebles", "mercado-terrenos"],
  MERCADO_RENTAS: ["mercado-rentas"],
  INGRESOS: ["ingresos"],
};

/** The pages the calculation writes for each market, wherever they are (its photos go to the annex). */
const GENERATED_BLOCK_PREFIXES: Partial<Record<ReportApproach, readonly string[]>> = {
  "mercado-inmuebles": ["motor-mercado-inmueble_venta"],
  "mercado-terrenos": ["motor-mercado-terreno_venta"],
  "mercado-rentas": ["motor-mercado-inmueble_renta", "motor-mercado-terreno_renta"],
};

export function isReportApproach(value: unknown): value is ReportApproach {
  return typeof value === "string" && (REPORT_APPROACHES as readonly string[]).includes(value);
}

/** The approaches a section holds; none for a section that is not an approach. */
export function sectionReportApproaches(section: { id: string }): readonly ReportApproach[] {
  return SECTION_APPROACHES[getCanonicalSectionKey(section.id)] ?? [];
}

type SectionWithExclusions = { id: string; excludedFromReport?: readonly string[] };

/** The approaches a section leaves out, among the ones it holds. */
export function sectionExclusions(section: SectionWithExclusions): ReportApproach[] {
  const held = sectionReportApproaches(section);
  return (section.excludedFromReport ?? []).filter((approach): approach is ReportApproach => isReportApproach(approach) && held.includes(approach));
}

/** Every approach the document leaves out of the dictamen. */
export function excludedReportApproaches(sections: readonly SectionWithExclusions[]): Set<ReportApproach> {
  return new Set(sections.flatMap(sectionExclusions));
}

/** Whether the approach goes into the dictamen. */
export function approachIncluded(section: SectionWithExclusions, approach: ReportApproach) {
  return !sectionExclusions(section).includes(approach);
}

/** The exclusions of the section once the approach is turned on or off; undefined when none is left out. */
export function withApproachIncluded(section: SectionWithExclusions, approach: ReportApproach, included: boolean): ReportApproach[] | undefined {
  const next = new Set(sectionExclusions(section));
  if (included) next.delete(approach);
  else next.add(approach);
  const ordered = REPORT_APPROACHES.filter((item) => next.has(item));
  return ordered.length ? ordered : undefined;
}

/** A section that holds approaches and leaves all of them out: it does not print. */
export function sectionLeftOutOfReport(section: SectionWithExclusions) {
  const held = sectionReportApproaches(section);
  return held.length > 0 && held.every((approach) => !approachIncluded(section, approach));
}

/** A page the calculation writes for an approach that is left out. */
export function blockLeftOutOfReport(block: { id: string }, excluded: ReadonlySet<ReportApproach>) {
  for (const approach of excluded) {
    if (GENERATED_BLOCK_PREFIXES[approach]?.some((prefix) => block.id.startsWith(prefix))) return true;
  }
  return false;
}

/**
 * The section as the dictamen prints it: null when it is left out, without
 * the pages of the approaches left out otherwise.
 */
export function sectionForReport<T extends SectionWithExclusions & { blocks: Array<{ id: string }> }>(section: T, excluded: ReadonlySet<ReportApproach>): T | null {
  if (sectionLeftOutOfReport(section)) return null;
  if (!excluded.size) return section;
  const blocks = section.blocks.filter((block) => !blockLeftOutOfReport(block, excluded));
  return blocks.length === section.blocks.length ? section : { ...section, blocks };
}

type ApproachValues = Record<Approach, number | null>;

/**
 * The values the conclusion may use: an approach left out is "no aplica". The
 * market value comes from buildings, else from land, among the markets that
 * stay in the dictamen.
 */
export function valuesForConclusion(
  values: { costos: number | null; ingresos: number | null; markets: { buildings: number | null; land: number | null } },
  excluded: ReadonlySet<ReportApproach>,
): { values: ApproachValues; marketSource: "INMUEBLE_VENTA" | "TERRENO_VENTA" | null } {
  const buildings = excluded.has("mercado-inmuebles") ? null : values.markets.buildings;
  const land = excluded.has("mercado-terrenos") ? null : values.markets.land;
  const mercado = buildings ?? land;
  return {
    values: {
      costos: excluded.has("costos") ? null : values.costos,
      mercado,
      ingresos: excluded.has("ingresos") ? null : values.ingresos,
    },
    marketSource: buildings !== null ? "INMUEBLE_VENTA" : land !== null ? "TERRENO_VENTA" : null,
  };
}

/** Whether the whole market approach is left out: both markets for sale. */
export const marketLeftOut = (excluded: ReadonlySet<ReportApproach>) => excluded.has("mercado-inmuebles") && excluded.has("mercado-terrenos");
