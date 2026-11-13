/**
 * Structure transfer — moving and copying parts of the document across its
 * sections: several concepts at once, an Apartado or a whole Block.
 *
 *  - A move keeps every id: the same concepts, tables and images change
 *    place, so links and formulas that point at them keep working.
 *  - A copy gets new ids for everything it holds (Block, Apartados,
 *    concepts, tables, images and the layout references to them). Links and
 *    formulas between the copied items follow the copies; a link to a concept
 *    outside the copy stays with that concept.
 *  - What the calculation writes (and the template Blocks its results
 *    replace), the carátula's company header and the content pinned to its
 *    Apartado are never moved or copied (see content-move-rules.ts).
 *  - The carátula's Blocks move, copy and duplicate like any other (video
 *    5.5). It holds concepts and subbloques only, so a Block or Apartado with
 *    tables or images does not go into it; and its conclusion, which prints
 *    the commercial value, does not leave it while it is the only one.
 *
 * Pure: no side effects, no rendering.
 */

import { isGeneratedBlock } from "../calculation/market-document";
import { pinFullLinkResolution } from "../concept-links";
import type {
  Apartado,
  AppSection,
  Block,
  BlockFlowStructuralRow,
  BlockFlowV2,
  Concept,
  ContentLayout,
  ContentLayoutColumnV2,
  ContentLayoutRowV2,
  ImageContent,
  TableContent,
} from "../model";
import { contentRowStructuralId, normalizeBlockFlowV2, resolveBlockFlowV2, isBlockFlowV2 } from "./block-flow";
import { resolveContentLayout } from "./content-layout";
import {
  applyContentDropToBlocks,
  canMoveContent,
  contentItemKey,
  type ContentDropSource,
  type ContentDropTarget,
  type ContentMoveRules,
} from "./content-drop";
import { stripTextMarks } from "./text-marks";
import { contentMoveRulesForSection } from "./content-move-rules";
import { getCaratulaBlockKind } from "./caratula-blocks";
import { COMPANY_HEADER_BLOCK_ID } from "./caratula-company-header";
import { isRelationManagedImageSection } from "./image-source";
import type { FormulaExpression, FormulaOperand, TableFormula, TableRow, TableSchema } from "./table";

/* ================================================================== */
/*  ADDRESSES AND LOCKS                                                */
/* ================================================================== */

/** A Block, or one of its Apartados, somewhere in the document. */
export type ContainerAddress = { sectionId: string; blockId: string; apartadoId?: string };

export type TransferResult = { changed: boolean; sections: AppSection[]; reason?: string };

/** What moved things go before or after, inside a Block or Apartado: one of its rows or (in a Block) one of its Apartados. */
export type TransferAnchor = { type: "row"; rowId: string } | { type: "apartado"; apartadoId: string };

/**
 * Where moved things land inside their destination. "end" is after
 * everything it holds (in a Block, after its Apartados too), as before
 * there was a choice (video 5.6, 31:58: the concepts went under the
 * Apartado and could not be put back above it).
 */
export type TransferPosition = { placement: "start" | "end" } | { placement: "before" | "after"; anchor: TransferAnchor };

const AT_END: TransferPosition = { placement: "end" };

const unchanged = (sections: AppSection[], reason: string): TransferResult => ({ changed: false, sections, reason });

const isCaratula = (section: Pick<AppSection, "id">) => section.id === "caratula";

export const LOCKED_BLOCK_REASON = "Este bloque lo escribe el cálculo o tiene un lugar fijo: no se mueve ni se copia.";
const CARATULA_CONTENT_REASON = "La carátula lleva solo conceptos y subbloques: quita las tablas e imágenes antes de llevarlo ahí.";
const CARATULA_CONCLUSION_MOVE_REASON = "Este bloque imprime el valor comercial de la carátula: no sale de ella. Puedes copiarlo o duplicarlo.";
const MISSING_REASON = "El destino ya no existe.";

const newId = () => crypto.randomUUID();

/** Why the Block can give or take no content, or null when it can. */
export function blockLockReason(section: AppSection, blockId: string): string | null {
  return contentMoveRulesForSection(section).lockedBlockIds.has(blockId) ? LOCKED_BLOCK_REASON : null;
}

/** Why the Block (or the Apartados inside it) cannot be moved, copied or duplicated, or null. */
export function structureLockReason(section: AppSection, blockId: string): string | null {
  if (isCaratula(section)) return blockLockReason(section, blockId);
  const lock = blockLockReason(section, blockId);
  return lock && !isGeneratedBlock({ id: blockId }) ? TEMPLATE_BLOCK_MOVE_REASON : lock;
}

/** Why a template Block the calculation replaces with its results cannot be moved: its copies can. */
export const TEMPLATE_BLOCK_MOVE_REASON = "El cálculo reemplaza este bloque con sus resultados: no se mueve, pero sí se copia o se duplica.";

/**
 * Why the Block cannot be copied or duplicated, or null. A copy gets new ids
 * and is the appraiser's own, so a template Block the calculation replaces
 * (Ingresos, Costos, Mercado before calculating) is copied like any other;
 * what the calculation writes and the carátula's Blocks are not.
 */
export function blockCopyLockReason(section: AppSection, blockId: string): string | null {
  if (isCaratula(section)) return blockLockReason(section, blockId);
  return isGeneratedBlock({ id: blockId }) ? LOCKED_BLOCK_REASON : null;
}

