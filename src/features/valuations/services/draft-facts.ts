import {
  DRAFT_FACT_LABEL_MAX,
  DRAFT_FACT_VALUE_MAX,
  DRAFT_MAX_FACTS,
  DRAFT_MAX_TABLES,
  DRAFT_TABLE_CELL_MAX,
  DRAFT_TABLE_MAX_CELLS,
  tableCells,
  usableTables,
  type DraftFact,
  type DraftTable,
} from "@/features/ai/draft-writing";
import { resolveEffectiveConcept } from "../concept-links";
import type { AppSection, Concept, TableContent } from "../model";
import { getCanonicalSectionKey } from "../sections/section-registry";
import { normalizeConceptTitle } from "./concept-title";
import { formatConceptValueForDocument } from "./concept-value-format";
import { ensureTableV2, getDisplayColumns } from "./table";
import { evaluateTableFormulas, getCellDisplayValue } from "./table-formula-engine";

/** The concepts with something captured, as the document prints them, within the limits of a request. */
function factsOf(concepts: Concept[], allConcepts: Concept[], labelOf: (label: string) => string = (label) => label): DraftFact[] {
  return concepts
    .filter((concept) => concept.enabled !== false)
    .map((concept) => resolveEffectiveConcept(concept, allConcepts))
    .map((concept) => ({ label: labelOf(normalizeConceptTitle(concept.label).trim()), value: formatConceptValueForDocument(concept).trim() }))
    .filter((fact) => fact.label && fact.value && fact.label.length <= DRAFT_FACT_LABEL_MAX && fact.value.length <= DRAFT_FACT_VALUE_MAX)
    .slice(0, DRAFT_MAX_FACTS);
}

/**
 * The data a draft for `target` may be written from: the other concepts of
 * its own container that have something captured, as the document prints
 * them. Nothing from other parts of the valuation, and never the field itself.
 */
export function draftFactsFor(target: Pick<Concept, "id">, container: Concept[], allConcepts: Concept[]): DraftFact[] {
  return factsOf(container.filter((concept) => concept.id !== target.id), allConcepts);
}

/**
 * The tables of the same container in compact form (title, column headers and
 * rows), with the values the document prints. Only whole tables travel: one
 * that does not fit in what is left of the limits, or has a cell too long, is
 * left out rather than cut.
 */
export function draftTablesFor(tables: TableContent[]): DraftTable[] {
  const printed = usableTables(tables.filter((table) => table.enabled !== false).map((table) => {
    const v2 = ensureTableV2(table);
    const columns = getDisplayColumns(v2);
    const results = evaluateTableFormulas(v2);
    return {
      title: v2.title,
      columns: columns.map((column) => column.name),
      rows: v2.rows.map((row) => columns.map((column) => getCellDisplayValue(v2, row.id, column.id, results))),
    };
  }));
  const sent: DraftTable[] = [];
  for (const table of printed) {
    const fits = table.title.length <= DRAFT_FACT_LABEL_MAX
      && [...table.columns, ...table.rows.flat()].every((cell) => cell.length <= DRAFT_TABLE_CELL_MAX)
      && tableCells([...sent, table]) <= DRAFT_TABLE_MAX_CELLS;
    if (fits && sent.length < DRAFT_MAX_TABLES) sent.push(table);
  }
  return sent;
}

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/**
 * The data for the carátula's «Supuestos y condiciones limitantes»: what the
 * appraiser captured in the apartados of the considerations section that
 * state assumptions and limiting conditions, and nothing else. Their concepts
 * are numbered («1», «2»…): the number is their place, not a datum.
 */
export function assumptionsDraftData(sections: AppSection[]): { facts: DraftFact[]; tables: DraftTable[] } {
  const containers = sections
    .filter((section) => section.enabled !== false && getCanonicalSectionKey(section.id) === "CONSIDERACIONES")
    .flatMap((section) => section.blocks.filter((block) => block.enabled !== false))
    .flatMap((block) => [block, ...block.apartados.filter((apartado) => apartado.enabled !== false)])
    .filter((container) => /SUPUESTOS|LIMITANTES/.test(plain(container.title)));
  const allConcepts = sections.flatMap((section) => section.blocks.flatMap((block) => [...block.concepts, ...block.apartados.flatMap((apartado) => apartado.concepts)]));
  return {
    facts: factsOf(containers.flatMap((container) => container.concepts), allConcepts, (label) => (/^\d+$/.test(label) ? "Comentario" : label)),
    tables: draftTablesFor(containers.flatMap((container) => container.tables)),
  };
}
