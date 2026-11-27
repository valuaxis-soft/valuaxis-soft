/**
 * The annex «FACTORES DE HOMOLOGACIÓN» (FACT. HOMOLOGACIÓN), written from
 * what was captured in each market: one part per kind of calculation
 * (Terrenos en venta, Inmuebles en venta, Inmuebles en renta… and the
 * machinery market), each with its title in the palette's colour, a small
 * table of its factors (the values they took and why) and the summary of
 * the justifications the appraiser wrote there, in the toned frame of the
 * justification (video 8.14, 35:41: «sepárenme aparte por tipo de enfoque o
 * de cálculo… un resumen de lo que ya escribieron»). Every market in the
 * dictamen is summed up here, whether or not its justification also prints
 * in its approach. The appraiser may hide the block like any other.
 *
 * Pure: the workspace writes it in the section as a generated block.
 */
import type { Block } from "../model";
import type { ReportApproach } from "../services/report-approaches";
import type { TableNote } from "../services/table";
import { homologate } from "../engine/market";
import { Trace } from "../engine/trace";
import { EMPTY, figure, generatedApartado, generatedBlock, generatedTable, textColumn } from "./generated-content";
import { FACTOR_JUSTIFICATION_TITLE } from "./market-document";
import { machineryFactorColumns, machineryOfferFactor, type MachineryMarketDto } from "./machinery-types";
import {
  COMPARABLE_TYPE_LABELS,
  FACTOR_TYPE_LABELS,
  factorKey,
  findFactor,
  marketEngineConfig,
  marketSurfaceFormula,
  toMarketEngineInput,
  type ComparableType,
  type FactorSlotConfig,
  type MarketCalculationDto,
} from "./market-types";

/** Ids of the generated block; the annex's template table is replaced while it is there. */
export const FACTOR_ANNEX_PREFIX = "motor-anexo-factores";
export const FACTOR_ANNEX_TEMPLATE_BLOCK_IDS = ["homologacion-block-1-factores-de-homologacion"];

/** The approach of "Agregar al informe" each market belongs to. */
const REPORT_APPROACH_OF: Record<ComparableType, ReportApproach> = {
  TERRENO_VENTA: "mercado-terrenos",
  INMUEBLE_VENTA: "mercado-inmuebles",
  INMUEBLE_RENTA: "mercado-rentas",
  TERRENO_RENTA: "mercado-rentas",
};

/** The markets whose approach goes into the dictamen: one turned off with "Agregar al informe" is left out. */
export const marketsInReport = <T extends Pick<MarketCalculationDto, "settings">>(markets: T[], excluded: ReadonlySet<ReportApproach>) =>
  markets.filter((market) => !excluded.has(REPORT_APPROACH_OF[market.settings.comparableType]));

/** Land before buildings for sale, buildings before land for rent: the order the dictamen prints the markets. */
const PRINT_ORDER: ComparableType[] = ["TERRENO_VENTA", "INMUEBLE_VENTA", "INMUEBLE_RENTA", "TERRENO_RENTA"];

type Market = Pick<MarketCalculationDto, "settings" | "comparables">;
type Row = [factor: string, values: string, justification: string];

/** The name the appraiser gave the factor, or its type's; the firm's own by its key. */
function slotName(slot: Pick<FactorSlotConfig, "type" | "label" | "key">) {
  const key = factorKey(slot);
  if (slot.label?.trim()) return slot.label.trim();
  return key.startsWith("custom:") ? key.replace(/^custom:/, "").replace(/-/g, " ").replace(/^./, (first) => first.toUpperCase()) : FACTOR_TYPE_LABELS[slot.type];
}

/** "0.95" or "0.90 – 1.05": the values a factor took across the comparables. */
function range(values: number[]) {
  if (!values.length) return EMPTY;
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? figure(low) : `${figure(low)} – ${figure(high)}`;
}

/** "Comparable 1", "Comparables 1 y 3", "Comparables 1, 2 y 4". */
function comparablesLabel(references: number[]) {
  const sorted = [...references].sort((a, b) => a - b).map(String);
  if (sorted.length === 1) return `Comparable ${sorted[0]}`;
  return `Comparables ${sorted.slice(0, -1).join(", ")} y ${sorted.at(-1)}`;
}

/** Each distinct text once, with the comparables that share it. */
function grouped(entries: Array<{ reference: number; text: string }>) {
  const byText = new Map<string, number[]>();
  for (const { reference, text } of entries) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    byText.set(trimmed, [...(byText.get(trimmed) ?? []), reference]);
  }
  return [...byText].map(([text, references]) => ({ label: `${comparablesLabel(references)}:`, text }));
}

/** The surface factors the homologation computes, by the comparable's reference; empty while it cannot be computed. */
function surfaceFactors(market: Market): Map<string, number> {
  const input = toMarketEngineInput(market);
  if (!input.ok) return new Map();
  try {
    const result = homologate(input.input, marketEngineConfig(market.settings).surfaceOrientation.market, new Trace(), "mercado", null);
    return new Map(result.comparables.map((row) => [row.id, row.surfaceFactor]));
  } catch {
    return new Map();
  }
}

