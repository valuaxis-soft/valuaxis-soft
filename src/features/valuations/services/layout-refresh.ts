/**
 * Brings a valuation saved earlier up to the current format (video 8.3 of
 * Álvaro, 24 Nov 2026: «los cambios no aplican en avalúos que ya trabajé»).
 *
 * What the calculation writes (the `motor-…` blocks) already follows the
 * current generators every time the valuation is opened in the editor
 * (`useCalculationDocumentSync`). What does not is what the valuation took
 * from a template when it was created and is now ordinary content: the
 * concepts the calculation looks for in the document (the concluded value of
 * the conclusion and its amount in words), the blocks of the registry
 * templates. A change of that kind is a step here: a pure, idempotent change
 * that adds what the current format needs and keeps everything the appraiser
 * captured or edited (values, labels, formats, hidden flags, his own blocks
 * and their order). Each step says what it changed, so «Deshacer» takes back
 * exactly that.
 *
 * The document keeps the version it was brought up to in its carátula
 * section (`layoutVersion`); a document refreshed or declined is not
 * refreshed again on its own. To add a step: append it to `LAYOUT_STEPS`
 * with the next version and the date it ships.
 */
import { CONCLUSION_KEYS, conceptCalculationKey, isSummaryConcept } from "../calculation/conclusion-document";
import { applyTableLayout, layoutOf, sourceOf } from "../calculation/generated-table-layout";
import { DEFAULT_HOMOLOGATION_NOTE } from "../calculation/market-document";
import type { Apartado, AppSection, Block, Concept, TableContent } from "../model";
import { conclusionesSection } from "../sections/conclusiones";
import { getCanonicalSectionKey } from "../sections/section-registry";
import { contentLayoutWithOwnRowFor } from "./content-layout";
import { ensureTableV2, type TableV2 } from "./table";

/**
 * Who gets a step without asking: `all` (the tuning phase) every valuation
 * that is not concluded; `new` only the valuations created since the step
 * shipped. The others keep their format until the appraiser uses «Actualizar
 * formato». Concluded valuations never change (lifecycle-rules.ts).
 */
export type LayoutRefreshPolicy = "all" | "new";

export function layoutRefreshPolicy(value: string | undefined | null): LayoutRefreshPolicy {
  return value?.trim().toLowerCase() === "new" ? "new" : "all";
}

/** One thing a step changed, enough to take it back. */
export type LayoutChange =
  | { step: string; kind: "concept-added"; sectionId: string; blockId: string; conceptId: string; label: string }
  | { step: string; kind: "concept-keyed"; sectionId: string; blockId: string; conceptId: string; calculationKey: string }
  | { step: string; kind: "block-added"; sectionId: string; blockId: string; title: string }
  /** A table as it was before the step changed it (by id, in its block or subbloque): «Deshacer» puts it back. */
  | { step: string; kind: "table-changed"; sectionId: string; blockId: string; tableId: string; previous: TableContent }
  /**
   * A block whose content the step arranged in subbloques of its own (`parts`):
   * «Deshacer» takes the content back out of them, in the order of `previous`,
   * with whatever was written since.
   */
  | { step: string; kind: "block-changed"; sectionId: string; blockId: string; previous: Block; parts: string[] };

type LayoutStep = {
  version: number;
  id: string;
  /** The day it ships (Mexico City): with the `new` policy, valuations created since then take it on their own. */
  since: string;
  /** What it does, for the notice and the report. */
  description: string;
  apply: (sections: AppSection[]) => { sections: AppSection[]; changes: LayoutChange[] };
};

const CONCLUDED_LABEL = "Valor concluido";
const WORDS_LABEL = "Valor concluido con letra";

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

const keyOf = (concept: Concept) => conceptCalculationKey(concept);

function sectionConcepts(section: AppSection): Concept[] {
  return section.blocks.flatMap((block) => [...block.concepts, ...block.apartados.flatMap((apartado) => apartado.concepts)]);
}

function sectionIds(section: AppSection): Set<string> {
  return new Set(section.blocks.flatMap((block) => [
    block.id,
    ...block.concepts.map((concept) => concept.id),
    ...block.apartados.flatMap((apartado) => [apartado.id, ...apartado.concepts.map((concept) => concept.id)]),
  ]).map((id) => id.toLowerCase()));
}