/** Why the Block cannot go to another section, or null: what locks its structure, or being the carátula's only conclusion. */
export function blockMoveLockReason(section: AppSection, blockId: string): string | null {
  const lock = structureLockReason(section, blockId);
  if (lock || !isCaratula(section)) return lock;
  const block = section.blocks.find((item) => item.id === blockId);
  if (!block || getCaratulaBlockKind(block) !== "conclusion") return null;
  const conclusions = section.blocks.filter((item) => item.id !== COMPANY_HEADER_BLOCK_ID && getCaratulaBlockKind(item) === "conclusion");
  return conclusions.length === 1 ? CARATULA_CONCLUSION_MOVE_REASON : null;
}

/** Why the Block or Apartado cannot go into the section, or null: the carátula takes concepts and subbloques only. */
function destinationContentReason(destination: Pick<AppSection, "id">, item: Block | Apartado): string | null {
  return isCaratula(destination) && containersOf(item).some((container) => container.images.length > 0 || container.tables.length > 0)
    ? CARATULA_CONTENT_REASON
    : null;
}

function findContainer(sections: AppSection[], address: ContainerAddress) {
  const section = sections.find((item) => item.id === address.sectionId);
  const block = section?.blocks.find((item) => item.id === address.blockId);
  if (!section || !block) return null;
  if (!address.apartadoId) return { section, block, container: block as Block | Apartado };
  const apartado = block.apartados.find((item) => item.id === address.apartadoId);
  return apartado ? { section, block, container: apartado as Block | Apartado } : null;
}

const sameContainer = (a: ContainerAddress, b: ContainerAddress) =>
  a.sectionId === b.sectionId && a.blockId === b.blockId && (a.apartadoId ?? null) === (b.apartadoId ?? null);

function mapBlock(sections: AppSection[], sectionId: string, blockId: string, fn: (block: Block) => Block): AppSection[] {
  return sections.map((section) => section.id !== sectionId ? section : {
    ...section,
    blocks: section.blocks.map((block) => (block.id === blockId ? fn(block) : block)),
  });
}

/** A Block after its own content or its Apartados changed: layout and flow follow, keeping their order. */
function withReconciledBlock(block: Block): Block {
  const contentLayout = resolveContentLayout(block);
  const next = { ...block, contentLayout };
  const flow = isBlockFlowV2(block.blockFlow) ? normalizeBlockFlowV2(next, block.blockFlow) : resolveBlockFlowV2(next);
  return { ...next, blockFlow: flow };
}

function mapContainer(
  sections: AppSection[],
  address: ContainerAddress,
  fn: (container: Block | Apartado) => Block | Apartado,
): AppSection[] {
  return mapBlock(sections, address.sectionId, address.blockId, (block) => {
    if (!address.apartadoId) return withReconciledBlock(fn(block) as Block);
    return {
      ...block,
      apartados: block.apartados.map((apartado) => (apartado.id === address.apartadoId ? fn(apartado) as Apartado : apartado)),
    };
  });
}

/* ================================================================== */
/*  CONCEPTS — "Mover a…"                                              */
/* ================================================================== */

/**
 * Moves the chosen concepts of a container to another one, in the same
 * section or another. They keep their order and the rows they share: each
 * row of the source that holds chosen concepts becomes a row of the
 * destination with those concepts side by side, after what it already holds.
 */
export function moveConceptsTo(
  sections: AppSection[],
  source: ContainerAddress,
  conceptIds: readonly string[],
  destination: ContainerAddress,
  /** Where they land; without one they go to the end, and never to the container they are in. */
  position?: TransferPosition,
): TransferResult {
  if (!position && sameContainer(source, destination)) return unchanged(sections, "Los conceptos ya están ahí.");
  const from = findContainer(sections, source);
  const to = findContainer(sections, destination);
  if (!from || !to) return unchanged(sections, MISSING_REASON);
  const fromLock = source.blockId !== destination.blockId || source.sectionId !== destination.sectionId
    ? blockLockReason(from.section, source.blockId) ?? blockLockReason(to.section, destination.blockId)
    : null;
  if (fromLock) return unchanged(sections, fromLock);

  const chosen = new Set(conceptIds.filter((id) => from.container.concepts.some((concept) => concept.id === id)));
  if (!chosen.size) return unchanged(sections, "No hay conceptos seleccionados.");

  // The chosen rows, in document order, out of the source layout.
  const layout = resolveContentLayout(from.container);
  const movedRows: ContentLayoutColumnV2[][] = [];
  const remainingRows: ContentLayoutRowV2[] = [];
  for (const row of layout.rows) {
    const moved = row.columns.filter((column) => isChosenConcept(column, chosen));
    const kept = row.columns.filter((column) => !isChosenConcept(column, chosen));
    if (moved.length) movedRows.push(moved);
    if (kept.length) remainingRows.push({ ...row, columns: kept });
  }
  const order = movedRows.flatMap((columns) => columns.map((column) => column.items[0].id));
  const byId = new Map(from.container.concepts.map((concept) => [concept.id, concept]));
  const moving = order.map((id) => byId.get(id)).filter((concept): concept is Concept => Boolean(concept));

  // A full link reads from its first concept in document order: settle it before the order changes.
  const allConcepts = sections.flatMap((section) => section.blocks.flatMap((block) => [
    ...block.concepts,
    ...block.apartados.flatMap((apartado) => apartado.concepts),
  ]));
  const pinned = new Map(moving.flatMap((concept) => pinFullLinkResolution(concept.id, allConcepts)).map((concept) => [concept.id, concept]));
  const settle = (concept: Concept) => pinned.get(concept.id) ?? concept;
  let next = pinned.size === 0 ? sections : sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      concepts: block.concepts.map(settle),
      apartados: block.apartados.map((apartado) => ({ ...apartado, concepts: apartado.concepts.map(settle) })),
    })),
  }));

  next = mapContainer(next, source, (container) => ({
    ...container,
    concepts: container.concepts.filter((concept) => !chosen.has(concept.id)),
    contentLayout: { version: 2, rows: remainingRows },
  }));
  const moved = moving.map(settle);
  next = mapContainer(next, destination, (container) => ({
    ...placeRows(container, freshRows(resolveContentLayout(container), movedRows), position ?? AT_END),
    concepts: [...container.concepts, ...moved],
  }));
  return { changed: true, sections: next };
}