/** One row per factor of a market: its name, the values it took and the justifications of its comparables. */
function factorRows(market: Market): Row[] {
  const surface = surfaceFactors(market);
  return market.settings.factorSlots.flatMap((slot): Row[] => {
    const name = slotName(slot);
    if (slot.type === "SUPERFICIE") {
      const values = market.comparables.flatMap((comparable) => {
        const value = surface.get(String(comparable.reference));
        return value === undefined ? [] : [value];
      });
      return [[name, range(values), `Calculado: ${marketSurfaceFormula(market.settings)}.`]];
    }
    const factors = market.comparables.flatMap((comparable) => {
      const factor = findFactor(comparable, slot);
      return factor ? [{ reference: comparable.reference, factor }] : [];
    });
    const values = factors.flatMap(({ factor }) => (typeof factor.value === "number" ? [factor.value] : []));
    const text = grouped(factors.map(({ reference, factor }) => ({ reference, text: factor.justification ?? "" })))
      .map(({ label, text: reason }) => `${label} ${reason}`).join(" ");
    return values.length || text ? [[name, range(values), text || EMPTY]] : [];
  });
}

/** What the appraiser wrote of the factors in a market: the general text, then each comparable's, the same ones together. */
function writtenJustification(general: string | null | undefined, comparables: Array<{ reference: number; text: string | null | undefined }>): TableNote[] {
  const notes: TableNote[] = [
    ...(general?.trim() ? [{ position: "table" as const, justification: true, fromApproach: true, text: general.trim() }] : []),
    ...grouped(comparables.map(({ reference, text }) => ({ reference, text: text ?? "" })))
      .map(({ label, text }) => ({ position: "table" as const, justification: true, fromApproach: true, label, text })),
  ];
  return notes.length ? [{ position: "table", justification: true, fromApproach: true, heading: true, text: FACTOR_JUSTIFICATION_TITLE }, ...notes] : [];
}

/** A part of the annex: its title, the table of its factors and the summary of what was written. */
function part(id: string, title: string, rows: Row[], notes: TableNote[]) {
  return generatedApartado(`${FACTOR_ANNEX_PREFIX}-${id}`, title, {
    tables: [generatedTable(`${FACTOR_ANNEX_PREFIX}-${id}-tabla`, `Factores de homologación · ${title}`,
      [textColumn("Factor"), textColumn("Valores aplicados", "center"), textColumn("Justificación")],
      rows,
      { rowKeys: rows.map((row) => row[0]), notes })],
  });
}

const marketSlug = (type: ComparableType) => type.toLowerCase().replace(/_/g, "-");

/** A market's part, or none when it has no comparables or nothing to say. */
function marketPart(market: Market) {
  if (!market.comparables.length) return [];
  const rows = factorRows(market);
  const notes = writtenJustification(market.settings.justification,
    market.comparables.map((comparable) => ({ reference: comparable.reference, text: comparable.factorJustification })));
  if (!rows.length && !notes.length) return [];
  return [part(marketSlug(market.settings.comparableType), COMPARABLE_TYPE_LABELS[market.settings.comparableType], rows, notes)];
}

/** The machinery market's part: the FEd, which the age gives, then its factors; the justification it wrote. */
function machineryPart(market: Pick<MachineryMarketDto, "offers" | "factorColumns" | "justification">) {
  if (!market.offers.length) return [];
  const rows: Row[] = [
    ["Edad FEd", EMPTY, "Calculado con la edad, la vida útil y la calificación de conservación de cada oferta."],
    ...machineryFactorColumns(market).map((column): Row => [column.label, range(market.offers.map((offer) => machineryOfferFactor(offer, column.key))), EMPTY]),
  ];
  const text = market.justification?.trim();
  const notes: TableNote[] = text
    ? [{ position: "table", justification: true, fromApproach: true, heading: true, text: FACTOR_JUSTIFICATION_TITLE }, { position: "table", justification: true, fromApproach: true, text }]
    : [];
  return [part("maquinaria", "Maquinaria y equipo", rows, notes)];
}

/**
 * The annex block, one part per market of the dictamen in the order it
 * prints them, and the machinery market when there is one; none when no
 * market has comparables.
 */
export function factorJustificationBlocks(markets: Market[], machinery: Pick<MachineryMarketDto, "offers" | "factorColumns" | "justification"> | null = null): Block[] {
  const parts = [
    ...[...markets]
      .sort((a, b) => PRINT_ORDER.indexOf(a.settings.comparableType) - PRINT_ORDER.indexOf(b.settings.comparableType))
      .flatMap(marketPart),
    ...(machinery ? machineryPart(machinery) : []),
  ];
  return parts.length ? [generatedBlock(FACTOR_ANNEX_PREFIX, "FACTORES DE HOMOLOGACIÓN", { apartados: parts })] : [];
}
