/**
 * The annex «FACTORES DE HOMOLOGACIÓN» (FACT. HOMOLOGACIÓN) written from the
 * justifications already captured in each market: by type of factor, which
 * approach applied it, the range of its values and why. A market whose
 * justification already prints with its approach ("Mostrar en el dictamen")
 * is not repeated: the annex says that its justifications are in the
 * approach. The appraiser may hide the block like any other.
 *
 * Pure: the workspace writes it in the section as a generated block.
 */
import type { Block } from "../model";
import type { ReportApproach } from "../services/report-approaches";
import { EMPTY, figure, generatedApartado, generatedBlock, generatedTable, textColumn } from "./generated-content";
import {
  COMPARABLE_TYPE_LABELS,
  FACTOR_TYPE_LABELS,
  factorKey,
  findFactor,
  type ComparableType,
  type FactorSlotConfig,
  type MarketCalculationDto,
} from "./market-types";

/** Ids of the generated block; the annex's template table is replaced while it is there. */
export const FACTOR_ANNEX_PREFIX = "motor-anexo-factores";
export const FACTOR_ANNEX_TEMPLATE_BLOCK_IDS = ["homologacion-block-1-factores-de-homologacion"];
export const IN_EACH_APPROACH = "Las justificaciones se presentan en cada enfoque.";

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

/** Each distinct justification once, with the comparables that share it: "Comp. 1, 3: Zona superior." */
function summary(entries: Array<{ reference: number; text: string }>) {
  const byText = new Map<string, number[]>();
  for (const { reference, text } of entries) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    byText.set(trimmed, [...(byText.get(trimmed) ?? []), reference]);
  }
  return [...byText].map(([text, references]) => `Comp. ${references.sort((a, b) => a - b).join(", ")}: ${text}`).join(" ");
}

const hasJustification = (market: Market) =>
  Boolean(market.settings.justification?.trim())
  || market.comparables.some((comparable) => comparable.factorJustification?.trim() || comparable.factors.some((factor) => factor.justification?.trim()));

/** A market whose justification already prints after its homologation tables. */
const shownInApproach = (market: Market) => market.settings.showFactorJustification !== false;

/** One row per factor of a market: the factor, the approach, the values and the justifications of its comparables. */
function factorRows(market: Market) {
  const approach = COMPARABLE_TYPE_LABELS[market.settings.comparableType];
  return market.settings.factorSlots.flatMap((slot) => {
    const name = slotName(slot);
    if (slot.type === "SUPERFICIE") {
      return [[name, approach, EMPTY, "Calculado: superficie de la base entre la del comparable, a la potencia 1/n."]];
    }
    const factors = market.comparables.flatMap((comparable) => {
      const factor = findFactor(comparable, slot);
      return factor ? [{ reference: comparable.reference, factor }] : [];
    });
    const values = factors.flatMap(({ factor }) => (typeof factor.value === "number" ? [factor.value] : []));
    const text = summary(factors.map(({ reference, factor }) => ({ reference, text: factor.justification ?? "" })));
    return values.length || text ? [[name, approach, range(values), text || EMPTY]] : [];
  });
}

/**
 * The annex block, or none when no market has factors or justifications.
 * Markets whose justification prints in their approach are named in a note
 * and left out of the table; when that is every market, the block is only
 * the note.
 */
export function factorJustificationBlocks(markets: Market[]): Block[] {
  const relevant = [...markets]
    .filter((market) => market.comparables.length && (market.settings.factorSlots.length || hasJustification(market)))
    .sort((a, b) => PRINT_ORDER.indexOf(a.settings.comparableType) - PRINT_ORDER.indexOf(b.settings.comparableType));
  if (!relevant.length) return [];
  const inApproach = relevant.filter((market) => shownInApproach(market) && hasJustification(market));
  const summarized = relevant.filter((market) => !inApproach.includes(market));
  const title = "FACTORES DE HOMOLOGACIÓN";

  if (!summarized.length) {
    return [generatedBlock(FACTOR_ANNEX_PREFIX, title, {
      apartados: [generatedApartado(`${FACTOR_ANNEX_PREFIX}-justificacion`, "Justificación de los factores", {
        concepts: [{ id: `${FACTOR_ANNEX_PREFIX}-leyenda`, label: "Justificación", value: IN_EACH_APPROACH }],
      })],
    })];
  }

  const rows = summarized.flatMap(factorRows);
  const general = summarized.flatMap((market) => {
    const texts = [
      market.settings.justification?.trim() ?? "",
      summary(market.comparables.map((comparable) => ({ reference: comparable.reference, text: comparable.factorJustification ?? "" }))),
    ].filter(Boolean);
    return texts.length ? [{ position: "bottom" as const, label: `${COMPARABLE_TYPE_LABELS[market.settings.comparableType]}:`, text: texts.join(" ") }] : [];
  });
  const notes = [
    ...(inApproach.length
      ? [{ position: "top" as const, text: `Las justificaciones de ${inApproach.map((market) => COMPARABLE_TYPE_LABELS[market.settings.comparableType].toLowerCase()).join(" y ")} se presentan en su enfoque.` }]
      : []),
    ...general,
  ];
  return [generatedBlock(FACTOR_ANNEX_PREFIX, title, {
    apartados: [generatedApartado(`${FACTOR_ANNEX_PREFIX}-justificacion`, "Justificación de los factores", {
      tables: [generatedTable(`${FACTOR_ANNEX_PREFIX}-tabla`, "Factores de homologación",
        [textColumn("Factor"), textColumn("Enfoque"), textColumn("Valores aplicados", "center"), textColumn("Justificación")],
        rows,
        { rowKeys: rows.map((row) => `${row[1]}-${row[0]}`), notes })],
    })],
  })];
}
