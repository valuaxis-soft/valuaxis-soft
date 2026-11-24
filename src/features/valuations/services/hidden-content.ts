import type { Apartado, Block, Concept, TableContent } from "../model";
import { ensureTableV2, type TableV2 } from "./table";

type Entry = { enabled?: boolean };

const allHidden = (entries: Entry[]) => entries.length > 0 && entries.every((entry) => entry.enabled === false);

/** Everything the apartado holds is hidden: it prints nothing, not even its title. An empty one still prints its title. */
export function apartadoContentHidden(apartado: Pick<Apartado, "concepts" | "images" | "tables">): boolean {
  return allHidden([...apartado.concepts, ...apartado.images, ...apartado.tables]);
}

/**
 * Everything the block holds is hidden (its concepts, tables and images, and
 * every apartado, hidden itself or with all its content hidden): it prints
 * nothing, not even its title, and takes no number. A block with no content
 * at all still prints its title, as a heading.
 */
export function blockContentHidden(block: Pick<Block, "concepts" | "images" | "tables" | "apartados">): boolean {
  const direct = [...block.concepts, ...block.images, ...block.tables];
  if (direct.length + block.apartados.length === 0) return false;
  return direct.every((entry) => entry.enabled === false)
    && block.apartados.every((apartado) => apartado.enabled === false || apartadoContentHidden(apartado));
}

/* ------------------------------------------------------------------ */
/*  What the dictamen prints (audit of 23 Nov 2026, FAL-17/18/31)      */
/* ------------------------------------------------------------------ */

/**
 * A concept prints when it is shown and has something written: an empty
 * concept printed «Nuevo concepto:» and «—» (some forty in one section).
 */
export function conceptPrints(concept: Pick<Concept, "enabled" | "value">): boolean {
  return concept.enabled !== false && String(concept.value ?? "").trim() !== "";
}

const canonical = new WeakMap<object, TableV2>();
const tableOf = (table: TableContent): TableV2 => {
  let v2 = canonical.get(table);
  if (!v2) {
    v2 = ensureTableV2(table);
    canonical.set(table, v2);
  }
  return v2;
};

/**
 * A table prints when it is shown and has something to say: a table of the
 * calculation, one with boxes or notes, or one with a cell written. The
 * INDIRECTOS template printed its headers over an empty row.
 */
export function tablePrints(table: TableContent): boolean {
  if (table.enabled === false) return false;
  const v2 = tableOf(table);
  if (v2.schema?.generated || v2.schema?.summaryBoxes?.length || v2.schema?.notes?.length) return true;
  return v2.rows.some((row) => Object.values(row.cells).some((cell) => cell && (cell.kind === "formula" || String(cell.value ?? "").trim() !== "")));
}

const shown = (entry: Entry) => entry.enabled !== false;

/**
 * What an apartado holds prints nothing: everything hidden, or only tables
 * with nothing written. One with no content at all still prints its title.
 * A concept still to be written keeps its apartado (and its title): the
 * concept alone is left out (`conceptPrints`).
 */
export function apartadoPrintsNothing(apartado: Pick<Apartado, "concepts" | "images" | "tables">): boolean {
  const count = apartado.concepts.length + apartado.images.length + apartado.tables.length;
  return count > 0 && !apartado.concepts.some(shown) && !apartado.images.some(shown) && !apartado.tables.some(tablePrints);
}

/**
 * What a block holds prints nothing, hidden or only empty tables (the
 * INDIRECTOS template, FAL-17): it prints no title and takes no number
 * (section-numbering.ts), so the editor's numerals are the dictamen's (FAL-18).
 * A block with no content at all still prints its title.
 */
export function blockPrintsNothing(block: Pick<Block, "concepts" | "images" | "tables" | "apartados">): boolean {
  if (block.concepts.length + block.images.length + block.tables.length + block.apartados.length === 0) return false;
  return !block.concepts.some(shown) && !block.images.some(shown) && !block.tables.some(tablePrints)
    && block.apartados.every((apartado) => apartado.enabled === false || apartadoPrintsNothing(apartado));
}