/** An id the section does not use yet (saved ids come back in lower case). */
function freeId(base: string, used: Set<string>) {
  let id = base;
  for (let index = 2; used.has(id.toLowerCase()); index += 1) id = `${base}-${index}`;
  used.add(id.toLowerCase());
  return id;
}

/** The new concept gets a row of its own, as «Agregar» gives it, when the block keeps a layout. */
function withConceptAdded(block: Block, concept: Concept, at: number): Block {
  const concepts = [...block.concepts.slice(0, at), concept, ...block.concepts.slice(at)];
  const next = { ...block, concepts };
  return block.contentLayout ? { ...next, contentLayout: contentLayoutWithOwnRowFor(next, { type: "concept", id: concept.id }) } : next;
}

/**
 * The conclusion prints its resumen, the concluded value in its box and the
 * amount in words from the concepts of one block (video 7.1; `ConclusionValueModule`),
 * found by the concept of the concluded value. A conclusion saved without it
 * (a template of the firm made before, or the concept renamed before it had
 * its key) printed the approaches as plain concepts and no value (video 8.3,
 * «Bugambilias»). The step gives that block the two concepts: one of the
 * appraiser's that reads as such after the resumen takes the key and keeps
 * his name; otherwise they are added. Without a resumen either, the
 * template's block goes first.
 */
function conclusionValueStep(sections: AppSection[]): { sections: AppSection[]; changes: LayoutChange[] } {
  const step = "conclusion-value";
  const sectionIndex = sections.findIndex((section) => getCanonicalSectionKey(section.id) === "CONCLUSIONES" && !section.removed);
  if (sectionIndex === -1) return { sections, changes: [] };
  const section = sections[sectionIndex];
  const concepts = sectionConcepts(section);
  const hasValue = concepts.some((concept) => keyOf(concept) === CONCLUSION_KEYS.value);
  const hasWords = concepts.some((concept) => keyOf(concept) === CONCLUSION_KEYS.words);
  if (hasValue && hasWords) return { sections, changes: [] };

  const used = sectionIds(section);
  const changes: LayoutChange[] = [];
  const holdsValue = (block: Block) => block.concepts.some((concept) => keyOf(concept) === CONCLUSION_KEYS.value);
  let blockIndex = section.blocks.findIndex(holdsValue);
  if (blockIndex === -1 && hasValue) return { sections, changes: [] }; // Only inside a subbloque: the appraiser placed it; left as is.
  if (blockIndex === -1) blockIndex = section.blocks.findIndex((block) => block.concepts.some(isSummaryConcept));

  let blocks = section.blocks;
  if (blockIndex === -1) {
    // No resumen anywhere: the template's block of the concluded value, first.
    const template = conclusionesSection.blocks[0];
    const blockId = freeId(template.id, used);
    const block: Block = {
      ...template,
      id: blockId,
      concepts: template.concepts.map((concept) => ({ ...concept, id: freeId(concept.id, used) })),
      apartados: template.apartados.map((apartado) => ({
        ...apartado,
        id: freeId(apartado.id, used),
        concepts: apartado.concepts.map((concept) => ({ ...concept, id: freeId(concept.id, used) })),
      })),
    };
    changes.push({ step, kind: "block-added", sectionId: section.id, blockId, title: block.title });
    blocks = [block, ...section.blocks];
  } else {
    let block = section.blocks[blockIndex];
    const lastSummary = block.concepts.findLastIndex(isSummaryConcept);
    const afterResumen = (concept: Concept, index: number) => index > lastSummary && !keyOf(concept) && !isSummaryConcept(concept);
    let valueAt = block.concepts.findIndex((concept) => keyOf(concept) === CONCLUSION_KEYS.value);

    if (valueAt === -1) {
      const own = block.concepts.findIndex((concept, index) => {
        const label = normalize(concept.label);
        return afterResumen(concept, index) && label.startsWith("valor") && !label.includes("letra");
      });
      if (own !== -1) {
        block = { ...block, concepts: block.concepts.map((concept, index) => (index === own ? { ...concept, calculationKey: CONCLUSION_KEYS.value } : concept)) };
        changes.push({ step, kind: "concept-keyed", sectionId: section.id, blockId: block.id, conceptId: block.concepts[own].id, calculationKey: CONCLUSION_KEYS.value });
        valueAt = own;
      } else {
        const added: Concept = { id: freeId(`${block.id}-valor-concluido`, used), label: CONCLUDED_LABEL, value: "", enabled: true, calculationKey: CONCLUSION_KEYS.value };
        valueAt = lastSummary + 1 || block.concepts.length;
        block = withConceptAdded(block, added, valueAt);
        changes.push({ step, kind: "concept-added", sectionId: section.id, blockId: block.id, conceptId: added.id, label: added.label });
      }
    }

    if (!hasWords) {
      const own = block.concepts.findIndex((concept, index) => afterResumen(concept, index) && index !== valueAt && normalize(concept.label).includes("letra"));
      if (own !== -1) {
        block = { ...block, concepts: block.concepts.map((concept, index) => (index === own ? { ...concept, calculationKey: CONCLUSION_KEYS.words } : concept)) };
        changes.push({ step, kind: "concept-keyed", sectionId: section.id, blockId: block.id, conceptId: block.concepts[own].id, calculationKey: CONCLUSION_KEYS.words });
      } else {
        const added: Concept = { id: freeId(`${block.id}-valor-concluido-letra`, used), label: WORDS_LABEL, value: "", enabled: true, calculationKey: CONCLUSION_KEYS.words };
        block = withConceptAdded(block, added, valueAt + 1);
        changes.push({ step, kind: "concept-added", sectionId: section.id, blockId: block.id, conceptId: added.id, label: added.label });
      }
    }
    blocks = section.blocks.map((item, index) => (index === blockIndex ? block : item));
  }

  const next = sections.map((item, index) => (index === sectionIndex ? { ...section, blocks } : item));
  return { sections: next, changes };
}