function isChosenConcept(column: ContentLayoutColumnV2, chosen: ReadonlySet<string>) {
  const item = column.items[0];
  return item?.type === "concept" && chosen.has(item.id);
}

/** The rows, under row and column ids the layout does not use yet. */
function freshRows(layout: ContentLayout, rows: ContentLayoutColumnV2[][]): ContentLayoutRowV2[] {
  const usedRows = new Set(layout.rows.map((row) => row.id));
  const usedColumns = new Set(layout.rows.flatMap((row) => row.columns.map((column) => column.id)));
  const fresh = (prefix: string, used: Set<string>) => {
    let id = `${prefix}-${newId()}`;
    while (used.has(id)) id = `${prefix}-${newId()}`;
    used.add(id);
    return id;
  };
  return rows.map((columns) => ({
    id: fresh("r", usedRows),
    columns: columns.map((column) => ({ ...column, id: usedColumns.has(column.id) ? fresh("c", usedColumns) : (usedColumns.add(column.id), column.id) })),
  }));
}

const anchorInRow = (row: BlockFlowStructuralRow, anchor: TransferAnchor) =>
  row.items.some((item) => anchor.type === "row"
    ? item.type === "content-row" && item.rowId === anchor.rowId
    : item.type === "apartado" && item.apartadoId === anchor.apartadoId);

/** Where `position` falls among `count` places, given where its anchor is (-1: gone, so the end). */
function insertionIndex(position: TransferPosition, count: number, anchorIndex: () => number): number {
  if (position.placement === "start") return 0;
  if (position.placement === "end") return count;
  const index = anchorIndex();
  if (index < 0) return count;
  return position.placement === "before" ? index : index + 1;
}

/** Index in the Block's flow where `position` falls. */
function flowInsertionIndex(flow: BlockFlowV2, position: TransferPosition): number {
  return insertionIndex(position, flow.rows.length, () =>
    position.placement === "before" || position.placement === "after"
      ? flow.rows.findIndex((row) => anchorInRow(row, position.anchor))
      : -1);
}

/**
 * The container with `rows` (already under fresh ids) placed at `position`.
 * In a Block the flow decides the order, so the rows take their place there
 * and in the layout, which keeps the flow's order of content rows.
 */
function placeRows<T extends Block | Apartado>(container: T, rows: ContentLayoutRowV2[], position: TransferPosition): T {
  const layout = resolveContentLayout(container);
  const flow = "apartados" in container ? resolveBlockFlowV2(container) : undefined;
  if (!flow) {
    const at = insertionIndex(position, layout.rows.length, () =>
      position.placement === "before" || position.placement === "after"
        ? layout.rows.findIndex((row) => position.anchor.type === "row" && row.id === position.anchor.rowId)
        : -1);
    const nextRows = [...layout.rows];
    nextRows.splice(at, 0, ...rows);
    return { ...container, contentLayout: { version: 2, rows: nextRows } };
  }
  const at = flowInsertionIndex(flow, position);
  const flowRows = [...flow.rows];
  flowRows.splice(at, 0, ...rows.map((row) => ({ id: contentRowStructuralId(row.id), items: [{ type: "content-row" as const, rowId: row.id }] })));
  const rowsBefore = new Set(flowRows.slice(0, at).flatMap((row) => row.items.flatMap((item) => (item.type === "content-row" ? [item.rowId] : []))));
  let layoutAt = 0;
  layout.rows.forEach((row, index) => { if (rowsBefore.has(row.id)) layoutAt = index + 1; });
  const nextRows = [...layout.rows];
  nextRows.splice(layoutAt, 0, ...rows);
  return { ...container, contentLayout: { version: 2, rows: nextRows }, blockFlow: { version: 2, rows: flowRows } };
}

/* ================================================================== */
/*  CONCEPTS — several dragged at once                                 */
/* ================================================================== */

/**
 * Drops the concepts chosen with "Seleccionar conceptos" where one of them
 * was dragged to (video 5.6, 4:13): the dragged one takes the slot and the
 * others gather around it in their order, those that came before it above
 * and the rest below, with the ones that shared a row still together. One
 * result, so it is a single undo step.
 *
 * Only the chosen concepts of the dragged one's container go, and only
 * those the drop may take (`rules`).
 */
