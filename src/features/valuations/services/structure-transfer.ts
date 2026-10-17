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
 *    replace), the carátula's fixed Blocks and the content pinned to its
 *    Apartado are never moved or copied (see content-move-rules.ts).
 *
 * Pure: no side effects, no rendering.
 */

import { pinFullLinkResolution } from "../concept-links";
import type {
  Apartado,
  AppSection,
  Block,
  Concept,
  ContentLayout,
  ContentLayoutColumnV2,
  ContentLayoutRowV2,
  ImageContent,
  TableContent,
} from "../model";
import { normalizeBlockFlowV2, resolveBlockFlowV2, isBlockFlowV2 } from "./block-flow";
import { resolveContentLayout } from "./content-layout";
import { contentItemKey } from "./content-drop";
import { contentMoveRulesForSection } from "./content-move-rules";
import { isRelationManagedImageSection } from "./image-source";
import type { FormulaExpression, FormulaOperand, TableFormula, TableRow, TableSchema } from "./table";

/* ================================================================== */
/*  ADDRESSES AND LOCKS                                                */
/* ================================================================== */

/** A Block, or one of its Apartados, somewhere in the document. */
export type ContainerAddress = { sectionId: string; blockId: string; apartadoId?: string };

export type TransferResult = { changed: boolean; sections: AppSection[]; reason?: string };

const unchanged = (sections: AppSection[], reason: string): TransferResult => ({ changed: false, sections, reason });

/** The carátula keeps its own Blocks: they take no Block or Apartado from elsewhere and give none. */
const isCaratula = (section: Pick<AppSection, "id">) => section.id === "caratula";

export const LOCKED_BLOCK_REASON = "Este bloque lo escribe el cálculo o tiene un lugar fijo: no se mueve ni se copia.";
const CARATULA_REASON = "Los bloques de la carátula no se mueven ni se copian a otras secciones.";
const MISSING_REASON = "El destino ya no existe.";

const newId = () => crypto.randomUUID();

/** Why the Block can give or take no content, or null when it can. */
export function blockLockReason(section: AppSection, blockId: string): string | null {
  return contentMoveRulesForSection(section).lockedBlockIds.has(blockId) ? LOCKED_BLOCK_REASON : null;
}

/** Why the Block (or the Apartados inside it) cannot be moved, copied or duplicated, or null. */
export function structureLockReason(section: AppSection, blockId: string): string | null {
  if (isCaratula(section)) return CARATULA_REASON;
  return blockLockReason(section, blockId);
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
): TransferResult {
  if (sameContainer(source, destination)) return unchanged(sections, "Los conceptos ya están ahí.");
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
    ...container,
    concepts: [...container.concepts, ...moved],
    contentLayout: appendRows(resolveContentLayout(container), movedRows),
  }));
  return { changed: true, sections: next };
}

function isChosenConcept(column: ContentLayoutColumnV2, chosen: ReadonlySet<string>) {
  const item = column.items[0];
  return item?.type === "concept" && chosen.has(item.id);
}

/** The layout with the rows appended at its end, under ids it does not use yet. */
function appendRows(layout: ContentLayout, rows: ContentLayoutColumnV2[][]): ContentLayout {
  const usedRows = new Set(layout.rows.map((row) => row.id));
  const usedColumns = new Set(layout.rows.flatMap((row) => row.columns.map((column) => column.id)));
  const fresh = (prefix: string, used: Set<string>) => {
    let id = `${prefix}-${newId()}`;
    while (used.has(id)) id = `${prefix}-${newId()}`;
    used.add(id);
    return id;
  };
  return {
    version: 2,
    rows: [
      ...layout.rows,
      ...rows.map((columns) => ({
        id: fresh("r", usedRows),
        columns: columns.map((column) => ({ ...column, id: usedColumns.has(column.id) ? fresh("c", usedColumns) : (usedColumns.add(column.id), column.id) })),
      })),
    ],
  };
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
  const lock = structureLockReason(section, blockId);
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
  const lock = structureLockReason(section, blockId) ?? (isCaratula(destination) ? CARATULA_REASON : null);
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
  if (isCaratula(destination)) return unchanged(sections, CARATULA_REASON);
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

/** Moves the Apartado, with its ids, to the end of another Block of this or another section. */
export function moveApartadoTo(sections: AppSection[], source: Required<ContainerAddress>, destination: Omit<ContainerAddress, "apartadoId">): TransferResult {
  if (source.sectionId === destination.sectionId && source.blockId === destination.blockId) {
    return unchanged(sections, "El apartado ya está en ese bloque.");
  }
  const from = findContainer(sections, source);
  const to = findContainer(sections, destination);
  if (!from || !to) return unchanged(sections, MISSING_REASON);
  const lock = structureLockReason(from.section, source.blockId) ?? structureLockReason(to.section, destination.blockId);
  if (lock) return unchanged(sections, lock);
  const apartado = from.container as Apartado;
  if (hasPinnedContent(from.section, apartado)) return unchanged(sections, "Este apartado tiene una tabla que se llena desde su lugar: no se mueve.");
  if (isRelationManagedImageSection(destination.sectionId) && apartado.images.length) {
    return unchanged(sections, "Las imágenes de Datos generales se suben en esa sección: quita las imágenes del apartado antes de moverlo ahí.");
  }
  const removed = mapBlock(sections, source.sectionId, source.blockId, (block) => removeApartado(block, apartado.id));
  return { changed: true, sections: mapBlock(removed, destination.sectionId, destination.blockId, (block) => insertApartado(block, apartado)) };
}

/** A copy of the Apartado (taken earlier) pasted at the end of a Block. */
export function pasteApartado(sections: AppSection[], destination: Omit<ContainerAddress, "apartadoId">, apartado: Apartado, options: CopyOptions = {}): TransferResult {
  const to = findContainer(sections, destination);
  if (!to) return unchanged(sections, MISSING_REASON);
  const lock = structureLockReason(to.section, destination.blockId);
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
};

const sectionName = (section: AppSection) => section.title || section.label || section.id;
const blockName = (block: Block, section: AppSection) => block.title || sectionName(section);

/** Every Block and Apartado the chosen concepts may go to, the source excepted. */
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
      if (!sameContainer(blockAddress, source)) destinations.push({ ...base, address: blockAddress });
      for (const apartado of block.apartados) {
        const address = { ...blockAddress, apartadoId: apartado.id };
        if (!sameContainer(address, source)) destinations.push({ ...base, address, apartadoTitle: apartado.title });
      }
    }
  }
  return destinations;
}

/** The sections a Block may move to. */
export function blockDestinationSections(sections: AppSection[], sectionId: string): AppSection[] {
  return sections.filter((section) => section.id !== sectionId && !isCaratula(section));
}

/** The Blocks an Apartado may move or be pasted to; `exclude` is the Block it is in. */
export function apartadoDestinations(sections: AppSection[], exclude?: Omit<ContainerAddress, "apartadoId">): TransferDestination[] {
  return sections.flatMap((section) => section.blocks
    .filter((block) => !(exclude && section.id === exclude.sectionId && block.id === exclude.blockId))
    .filter((block) => structureLockReason(section, block.id) === null)
    .map((block) => ({
      address: { sectionId: section.id, blockId: block.id },
      sectionTitle: sectionName(section),
      blockTitle: blockName(block, section),
    })));
}