const sameTitle = (left: string, right: string) => normalize(left) === normalize(right);

/**
 * The conclusion as the appraiser's Excel (videos 8.14, 51:16 and 8.15, 27
 * Nov 2026: «la conclusión me la tienen como si fuera un bloque… yo lo tengo
 * así… como un subbloque»): the block that held the resumen, the chart and
 * the concluded value in one fixed piece is arranged in subbloques, in his
 * order: resumen de valores, gráfica de valores (shown if the chart was on),
 * cómo se concluye (the rest of what the block held: his text, the
 * observations) and the concluded value with its amount in words, without a
 * printed title or number. Each moves, hides and is edited as any subbloque;
 * his values, names, formats and subbloques of before stay. A FIRMAS block
 * stays where it is.
 */
function conclusionSubblocksStep(sections: AppSection[]): { sections: AppSection[]; changes: LayoutChange[] } {
  const step = "conclusion-subblocks";
  const sectionIndex = sections.findIndex((section) => getCanonicalSectionKey(section.id) === "CONCLUSIONES" && !section.removed);
  if (sectionIndex === -1) return { sections, changes: [] };
  const section = sections[sectionIndex];
  const blockIndex = section.blocks.findIndex((block) => block.concepts.some((concept) => keyOf(concept) === CONCLUSION_KEYS.value));
  if (blockIndex === -1) return { sections, changes: [] };
  const block = section.blocks[blockIndex];
  const used = sectionIds(section);
  const isValue = (concept: Concept) => keyOf(concept) === CONCLUSION_KEYS.value || keyOf(concept) === CONCLUSION_KEYS.words;
  const summary = block.concepts.filter(isSummaryConcept);
  const value = block.concepts.filter(isValue);
  const rest = block.concepts.filter((concept) => !isSummaryConcept(concept) && !isValue(concept));
  const part = (id: string, title: string, concepts: Concept[], extra: Partial<Apartado> = {}): Apartado => ({
    id: freeId(`${block.id}-${id}`, used), title, enabled: true, concepts, tables: [], images: [], ...extra,
  });
  const parts: Apartado[] = [
    // A block already titled «Resumen de valores» does not print it twice.
    part("resumen-de-valores", "RESUMEN DE VALORES", summary, sameTitle(block.title, "RESUMEN DE VALORES") ? { titleHidden: true } : {}),
    part("grafica-de-valores", "GRÁFICA DE VALORES", [], { valueChart: true, enabled: Boolean(block.valueChart) }),
    ...(rest.length || block.tables.length || block.images.length
      ? [part("como-se-concluye", "CÓMO SE CONCLUYE", rest, { tables: block.tables, images: block.images })]
      : []),
    part("valor-concluido", "VALOR CONCLUIDO", value, { titleHidden: true }),
  ];
  const { valueChart: _chart, contentLayout: _layout, blockFlow: _flow, ...kept } = block;
  const arranged: Block = { ...kept, concepts: [], tables: [], images: [], apartados: [...parts, ...block.apartados] };
  const blocks = section.blocks.map((item, index) => (index === blockIndex ? arranged : item));
  return {
    sections: sections.map((item, index) => (index === sectionIndex ? { ...section, blocks } : item)),
    changes: [{ step, kind: "block-changed", sectionId: section.id, blockId: block.id, previous: block, parts: parts.map((item) => item.id) }],
  };
}