export function moveConceptGroupToDrop(
  sections: AppSection[],
  sectionId: string,
  source: ContentDropSource,
  conceptIds: readonly string[],
  target: ContentDropTarget,
  rules: ContentMoveRules,
): TransferResult {
  const section = sections.find((item) => item.id === sectionId);
  if (!section) return unchanged(sections, MISSING_REASON);
  const sourceAddress: ContainerAddress = { sectionId, blockId: source.container.blockId, ...(source.container.kind === "apartado" ? { apartadoId: source.container.apartadoId } : {}) };
  const from = findContainer(sections, sourceAddress);
  if (!from) return unchanged(sections, MISSING_REASON);

  const chosen = new Set(conceptIds);
  const ordered = resolveContentLayout(from.container).rows
    .flatMap((row) => row.columns.map((column) => column.items[0]))
    .flatMap((item) => (item?.type === "concept" && chosen.has(item.id) ? [item.id] : []))
    .filter((id) => id === source.itemId || canMoveContent(rules, { ...source, itemType: "concept", itemId: id }, target.container));
  const draggedAt = ordered.indexOf(source.itemId);

  // A full link reads from its first concept in document order: settle it before the order changes.
  const allConcepts = sections.flatMap((item) => item.blocks.flatMap((block) => [...block.concepts, ...block.apartados.flatMap((apartado) => apartado.concepts)]));
  const pinned = new Map(pinFullLinkResolution(source.itemId, allConcepts).map((concept) => [concept.id, concept]));
  const settle = (concept: Concept) => pinned.get(concept.id) ?? concept;
  const blocks = pinned.size === 0 ? section.blocks : section.blocks.map((block) => ({
    ...block,
    concepts: block.concepts.map(settle),
    apartados: block.apartados.map((apartado) => ({ ...apartado, concepts: apartado.concepts.map(settle) })),
  }));
  const dropped = applyContentDropToBlocks(blocks, source, target, rules);
  if (!dropped.changed) return unchanged(sections, "");
  let next = sections.map((item) => (item.id === sectionId ? { ...item, blocks: dropped.blocks } : item));
  if (draggedAt < 0) return { changed: true, sections: next };

  // Where the dragged one landed: the others go around its row.
  const landed = dropped.blocks.find((block) => block.id === target.container.blockId);
  const landedIn = target.container.kind === "apartado"
    ? landed?.apartados.find((apartado) => target.container.kind === "apartado" && apartado.id === target.container.apartadoId)
    : landed;
  const anchorRow = landedIn
    ? resolveContentLayout(landedIn).rows.find((row) => row.columns.some((column) => column.items.some((item) => item.type === "concept" && item.id === source.itemId)))
    : undefined;
  if (!anchorRow) return { changed: true, sections: next };
  const destination: ContainerAddress = { sectionId, blockId: target.container.blockId, ...(target.container.kind === "apartado" ? { apartadoId: target.container.apartadoId } : {}) };
  const anchor: TransferAnchor = { type: "row", rowId: anchorRow.id };

  const before = ordered.slice(0, draggedAt);
  const after = ordered.slice(draggedAt + 1);
  if (before.length) next = moveConceptsTo(next, sourceAddress, before, destination, { placement: "before", anchor }).sections;
  if (after.length) next = moveConceptsTo(next, sourceAddress, after, destination, { placement: "after", anchor }).sections;
  return { changed: true, sections: next };
}

/* ================================================================== */
/*  COPIES — new ids for everything                                    */
/* ================================================================== */

export type CopyOptions = {
  /** Keep the captured values (concept values, table cells). Formulas are kept either way. */
  includeData?: boolean;
  /** Keep the images. */
  includeImages?: boolean;
};

type CopyContext = {
  concepts: Map<string, string>;
  tables: Map<string, string>;
  keys: Map<string, string>;
  /** Link keys shared with concepts outside the copy: the copy stays linked to them. */
  externalKeys: ReadonlySet<string>;
  options: Required<CopyOptions>;
  /** Every id stays: the same content without its data, for a document of its own (a template). */
  keepIds: boolean;
};

const COPY_ALL: Required<CopyOptions> = { includeData: true, includeImages: true };

function containersOf(item: Block | Apartado): Array<Block | Apartado> {
  return "apartados" in item ? [item, ...item.apartados] : [item];
}

/** The link keys of the concepts outside `inside` (by concept id). */
function keysOutside(sections: AppSection[], inside: ReadonlySet<string>): Set<string> {
  const keys = new Set<string>();
  for (const section of sections) {
    for (const block of section.blocks) {
      for (const container of containersOf(block)) {
        for (const concept of container.concepts) {
          if (inside.has(concept.id)) continue;
          if (concept.labelKey) keys.add(concept.labelKey);
          if (concept.valueKey) keys.add(concept.valueKey);
        }
      }
    }
  }
  return keys;
}

function createCopyContext(item: Block | Apartado, sections: AppSection[], options: CopyOptions, keepIds = false): CopyContext {
  const concepts = new Map<string, string>();
  const tables = new Map<string, string>();
  for (const container of containersOf(item)) {
    for (const concept of container.concepts) concepts.set(concept.id, keepIds ? concept.id : newId());
    for (const table of container.tables) tables.set(table.id, keepIds ? table.id : `tbl-${newId()}`);
  }
  return {
    concepts,
    tables,
    keys: new Map(),
    externalKeys: keepIds ? new Set() : keysOutside(sections, new Set(concepts.keys())),
    options: { ...COPY_ALL, ...options },
    keepIds,
  };
}

function copyKey(key: string | undefined, context: CopyContext): string | undefined {
  if (!key || context.keepIds || context.externalKeys.has(key)) return key;
  let copied = context.keys.get(key);
  if (!copied) {
    copied = `${newId()}-key`;
    context.keys.set(key, copied);
  }
  return copied;
}

type IdMaps = Pick<CopyContext, "concepts" | "tables">;

function remapOperand(operand: FormulaOperand, context: IdMaps): FormulaOperand {
  if (operand.type === "concept") return { ...operand, conceptId: context.concepts.get(operand.conceptId) ?? operand.conceptId };
  if ((operand.type === "cell" || operand.type === "span") && operand.tableId) {
    return { ...operand, tableId: context.tables.get(operand.tableId) ?? operand.tableId };
  }
  return operand;
}

