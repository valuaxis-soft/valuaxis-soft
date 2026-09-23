/**
 * Turns the market calculation into dictamen blocks: comparables, homologation
 * and summary in the market section, and the comparables' photos in the annex.
 * Generated blocks carry the GENERATED_BLOCK_PREFIX and are rewritten on every
 * calculation; the appraiser edits the data in the calculation panel.
 */
import type { MarketApproachResult } from "../engine/market";
import type { AppSection, Block, TableContent } from "../model";
import { ensureTableV2 } from "../services/table";
import {
  COMPARABLE_TYPE_LABELS,
  RECOMMENDED_MAX_DISPERSION,
  type ComparableType,
  type MarketCalculationDto,
} from "./market-types";

export const GENERATED_BLOCK_PREFIX = "motor-";

/** Template blocks of the market section that the generated blocks stand in for. */
export const MARKET_TEMPLATE_BLOCK_IDS = [
  "mercadoVenta-block-1-comparables-de-mercado-en-venta",
  "mercadoVenta-block-2-homologacion-de-comparables-en-venta",
  "mercadoVenta-block-3-resumen-del-enfoque-de-mercado-en-venta",
];

const SUBJECT_LAND_AREA_LABELS = ["superficie total de terreno", "superficie total terreno", "superficie de terreno"];

/** Land area captured in the terreno, datos or carátula sections ("169.78 m²"), to suggest as the subject area. */
export function findSubjectLandArea(sections: AppSection[]): number | null {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/gi, "").trim().toLowerCase();
  for (const section of sections) {
    for (const concept of section.blocks.flatMap((item) => [...item.concepts, ...item.apartados.flatMap((apartado) => apartado.concepts)])) {
      if (!SUBJECT_LAND_AREA_LABELS.includes(normalize(concept.label))) continue;
      const match = concept.value.replace(/,/g, "").match(/\d+(\.\d+)?/);
      const area = match ? Number(match[0]) : NaN;
      if (area > 0) return area;
    }
  }
  return null;
}