/**
 * The block as it was before the step arranged it in subbloques, with what
 * was written since: its concepts come out of the step's subbloques in their
 * order of before (one added in them since goes after), its tables and
 * images too, and the subbloques of the appraiser stay.
 */
function unarranged(block: Block, change: Extract<LayoutChange, { kind: "block-changed" }>): Block {
  const parts = new Set(change.parts);
  const moved = block.apartados.filter((apartado) => parts.has(apartado.id));
  const current = new Map(moved.flatMap((apartado) => apartado.concepts).map((concept) => [concept.id, concept]));
  const concepts = [
    ...change.previous.concepts.flatMap((concept) => (current.has(concept.id) ? [current.get(concept.id)!] : [])),
    ...[...current.values()].filter((concept) => !change.previous.concepts.some((item) => item.id === concept.id)),
    ...block.concepts,
  ];
  const { valueChart, contentLayout, blockFlow } = change.previous;
  return {
    ...block,
    concepts,
    tables: [...moved.flatMap((apartado) => apartado.tables), ...block.tables],
    images: [...moved.flatMap((apartado) => apartado.images), ...block.images],
    apartados: block.apartados.filter((apartado) => !parts.has(apartado.id)),
    ...(valueChart ? { valueChart } : {}),
    ...(contentLayout ? { contentLayout } : {}),
    ...(blockFlow ? { blockFlow } : {}),
  };
}

/** The market pages the calculation writes: their tables auto-fit their columns once the widths given before are dropped. */
const isMarketPage = (block: Block) => /^motor-mercado-.+-enfoque/i.test(block.id);

/** A table of the appraiser's made with «Tabla Homologación» as any table: its double header, columns, rows and notes stay. */
function asPlainTable(table: TableContent): TableContent | null {
  const v2 = ensureTableV2(table);
  if (v2.schema?.presetId !== "homologation") return null;
  const { presetId: _preset, ...schema } = v2.schema;
  const notes = schema.notes ?? [];
  const converted: TableV2 = {
    ...v2,
    schema: {
      ...schema,
      // Its factors' zone takes and gives columns as any double header.
      zones: schema.zones.map((zone) => ({ id: zone.id, kind: "fixed" as const, columnIds: zone.columnIds })),
      // The note of the format, under it, as the market's homologation prints it (video 8.12, 13:50).
      ...(notes.some((note) => note.text.trim() === DEFAULT_HOMOLOGATION_NOTE) ? {} : { notes: [...notes, { position: "table" as const, text: DEFAULT_HOMOLOGATION_NOTE }] }),
    },
  };
  return converted as unknown as TableContent;
}

/** The widths given by hand dropped from a market table's layout: its columns fit what they hold. */
function withAutoFitColumns(table: TableContent): TableContent | null {
  const layout = layoutOf(table);
  if (!layout.widths || !Object.keys(layout.widths).length) return null;
  const { widths: _widths, ...rest } = layout;
  return applyTableLayout(sourceOf(table), rest);
}

/**
 * The market sections as the appraiser's Excel (video 8.10 and 8.12, 26 Nov
 * 2026): every table is an ordinary table. A «Tabla Homologación» made
 * before is a table like the others (its double header of factors, its
 * columns and rows stay; it takes the note of the format under it), and the
 * market's tables drop the widths they were given, so each column fits what
 * it holds (the factors narrow) and the table fits the page.
 */
function marketTablesStep(sections: AppSection[]): { sections: AppSection[]; changes: LayoutChange[] } {
  return changedTables(sections, "market-tables", (table, block) => asPlainTable(table) ?? (isMarketPage(block) ? withAutoFitColumns(table) : null));
}