function remapExpression(expression: FormulaExpression, context: IdMaps): FormulaExpression {
  switch (expression.type) {
    case "operand":
      return { ...expression, operand: remapOperand(expression.operand, context) };
    case "binary":
    case "compare":
      return { ...expression, left: remapExpression(expression.left, context), right: remapExpression(expression.right, context) };
    case "function":
      return { ...expression, args: expression.args.map((arg) => remapExpression(arg, context)) };
    default:
      return expression;
  }
}

/** The formula pointing at the copies of what it pointed at inside the copy. */
function remapFormula(formula: TableFormula, context: IdMaps): TableFormula {
  return { ...formula, expression: remapExpression(formula.expression, context) };
}

function copyConcept(concept: Concept, context: CopyContext): Concept {
  const copy: Concept = {
    ...concept,
    id: context.concepts.get(concept.id) ?? newId(),
    labelKey: copyKey(concept.labelKey, context),
    valueKey: copyKey(concept.valueKey, context),
  };
  if (concept.formula) copy.formula = remapFormula(concept.formula, context);
  if (!context.options.includeData) copy.value = "";
  if (!copy.labelKey) delete copy.labelKey;
  if (!copy.valueKey) delete copy.valueKey;
  return copy;
}

/** A table row is data when one of its cells holds a written value. */
const rowHasFormula = (row: TableRow) => Object.values(row.cells ?? {}).some((cell) => cell?.kind === "formula");

function copyTable(table: TableContent, context: CopyContext): TableContent {
  const id = context.tables.get(table.id) ?? `tbl-${newId()}`;
  if (table.version !== 2) {
    const rows = context.options.includeData ? table.rows : table.rows.slice(0, 1).map((row) => row.map(() => ""));
    return { ...table, id, rows };
  }
  const rows = table.rows as unknown as TableRow[];
  const remapped = rows.map((row) => ({
    ...row,
    cells: Object.fromEntries(Object.entries(row.cells ?? {}).map(([columnId, cell]) => [
      columnId,
      cell.kind === "formula"
        ? { ...cell, formula: remapFormula(cell.formula, context) }
        : context.options.includeData ? cell : { ...cell, value: "" },
    ])),
  }));
  // Without data the table keeps its headers, its formula rows and one empty row to start from.
  const kept = context.options.includeData ? remapped : remapped.filter(rowHasFormula);
  const finalRows = kept.length || !remapped.length ? kept : [remapped[0]];
  const schema = table.schema as TableSchema | undefined;
  const copiedSchema = schema?.resultGroups
    ? {
        ...schema,
        resultGroups: schema.resultGroups.map((group) => ({
          ...group,
          items: group.items.map((item) => (item.formula ? { ...item, formula: remapFormula(item.formula, context) } : item)),
        })),
      }
    : schema;
  return {
    ...table,
    id,
    rows: finalRows as unknown as TableContent["rows"],
    ...(copiedSchema ? { schema: copiedSchema } : {}),
  };
}

function copyContent<T extends Block | Apartado>(container: T, context: CopyContext): T {
  const images = new Map<string, string>();
  const keptImages: ImageContent[] = context.options.includeImages
    ? container.images.map((image) => {
        const id = context.keepIds ? image.id : newId();
        images.set(image.id, id);
        return { ...image, id };
      })
    : [];
  const refId = (type: "concept" | "image" | "table", id: string) =>
    (type === "concept" ? context.concepts : type === "table" ? context.tables : images).get(id);
  const contentLayout = container.contentLayout
    ? {
        version: 2 as const,
        rows: container.contentLayout.rows.map((row) => ({
          ...row,
          columns: row.columns
            .map((column) => ({
              ...column,
              items: column.items
                .map((item) => {
                  const id = refId(item.type, item.id);
                  return id ? { ...item, id } : null;
                })
                .filter((item): item is NonNullable<typeof item> => item !== null),
            }))
            .filter((column) => column.items.length > 0),
        })).filter((row) => row.columns.length > 0),
      }
    : undefined;
  return {
    ...container,
    concepts: container.concepts.map((concept) => copyConcept(concept, context)),
    tables: container.tables.map((table) => copyTable(table, context)),
    images: keptImages,
    ...(contentLayout ? { contentLayout } : {}),
  };
}

function copyApartadoWith(apartado: Apartado, context: CopyContext): Apartado {
  const copy = copyContent(apartado, context);
  return { ...copy, id: context.keepIds ? apartado.id : newId(), contentLayout: resolveContentLayout(copy) };
}

/**
 * A copy of the Apartado with new ids for itself and all it holds. `sections`
 * is the document the copy goes into: links to concepts outside the copy are
 * kept against it.
 */
export function copyApartado(apartado: Apartado, sections: AppSection[], options: CopyOptions = {}): Apartado {
  return copyApartadoWith(apartado, createCopyContext(apartado, sections, options));
}

/** A copy of the Block with new ids for itself, its Apartados and all they hold. */
export function copyBlock(block: Block, sections: AppSection[], options: CopyOptions = {}): Block {
  return copyBlockWith(block, createCopyContext(block, sections, options));
}

/**
 * The Block as it is, ids included, without the data or the images the
 * options leave out: what a template keeps of it.
 */
export function blockWithoutData(block: Block, options: CopyOptions): Block {
  return copyBlockWith(block, createCopyContext(block, [], options, true));
}