export function isGeneratedBlock(block: Pick<Block, "id">) {
  return block.id.startsWith(GENERATED_BLOCK_PREFIX);
}

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimals = (digits: number) => new Intl.NumberFormat("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const area = (value: number) => `${decimals(2).format(value)} m²`;
const factor = (value: number) => decimals(4).format(value);

function block(id: string, title: string, parts: Partial<Pick<Block, "concepts" | "tables" | "images">>): Block {
  return {
    id,
    title,
    sectionLabel: "",
    enabled: true,
    required: false,
    concepts: parts.concepts ?? [],
    apartados: [],
    tables: parts.tables ?? [],
    images: parts.images ?? [],
  };
}

function table(id: string, title: string, columns: string[], rows: string[][]): TableContent {
  return { id, title, columns, rows, enabled: true };
}

const prefixFor = (type: ComparableType) => `${GENERATED_BLOCK_PREFIX}mercado-${type.toLowerCase()}`;

/** Blocks of the market section. Empty while there is nothing to show. */
export function marketDocumentBlocks(calculation: MarketCalculationDto, result: MarketApproachResult | null): Block[] {
  const { settings, comparables } = calculation;
  if (!comparables.length) return [];
  const prefix = prefixFor(settings.comparableType);
  const label = COMPARABLE_TYPE_LABELS[settings.comparableType].toUpperCase();
  const byReference = new Map(result?.homologation.comparables.map((row) => [row.id, row]) ?? []);

  const offers = block(`${prefix}-comparables`, `COMPARABLES: ${label}`, {
    tables: [table(`${prefix}-tabla-comparables`, `Comparables: ${COMPARABLE_TYPE_LABELS[settings.comparableType].toLowerCase()}`,
      ["Ref.", "Ubicación", "Superficie", "Oferta", "Valor unitario", "Fuente", "Observaciones"],
      comparables.map((comparable) => [
        String(comparable.reference),
        comparable.location,
        comparable.area ? area(comparable.area) : "—",
        comparable.price ? money.format(comparable.price) : "—",
        comparable.area && comparable.price ? `${money.format(comparable.price / comparable.area)} /m²` : "—",
        [comparable.sourceName, comparable.contactPhone].filter(Boolean).join(" · ") || "—",
        comparable.notes ?? "—",
      ]))],
  });

  const slots = settings.factorSlots;
  const homologation = block(`${prefix}-homologacion`, `HOMOLOGACIÓN: ${label}`, {
    tables: [table(`${prefix}-tabla-homologacion`, "Homologación",
      ["Ref.", "Valor unitario", ...slots.map((slot) => slot.label), "Factor resultante", "Valor homologado"],
      comparables.map((comparable) => {
        const row = byReference.get(String(comparable.reference));
        const values = slots.map((slot) => {
          if (!row) return "—";
          if (slot.type === "SUPERFICIE") return factor(row.surfaceFactor);
          const captured = comparable.factors.find((item) => item.type === slot.type);
          const value = captured?.subjectRating && captured.comparableRating
            ? captured.subjectRating / captured.comparableRating
            : captured?.value ?? 1;
          return factor(value);
        });
        return [
          String(comparable.reference),
          row ? money.format(row.unitValue) : "—",
          ...values,
          row ? factor(row.resultantFactor) : "—",
          row ? money.format(row.homologatedUnitValue) : "—",
        ];
      }))],
  });

  const blocks = [offers, homologation];
  if (result) {
    const stats = result.homologation.stats;
    const concepts: [string, string][] = [
      ["Valor unitario mínimo homologado", `${money.format(stats.min)} /m²`],
      ["Valor unitario máximo homologado", `${money.format(stats.max)} /m²`],
      ["Valor unitario promedio homologado", `${money.format(stats.mean)} /m²`],
      ["Dispersión (máximo / mínimo)", `${decimals(2).format(stats.dispersion)}${stats.dispersion > RECOMMENDED_MAX_DISPERSION ? " (mayor a la recomendada de 1.25)" : ""}`],
      ["Valor unitario adoptado", `${money.format(result.adoptedUnitValue)} /m²`],
      ["Superficie del sujeto", area(settings.subjectArea ?? 0)],
      ...(settings.additionalAmount ? [["Monto adicional", money.format(settings.additionalAmount)] as [string, string]] : []),
      ["Valor comparativo de mercado", money.format(result.value)],
      ...(settings.justification ? [["Justificación del valor adoptado", settings.justification] as [string, string]] : []),
    ];
    blocks.push(block(`${prefix}-resumen`, `RESUMEN DEL ENFOQUE DE MERCADO: ${label}`, {
      concepts: concepts.map(([conceptLabel, value], index) => ({ id: `${prefix}-resumen-${index + 1}`, label: conceptLabel, value, enabled: true })),
    }));
  }
  return blocks;
}

/** Photos of the comparables, for the annex. */
export function marketPhotoBlocks(calculation: MarketCalculationDto): Block[] {
  const images = calculation.comparables.flatMap((comparable) =>
    comparable.photos.map((photo) => ({
      id: `${GENERATED_BLOCK_PREFIX}foto-${photo.id}`,
      title: `Comparable ${comparable.reference}: ${comparable.location}`,
      src: photo.url,
      enabled: true,
    })));
  if (!images.length) return [];
  const prefix = prefixFor(calculation.settings.comparableType);
  return [block(`${prefix}-fotos`, `FOTOGRAFÍAS DE COMPARABLES: ${COMPARABLE_TYPE_LABELS[calculation.settings.comparableType].toUpperCase()}`, { images })];
}

/**
 * Replaces the generated blocks of one comparable type in a section, where they
 * were or at `position`. Template placeholders they stand in for are dropped
 * once there is generated content. Returns the same section when nothing changes.
 */
export function withGeneratedBlocks(
  section: AppSection,
  type: ComparableType,
  blocks: Block[],
  options: { placeholderIds?: string[]; position?: "start" | "end"; kind?: "calculo" | "fotos" } = {},
): AppSection {
  const prefix = options.kind === "fotos" ? `${prefixFor(type)}-fotos` : prefixFor(type);
  const owns = (item: Block) => item.id.startsWith(prefix) && (options.kind === "fotos" || !item.id.endsWith("-fotos"));
  // Saved block ids come back in lower case.
  const placeholders = new Set((blocks.length ? options.placeholderIds ?? [] : []).map((id) => id.toLowerCase()));
  const isPlaceholder = (item: Block) => placeholders.has(item.id.toLowerCase());
  const current = section.blocks.filter(owns);
  if (sameContent(current, blocks) && !section.blocks.some(isPlaceholder)) return section;
  const firstIndex = section.blocks.findIndex((item) => owns(item) || isPlaceholder(item));
  const kept = section.blocks.filter((item) => !owns(item) && !isPlaceholder(item));
  const insertAt = firstIndex !== -1
    ? section.blocks.slice(0, firstIndex).filter((item) => kept.includes(item)).length
    : options.position === "end" ? kept.length : 0;
  return { ...section, blocks: [...kept.slice(0, insertAt), ...blocks, ...kept.slice(insertAt)] };
}

/** Title, column names and cell texts: the same for a new table and one reloaded as TableV2. */
function tableCells(tableItem: TableContent) {
  const normalized = ensureTableV2(tableItem);
  return [
    normalized.title,
    normalized.columns.map((column) => column.name),
    normalized.rows.map((row) => normalized.columns.map((column) => {
      const cell = row.cells[column.id];
      return cell?.kind === "value" ? cell.value : "";
    })),
  ];
}

/** Compares what the dictamen shows, ignoring labels the editor renumbers and photo URLs that expire. */
function sameContent(left: Block[], right: Block[]) {
  const shape = (blocks: Block[]) => JSON.stringify(blocks.map((item) => ({
    id: item.id,
    title: item.title,
    concepts: item.concepts.map((concept) => [concept.label, concept.value]),
    tables: item.tables.map(tableCells),
    images: item.images.map((image) => [image.id, image.title]),
  })));
  return shape(left) === shape(right);
}