/** The machinery market's page the calculation writes (machinery-document.ts). */
const isMachineryMarketPage = (block: Block) => /^motor-maquinaria-mercado$/i.test(block.id);

/**
 * The machinery market as the real estate markets since step 2 (26 Nov 2026:
 * every change applies to every approach): its tables drop the widths they
 * were given, so each column fits what it holds (its factors narrow) and the
 * table fits the page, now that the factors are its columns.
 */
function machineryMarketTablesStep(sections: AppSection[]): { sections: AppSection[]; changes: LayoutChange[] } {
  return changedTables(sections, "machinery-market-tables", (table, block) => (isMachineryMarketPage(block) ? withAutoFitColumns(table) : null));
}

/** Every table of the document a step changes (`replace` gives the new one, or null to leave it), each change recorded to undo it. */
function changedTables(
  sections: AppSection[],
  step: string,
  replace: (table: TableContent, block: Block) => TableContent | null,
): { sections: AppSection[]; changes: LayoutChange[] } {
  const changes: LayoutChange[] = [];
  const next = sections.map((section) => {
    if (section.removed) return section;
    let touched = false;
    const blocks = section.blocks.map((block) => {
      const change = (table: TableContent) => {
        const replaced = replace(table, block);
        if (!replaced) return table;
        changes.push({ step, kind: "table-changed", sectionId: section.id, blockId: block.id, tableId: table.id, previous: table });
        touched = true;
        return replaced;
      };
      const tables = block.tables.map(change);
      const apartados = block.apartados.map((apartado) => {
        const own = apartado.tables.map(change);
        return own.some((table, index) => table !== apartado.tables[index]) ? { ...apartado, tables: own } : apartado;
      });
      const same = tables.every((table, index) => table === block.tables[index]) && apartados.every((apartado, index) => apartado === block.apartados[index]);
      return same ? block : { ...block, tables, apartados };
    });
    return touched ? { ...section, blocks } : section;
  });
  return { sections: changes.length ? next : sections, changes };
}

/** The changes of format, oldest first. */
export const LAYOUT_STEPS: readonly LayoutStep[] = [
  {
    version: 1,
    id: "conclusion-value",
    since: "2026-11-24",
    description: "La conclusión imprime el resumen de valores, el valor concluido en su recuadro y la cifra en letra.",
    apply: conclusionValueStep,
  },
  {
    version: 2,
    id: "market-tables",
    since: "2026-11-26",
    description: "Las tablas de homologación son tablas como cualquier otra, con su nota, y las columnas de las tablas de mercado se ajustan a su contenido.",
    apply: marketTablesStep,
  },
  {
    version: 3,
    id: "machinery-market-tables",
    since: "2026-11-27",
    description: "Las tablas del mercado de maquinaria y equipo ajustan sus columnas a su contenido, como las de los mercados de inmuebles.",
    apply: machineryMarketTablesStep,
  },
  {
    version: 4,
    id: "conclusion-subblocks",
    since: "2026-11-27",
    description: "La conclusión queda en subbloques, como el Excel: resumen de valores, gráfica de valores, cómo se concluye y el valor concluido con su cifra en letra, cada uno movible y editable.",
    apply: conclusionSubblocksStep,
  },
];

/** The current version of the format. */
export const LAYOUT_VERSION = Math.max(0, ...LAYOUT_STEPS.map((step) => step.version));

const isCaratula = (section: AppSection) => getCanonicalSectionKey(section.id) === "CARATULA";

/** The version the document was brought up to; 0 when never. */
export function layoutVersionOf(sections: readonly AppSection[]): number {
  return sections.find(isCaratula)?.layoutVersion ?? 0;
}

function withLayoutVersion(sections: AppSection[], version: number): AppSection[] {
  return sections.map((section) => (isCaratula(section) && section.layoutVersion !== version ? { ...section, layoutVersion: version } : section));
}

/**
 * The steps a valuation takes when it is opened: the ones after its version,
 * all of them in the tuning phase, or only those that shipped before it was
 * created with the `new` policy. `force` («Actualizar formato») takes every
 * step: they only change what is still missing.
 */
export function layoutStepsFor(options: { policy: LayoutRefreshPolicy; version: number; createdAt?: Date | string | null; force?: boolean }): LayoutStep[] {
  if (options.force) return [...LAYOUT_STEPS];
  const created = options.createdAt ? new Date(options.createdAt) : null;
  return LAYOUT_STEPS.filter((step) => step.version > options.version
    && (options.policy === "all" || (created !== null && created >= new Date(`${step.since}T00:00:00-06:00`))));
}