function copyBlockWith(block: Block, context: CopyContext): Block {
  const apartadoIds = new Map<string, string>();
  const apartados = block.apartados.map((apartado) => {
    const copy = copyApartadoWith(apartado, context);
    apartadoIds.set(apartado.id, copy.id);
    return copy;
  });
  const content = copyContent(block, context);
  const blockFlow = isBlockFlowV2(block.blockFlow)
    ? {
        version: 2 as const,
        rows: block.blockFlow.rows.map((row) => ({
          ...row,
          id: context.keepIds ? row.id : newId(),
          items: row.items.map((item) => item.type === "apartado"
            ? { ...item, apartadoId: apartadoIds.get(item.apartadoId) ?? item.apartadoId }
            : item),
        })),
      }
    : undefined;
  return withReconciledBlock({
    ...content,
    id: context.keepIds ? block.id : newId(),
    apartados,
    ...(blockFlow ? { blockFlow } : {}),
  });
}

/** Images of Datos generales are files of their own service, known by id: a copy cannot take them there. */
function withoutImagesFor<T extends Block | Apartado>(sectionId: string, item: T): T {
  if (!isRelationManagedImageSection(sectionId)) return item;
  const strip = <C extends Block | Apartado>(container: C): C => {
    const next = { ...container, images: [] };
    return { ...next, contentLayout: resolveContentLayout(next) };
  };
  if (!("apartados" in item)) return strip(item);
  const block = item as Block;
  return withReconciledBlock(strip({ ...block, apartados: block.apartados.map(strip) })) as T;
}

const hasImages = (item: Block | Apartado) => containersOf(item).some((container) => container.images.length > 0);

/* ================================================================== */
/*  BLOCKS                                                             */
/* ================================================================== */

function insertBlock(sections: AppSection[], sectionId: string, block: Block, afterBlockId?: string): AppSection[] {
  return sections.map((section) => {
    if (section.id !== sectionId) return section;
    const index = afterBlockId ? section.blocks.findIndex((item) => item.id === afterBlockId) : -1;
    const blocks = [...section.blocks];
    blocks.splice(index >= 0 ? index + 1 : blocks.length, 0, block);
    return { ...section, blocks };
  });
}

/** A copy of the Block right after it. */
export function duplicateBlock(sections: AppSection[], sectionId: string, blockId: string): TransferResult {
  const section = sections.find((item) => item.id === sectionId);
  const block = section?.blocks.find((item) => item.id === blockId);
  if (!section || !block) return unchanged(sections, MISSING_REASON);
  const lock = blockCopyLockReason(section, blockId);
  if (lock) return unchanged(sections, lock);
  return { changed: true, sections: insertBlock(sections, sectionId, copyBlock(block, sections), blockId) };
}

/** Moves the Block to the end of another section, with its ids. */
export function moveBlockToSection(sections: AppSection[], sectionId: string, blockId: string, destinationSectionId: string): TransferResult {
  if (sectionId === destinationSectionId) return unchanged(sections, "El bloque ya está en esa sección.");
  const section = sections.find((item) => item.id === sectionId);
  const destination = sections.find((item) => item.id === destinationSectionId);
  const block = section?.blocks.find((item) => item.id === blockId);
  if (!section || !destination || !block) return unchanged(sections, MISSING_REASON);
  const lock = blockMoveLockReason(section, blockId) ?? destinationContentReason(destination, block);
  if (lock) return unchanged(sections, lock);
  if (isRelationManagedImageSection(destinationSectionId) && hasImages(block)) {
    return unchanged(sections, "Las imágenes de Datos generales se suben en esa sección: quita las imágenes del bloque antes de moverlo ahí.");
  }
  const removed = sections.map((item) => item.id !== sectionId ? item : { ...item, blocks: item.blocks.filter((candidate) => candidate.id !== blockId) });
  return { changed: true, sections: insertBlock(removed, destinationSectionId, block) };
}

/** A copy of the Block (taken earlier) pasted at the end of a section, or after one of its Blocks. */
export function pasteBlock(sections: AppSection[], destinationSectionId: string, block: Block, options: CopyOptions & { afterBlockId?: string } = {}): TransferResult {
  const destination = sections.find((item) => item.id === destinationSectionId);
  if (!destination) return unchanged(sections, MISSING_REASON);
  const contentLock = destinationContentReason(destination, block);
  if (contentLock) return unchanged(sections, contentLock);
  const copy = withoutImagesFor(destinationSectionId, copyBlock(block, sections, options));
  return { changed: true, sections: insertBlock(sections, destinationSectionId, copy, options.afterBlockId) };
}

/* ================================================================== */
/*  APARTADOS                                                          */
/* ================================================================== */

/** The Block with `apartado` placed right after `afterApartadoId` in its flow, or at its end. */
function insertApartado(block: Block, apartado: Apartado, afterApartadoId?: string): Block {
  const apartados = [...block.apartados];
  const index = afterApartadoId ? apartados.findIndex((item) => item.id === afterApartadoId) : -1;
  apartados.splice(index >= 0 ? index + 1 : apartados.length, 0, apartado);
  const flow = resolveBlockFlowV2(block);
  if (!flow || !afterApartadoId) return withReconciledBlock({ ...block, apartados });
  const rowIndex = flow.rows.findIndex((row) => row.items.some((item) => item.type === "apartado" && item.apartadoId === afterApartadoId));
  if (rowIndex < 0) return withReconciledBlock({ ...block, apartados });
  const rows = [...flow.rows];
  rows.splice(rowIndex + 1, 0, { id: newId(), items: [{ type: "apartado", apartadoId: apartado.id }] });
  return withReconciledBlock({ ...block, apartados, blockFlow: { version: 2, rows } });
}

