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

/** One switch «Agregar al informe valuatorio» of a section: the approaches it turns on or off together, and its name. */
export type ReportSwitch = { key: string; label: string; approaches: readonly ReportApproach[] };

/**
 * The switches of a section. A machinery valuation has one market, not land
 * and buildings (27 nov 2026: «que hable de maquinaria»): its market section
 * has one switch, «mercado de maquinaria y equipo», that turns both of the
 * section's markets on or off, so its market is left out exactly when both
 * are (`marketLeftOut`, as the conclusion reads it).
 */
export function sectionReportSwitches(section: { id: string }, options: { machinery?: boolean } = {}): ReportSwitch[] {
  const held = sectionReportApproaches(section);
  if (options.machinery && getCanonicalSectionKey(section.id) === "MERCADO_VENTA") {
    return [{ key: "mercado-maquinaria", label: MACHINERY_MARKET_REPORT_LABEL, approaches: held }];
  }
  return held.map((approach) => ({ key: approach, label: REPORT_APPROACH_LABELS[approach], approaches: [approach] }));
}

export const MACHINERY_MARKET_REPORT_LABEL = "Mercado de maquinaria y equipo";

/** Whether a switch is on: any of its approaches goes into the dictamen. */
export const reportSwitchIncluded = (section: SectionWithExclusions, entry: ReportSwitch) => entry.approaches.some((approach) => approachIncluded(section, approach));

/** The exclusions of the section once a switch is turned on or off: all of its approaches with it. */
export function withReportSwitch(section: SectionWithExclusions, entry: ReportSwitch, included: boolean): ReportApproach[] | undefined {
  let current: SectionWithExclusions = section;
  let next: ReportApproach[] | undefined = section.excludedFromReport ? sectionExclusions(section) : undefined;
  for (const approach of entry.approaches) {
    next = withApproachIncluded(current, approach, included);
    current = { ...current, excludedFromReport: next };
  }
  return next;
}

/** The approaches each section holds, by its registry key. */
const SECTION_APPROACHES: Record<string, readonly ReportApproach[]> = {
  COSTOS: ["costos"],
  MERCADO_VENTA: ["mercado-inmuebles", "mercado-terrenos"],
  MERCADO_RENTAS: ["mercado-rentas"],
  INGRESOS: ["ingresos"],
};

/**
 * The pages the calculation writes for each market, wherever they are (its
 * photos go to the annex). The alternative methods are not among them: they
 * have a section and a switch of their own (V7.3-19: «si apagas un mercado…
 * se hace bolas»), so a market left out no longer takes them with it.
 */
const GENERATED_BLOCK_PREFIXES: Partial<Record<ReportApproach, readonly string[]>> = {
  "mercado-inmuebles": ["motor-mercado-inmueble_venta"],
  "mercado-terrenos": ["motor-mercado-terreno_venta"],
  "mercado-rentas": ["motor-mercado-inmueble_renta", "motor-mercado-terreno_renta"],
};

/** The switch of «Agregar al informe valuatorio» a market goes with: land or buildings for sale, and the rents (both kinds) in one. */
export function marketReportApproach(type: "TERRENO_VENTA" | "INMUEBLE_VENTA" | "INMUEBLE_RENTA" | "TERRENO_RENTA"): ReportApproach {
  if (type === "TERRENO_VENTA") return "mercado-terrenos";
  if (type === "INMUEBLE_VENTA") return "mercado-inmuebles";
  return "mercado-rentas";
}

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

/**
 * The section as the editor's preview shows it: what the dictamen prints. A
 * section left out entirely shows as hidden, so the preview never shows a
 * market that "Agregar al informe valuatorio" took out.
 */
export function previewSectionForReport<T extends SectionWithExclusions & { blocks: Array<{ id: string }>; enabled?: boolean }>(section: T, excluded: ReadonlySet<ReportApproach>): T {
  return sectionForReport(section, excluded) ?? { ...section, enabled: false };
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