/**
 * Applies the steps; with a change, the document is marked with the current
 * version. Without one it is left as it was (the same array), so opening a
 * valuation already current does not make it «sin guardar».
 */
export function refreshDocumentLayout(sections: AppSection[], steps: readonly LayoutStep[] = LAYOUT_STEPS): { sections: AppSection[]; changes: LayoutChange[] } {
  let current = sections;
  const changes: LayoutChange[] = [];
  for (const step of steps) {
    const result = step.apply(current);
    current = result.sections;
    changes.push(...result.changes);
  }
  return changes.length ? { sections: withLayoutVersion(current, LAYOUT_VERSION), changes } : { sections, changes };
}

/**
 * A document made now (a new valuation, from the code's sections or from a
 * template of the firm saved before a change of format) in the current
 * format, marked with the current version: it is never offered «Actualizar
 * al formato más reciente» for a change made before it existed.
 */
export function withCurrentLayout(sections: AppSection[]): AppSection[] {
  return withLayoutVersion(refreshDocumentLayout(sections).sections, LAYOUT_VERSION);
}

/**
 * Something of the current format is still missing from this document: a
 * step after its version (the policy left it for the button) changes it.
 * A document already at the current version (new, refreshed or the refresh
 * taken back) is not; «Actualizar formato» still runs every step.
 */
export function hasPendingLayoutSteps(sections: AppSection[]): boolean {
  const version = layoutVersionOf(sections);
  return refreshDocumentLayout(sections, LAYOUT_STEPS.filter((step) => step.version > version)).changes.length > 0;
}

/**
 * Takes back what a refresh changed, and only that: what the appraiser or the
 * calculation did since stays. The document keeps the current version, so it
 * is not refreshed again on its own; «Actualizar formato» still can.
 */
export function revertLayoutRefresh(sections: AppSection[], changes: readonly LayoutChange[]): AppSection[] {
  const addedConcepts = new Set(changes.flatMap((change) => (change.kind === "concept-added" ? [change.conceptId] : [])));
  const addedBlocks = new Set(changes.flatMap((change) => (change.kind === "block-added" ? [change.blockId] : [])));
  const keyed = new Map(changes.flatMap((change) => (change.kind === "concept-keyed" ? [[change.conceptId, change.calculationKey] as const] : [])));
  const sectionIds = new Set(changes.map((change) => change.sectionId));
  const unkey = (concept: Concept): Concept => {
    if (!keyed.has(concept.id) || keyed.get(concept.id) !== concept.calculationKey) return concept;
    const { calculationKey: _key, ...rest } = concept;
    return rest;
  };
  const previousTables = new Map(changes.flatMap((change) => (change.kind === "table-changed" ? [[`${change.blockId}|${change.tableId}`, change.previous] as const] : [])));
  const arranged = new Map(changes.flatMap((change) => (change.kind === "block-changed" ? [[change.blockId, change] as const] : [])));
  const untouch = (blockId: string) => (table: TableContent) => previousTables.get(`${blockId}|${table.id}`) ?? table;
  const reverted = sections.map((section) => (!sectionIds.has(section.id) ? section : {
    ...section,
    blocks: section.blocks
      .filter((block) => !addedBlocks.has(block.id))
      .map((block) => (arranged.has(block.id) ? unarranged(block, arranged.get(block.id)!) : block))
      .map((block) => ({
        ...block,
        concepts: block.concepts.filter((concept) => !addedConcepts.has(concept.id)).map(unkey),
        ...(previousTables.size ? {
          tables: block.tables.map(untouch(block.id)),
          apartados: block.apartados.map((apartado) => ({ ...apartado, tables: apartado.tables.map(untouch(block.id)) })),
        } : {}),
      })),
  }));
  return withLayoutVersion(reverted, LAYOUT_VERSION);
}

/** What changed, in a sentence per step, for the notice and the report (labels of the format only, never captured data). */
export function describeLayoutChanges(changes: readonly LayoutChange[]): string[] {
  const steps = [...new Set(changes.map((change) => change.step))];
  return steps.map((id) => LAYOUT_STEPS.find((step) => step.id === id)?.description ?? id);
}