function removeApartado(block: Block, apartadoId: string): Block {
  return withReconciledBlock({ ...block, apartados: block.apartados.filter((item) => item.id !== apartadoId) });
}

/** A copy of the Apartado right after it. */
export function duplicateApartado(sections: AppSection[], sectionId: string, blockId: string, apartadoId: string): TransferResult {
  const found = findContainer(sections, { sectionId, blockId, apartadoId });
  if (!found) return unchanged(sections, MISSING_REASON);
  const lock = structureLockReason(found.section, blockId);
  if (lock) return unchanged(sections, lock);
  const copy = copyApartado(found.container as Apartado, sections);
  return { changed: true, sections: mapBlock(sections, sectionId, blockId, (block) => insertApartado(block, copy, apartadoId)) };
}

/** The Apartado's pinned tables (the measures of the Terreno, the cost captures) keep it where it is. */
function hasPinnedContent(section: AppSection, apartado: Apartado) {
  const { pinnedItems } = contentMoveRulesForSection(section);
  return apartado.tables.some((table) => pinnedItems.has(contentItemKey("table", table.id)));
}

const PINNED_APARTADO_REASON = "Este apartado tiene una tabla que se llena desde su lugar: no se mueve.";

/**
 * The Blocks of the section an Apartado is dragged between, as with "Mover
 * a…": every Block whose structure is not locked, in the carátula too (its
 * assumptions and conclusion as well).
 */
export function apartadoDragBlockIds(section: AppSection): Set<string> {
  return new Set(section.blocks.filter((block) => structureLockReason(section, block.id) === null).map((block) => block.id));
}

/**
 * Why the Apartado cannot be dragged to another Block of its section, or
 * null: in the carátula, one with tables or images (the carátula takes
 * concepts and subbloques only); anywhere, one with a pinned table.
 */
export function apartadoCrossBlockReason(section: AppSection, apartado: Apartado): string | null {
  return destinationContentReason(section, apartado) ?? (hasPinnedContent(section, apartado) ? PINNED_APARTADO_REASON : null);
}

/**
 * Moves the Apartado, with its ids, to another Block of this or another
 * section: at its end, or at `position` (also inside its own Block).
 */
export function moveApartadoTo(
  sections: AppSection[],
  source: Required<ContainerAddress>,
  destination: Omit<ContainerAddress, "apartadoId">,
  position?: TransferPosition,
): TransferResult {
  const sameBlock = source.sectionId === destination.sectionId && source.blockId === destination.blockId;
  if (sameBlock && !position) return unchanged(sections, "El apartado ya está en ese bloque.");
  const from = findContainer(sections, source);
  const to = findContainer(sections, destination);
  if (!from || !to) return unchanged(sections, MISSING_REASON);
  const lock = structureLockReason(from.section, source.blockId) ?? structureLockReason(to.section, destination.blockId);
  if (lock) return unchanged(sections, lock);
  const apartado = from.container as Apartado;
  const contentLock = destinationContentReason(to.section, apartado);
  if (contentLock) return unchanged(sections, contentLock);
  if (!sameBlock && hasPinnedContent(from.section, apartado)) return unchanged(sections, PINNED_APARTADO_REASON);
  if (isRelationManagedImageSection(destination.sectionId) && apartado.images.length && !sameBlock) {
    return unchanged(sections, "Las imágenes de Datos generales se suben en esa sección: quita las imágenes del apartado antes de moverlo ahí.");
  }
  const removed = mapBlock(sections, source.sectionId, source.blockId, (block) => removeApartado(block, apartado.id));
  return { changed: true, sections: mapBlock(removed, destination.sectionId, destination.blockId, (block) => placeApartado(block, apartado, position ?? AT_END)) };
}

/** The Block with `apartado` at `position` in its flow. */
function placeApartado(block: Block, apartado: Apartado, position: TransferPosition): Block {
  const flow = resolveBlockFlowV2(block);
  const apartados = [...block.apartados, apartado];
  if (!flow) return withReconciledBlock({ ...block, apartados });
  const rows = [...flow.rows];
  rows.splice(flowInsertionIndex(flow, position), 0, { id: `bf-${newId()}`, items: [{ type: "apartado", apartadoId: apartado.id }] });
  return withReconciledBlock({ ...block, apartados, blockFlow: { version: 2, rows } });
}

/** A copy of the Apartado (taken earlier) pasted at the end of a Block. */
export function pasteApartado(sections: AppSection[], destination: Omit<ContainerAddress, "apartadoId">, apartado: Apartado, options: CopyOptions = {}): TransferResult {
  const to = findContainer(sections, destination);
  if (!to) return unchanged(sections, MISSING_REASON);
  const lock = structureLockReason(to.section, destination.blockId) ?? destinationContentReason(to.section, apartado);
  if (lock) return unchanged(sections, lock);
  const copy = withoutImagesFor(destination.sectionId, copyApartado(apartado, sections, options));
  return { changed: true, sections: mapBlock(sections, destination.sectionId, destination.blockId, (block) => insertApartado(block, copy)) };
}

/* ================================================================== */
/*  DESTINATIONS — what the pickers offer                              */
/* ================================================================== */

export type TransferDestination = {
  address: ContainerAddress;
  sectionTitle: string;
  blockTitle: string;
  apartadoTitle?: string;
  /** Where the moved things are now: choosing it only changes their place inside it. */
  here?: boolean;
};

