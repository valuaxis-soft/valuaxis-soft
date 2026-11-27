/**
 * One table for each table of the dictamen (20 nov 2026, Álvaro: «hay dos…
 * ¿por qué ahí es editable y no desde arriba?»). A calculation section used
 * to show its capture tables in a panel and, under it, the pages the
 * calculation writes, with the same figures locked. Now the tables of those
 * pages are the capture: the panel hands the editor the pages as its capture
 * holds them right now (`CapturePages`), with every row it captures, also the
 * ones the dictamen does not print yet, and the editor shows each table once,
 * in its block, with the layout the appraiser gave it in the dictamen.
 *
 * Nothing here is saved: the document keeps what the calculation wrote the
 * last time it was saved, and the preview and the dictamen print that.
 *
 * Pure: no React, no side effects.
 */
import type { Apartado, Block, TableContent } from "../model";
import type { TableV2 } from "../services/table";
import { applyTableLayout, carriedLayout, layoutOf, sourceOf } from "./generated-table-layout";

/** The pages of a calculation as its capture holds them, for the editor. */
export type CapturePages = {
  /** The blocks the calculation writes, with every row captured. */
  blocks: Block[];
  /** Blocks of the template the calculation's pages stand in for. */
  placeholderIds: string[];
};

/** A block of the section as the editor shows it. */
export type CaptureDisplayBlock = {
  block: Block;
  /** The calculation has not written it in the dictamen yet: it is captured here and prints once it has a result. */
  pending: boolean;
  /** Its tables are the capture of the calculation. */
  capture: boolean;
  /** A block of the template the calculation's pages will replace: it still prints, and is shown apart, folded. */
  placeholder?: boolean;
};

// Saved ids come back in lower case.
const key = (id: string) => id.toLowerCase();

/** The table of the capture with the layout the appraiser gave the one in the dictamen. */
function captureTable(live: TableContent, saved: TableContent | undefined): TableContent {
  if (!saved) return live;
  const source = withColumnIdsOf(sourceOf(live), sourceOf(saved));
  // A factor added or taken out since it was saved moves the calculation's columns: the layout follows them.
  return applyTableLayout(source, carriedLayout(layoutOf(saved), sourceOf(saved), source));
}

/**
 * The table of the capture with the column ids the dictamen's has. The
 * tables of the income approach were saved with ids of their own, not the
 * calculation's: the columns are the same ones, in the same order, so they
 * take the saved ids and the appraiser's layout keeps finding them.
 */
function withColumnIdsOf(live: TableV2, saved: TableV2): TableV2 {
  if (live.columns.length !== saved.columns.length || live.columns.every((column, index) => column.id === saved.columns[index].id)) return live;
  const ids = new Map(live.columns.map((column, index) => [column.id, saved.columns[index].id]));
  const renamed = (id: string) => ids.get(id) ?? id;
  const schema = live.schema;
  return {
    ...live,
    columns: live.columns.map((column) => ({ ...column, id: renamed(column.id) })),
    rows: live.rows.map((row) => ({ ...row, cells: Object.fromEntries(Object.entries(row.cells).map(([id, cell]) => [renamed(id), cell])) })),
    ...(schema ? {
      schema: {
        ...schema,
        zones: schema.zones.map((zone) => ({ ...zone, columnIds: zone.columnIds.map(renamed) })),
        ...(schema.columnPresentation
          ? { columnPresentation: Object.fromEntries(Object.entries(schema.columnPresentation).map(([id, value]) => [renamed(id), value])) }
          : {}),
      },
    } : {}),
  };
}

/** The place of a column among the ones the calculation wrote, as a capture names it when the table's ids are not the calculation's. */
export const captureColumnPlace = (index: number) => `#${index}`;

function captureTables(live: TableContent[], saved: TableContent[]): TableContent[] {
  const savedById = new Map(saved.map((table) => [key(table.id), table]));
  const liveIds = new Set(live.map((table) => key(table.id)));
  return [
    ...live.map((table) => captureTable(table, savedById.get(key(table.id)))),
    // A table only the dictamen has (the calculation no longer writes it) stays until the next save takes it out.
    ...saved.filter((table) => !liveIds.has(key(table.id))),
  ];
}

function captureApartados(live: Apartado[], saved: Apartado[]): Apartado[] {
  const savedById = new Map(saved.map((apartado) => [key(apartado.id), apartado]));
  const liveIds = new Set(live.map((apartado) => key(apartado.id)));
  return [
    ...live.map((apartado) => {
      const stored = savedById.get(key(apartado.id));
      return stored ? { ...stored, tables: captureTables(apartado.tables, stored.tables) } : apartado;
    }),
    ...saved.filter((apartado) => !liveIds.has(key(apartado.id))),
  ];
}

/** The block of the dictamen with the tables of the capture: what the appraiser set on the block and its concepts stays. */
function captureBlock(live: Block, saved: Block): Block {
  // A subbloque the appraiser deleted is not captured in either.
  const removed = new Set((saved.removedApartados ?? []).map(key));
  const apartados = live.apartados.filter((apartado) => !removed.has(key(apartado.id)));
  return { ...saved, tables: captureTables(live.tables, saved.tables), apartados: captureApartados(apartados, saved.apartados) };
}

/**
 * The section whose strip of template blocks left a gap to keep. The strip
 * sits under the capture and goes away with the calculation's first result:
 * without its room the page gets shorter and, scrolled to its end, the table
 * being typed in moves down under the mouse (the next click lands on a header).
 */
export function templateStripSpaceSection(remembered: string | null, sectionId: string, hasPlaceholders: boolean): string | null {
  if (hasPlaceholders) return sectionId;
  return remembered === sectionId ? sectionId : null;
}

/**
 * The blocks of a section as the editor shows them while its calculation
 * captures in its tables: each block the calculation writes once, with the
 * tables of the capture, in the place the dictamen has it; the ones the
 * dictamen does not have yet go where the template's blocks they stand in
 * for are (those are marked `placeholder`: the editor shows them apart), or first.
 */
export function captureDisplayBlocks(blocks: Block[], capture: CapturePages | null): CaptureDisplayBlock[] {
  if (!capture) return blocks.map((block) => ({ block, pending: false, capture: false }));
  const liveById = new Map(capture.blocks.map((block) => [key(block.id), block]));
  const savedIds = new Set(blocks.map((block) => key(block.id)));
  const missing = capture.blocks.filter((block) => !savedIds.has(key(block.id)));
  // The template's blocks are never where the calculation is captured: with nothing captured yet, its panel says where to start.
  const placeholders = new Set(capture.placeholderIds.map(key));
  const shown: CaptureDisplayBlock[] = [];
  let placed = missing.length === 0;
  const placeMissing = () => {
    if (placed) return;
    placed = true;
    shown.push(...missing.map((block) => ({ block, pending: true, capture: true })));
  };
  for (const block of blocks) {
    const live = liveById.get(key(block.id));
    if (live) {
      // The pages keep the calculation's order: what is missing goes before the first one the dictamen has after it.
      if (!placed && capture.blocks.findIndex((item) => key(item.id) === key(block.id)) > capture.blocks.indexOf(missing[0])) placeMissing();
      shown.push({ block: captureBlock(live, block), pending: false, capture: true });
    } else if (placeholders.has(key(block.id))) {
      placeMissing();
      shown.push({ block, pending: false, capture: false, placeholder: true });
    } else {
      shown.push({ block, pending: false, capture: false });
    }
  }
  if (!placed) shown.unshift(...missing.map((block) => ({ block, pending: true, capture: true })));
  return shown;
}