const sectionName = (section: AppSection) => section.title || section.label || section.id;
const blockName = (block: Block, section: AppSection) => block.title || sectionName(section);

/** Every Block and Apartado the chosen concepts may go to; the source too, to change their place inside it. */
export function conceptDestinations(sections: AppSection[], source: ContainerAddress): TransferDestination[] {
  const from = findContainer(sections, source);
  if (!from) return [];
  const sourceLocked = blockLockReason(from.section, source.blockId) !== null;
  const destinations: TransferDestination[] = [];
  for (const section of sections) {
    const { lockedBlockIds } = contentMoveRulesForSection(section);
    for (const block of section.blocks) {
      const sameBlock = section.id === source.sectionId && block.id === source.blockId;
      if (!sameBlock && (sourceLocked || lockedBlockIds.has(block.id))) continue;
      const base = { sectionTitle: sectionName(section), blockTitle: blockName(block, section) };
      const blockAddress = { sectionId: section.id, blockId: block.id };
      destinations.push({ ...base, address: blockAddress, here: sameContainer(blockAddress, source) });
      for (const apartado of block.apartados) {
        const address = { ...blockAddress, apartadoId: apartado.id };
        destinations.push({ ...base, address, apartadoTitle: apartado.title, here: sameContainer(address, source) });
      }
    }
  }
  return destinations;
}

/** The sections a Block may move to: the carátula only for a Block of concepts and subbloques. */
export function blockDestinationSections(sections: AppSection[], sectionId: string, block?: Block): AppSection[] {
  return sections.filter((section) => section.id !== sectionId && !(block && destinationContentReason(section, block)));
}

/** The Blocks an Apartado may move or be pasted to; `current` is the Block it is in, offered to change its place there. */
export function apartadoDestinations(sections: AppSection[], current?: Omit<ContainerAddress, "apartadoId">, apartado?: Apartado): TransferDestination[] {
  return sections.flatMap((section) => section.blocks
    .filter((block) => structureLockReason(section, block.id) === null)
    .filter(() => !(apartado && destinationContentReason(section, apartado)))
    .map((block) => ({
      address: { sectionId: section.id, blockId: block.id },
      sectionTitle: sectionName(section),
      blockTitle: blockName(block, section),
      here: Boolean(current && section.id === current.sectionId && block.id === current.blockId),
    })));
}

/** A place inside the chosen Block or Apartado, as the picker offers it. */
export type TransferPositionOption = { key: string; label: string; position: TransferPosition };

const POSITION_LABEL_LENGTH = 48;

function shortName(text: string | undefined, fallback: string): string {
  const plain = stripTextMarks(text ?? "").replace(/\s+/g, " ").trim();
  if (!plain) return fallback;
  return plain.length > POSITION_LABEL_LENGTH ? `${plain.slice(0, POSITION_LABEL_LENGTH - 1)}…` : plain;
}

/**
 * The places inside a Block or Apartado where moved concepts or a moved
 * Apartado may go: before each of its rows (and, in a Block, before each of
 * its Apartados), or at the end. What is being moved is not a place.
 */
export function transferPositions(
  sections: AppSection[],
  destination: ContainerAddress,
  moving: { conceptIds?: readonly string[]; apartadoId?: string } = {},
): TransferPositionOption[] {
  const found = findContainer(sections, destination);
  if (!found) return [];
  const { container } = found;
  const movingConcepts = new Set(moving.conceptIds ?? []);
  const layout = resolveContentLayout(container);
  const rowsById = new Map(layout.rows.map((row) => [row.id, row]));
  const names = new Map<string, string>([
    ...container.concepts.map((concept) => [concept.id, shortName(concept.label, "concepto sin nombre")] as const),
    ...container.images.map((image) => [image.id, shortName(image.title, "imagen")] as const),
    ...container.tables.map((table) => [table.id, shortName(table.title, "tabla")] as const),
  ]);

  const options: TransferPositionOption[] = [];
  const contentRow = (rowId: string) => {
    const row = rowsById.get(rowId);
    if (!row) return;
    const items = row.columns.flatMap((column) => column.items.slice(0, 1));
    const staying = items.filter((item) => !(item.type === "concept" && movingConcepts.has(item.id)));
    if (!staying.length) return;
    options.push({
      key: `row:${rowId}`,
      label: `Antes de «${staying.map((item) => names.get(item.id) ?? item.type).join(" · ")}»`,
      position: { placement: "before", anchor: { type: "row", rowId } },
    });
  };

  const flow = "apartados" in container ? resolveBlockFlowV2(container) : undefined;
  if (!flow) {
    layout.rows.forEach((row) => contentRow(row.id));
  } else {
    const apartados = new Map((container as Block).apartados.map((apartado) => [apartado.id, apartado]));
    for (const row of flow.rows) {
      const first = row.items[0];
      if (first?.type === "content-row") {
        contentRow(first.rowId);
        continue;
      }
      const staying = row.items.flatMap((item) => (item.type === "apartado" && item.apartadoId !== moving.apartadoId ? [item.apartadoId] : []));
      if (!staying.length) continue;
      const titles = staying.map((id) => `«${shortName(apartados.get(id)?.title, "sin título")}»`);
      options.push({
        key: `apartado:${staying[0]}`,
        label: titles.length === 1 ? `Antes del subbloque ${titles[0]}` : `Antes de los subbloques ${titles.join(" y ")}`,
        position: { placement: "before", anchor: { type: "apartado", apartadoId: staying[0] } },
      });
    }
  }
  options.push({ key: "end", label: "Al final", position: AT_END });
  return options;
}
