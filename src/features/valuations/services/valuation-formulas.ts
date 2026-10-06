/**
 * The formulas of a whole valuation: cells that read other tables and
 * concepts, and concepts computed from other concepts and cells.
 *
 * `applyValuationFormulas` computes all of them in dependency order and
 * writes the results where the document reads them: the value of each
 * computed concept, and `formulaResults` on each table. The editor applies it
 * to every change of the document, and the dictamen when it loads, so the
 * preview, the printed dictamen and the PDF show what the editor shows.
 *
 * Pure TypeScript — no React, no side effects.
 */
import type { Apartado, AppSection, Block, Concept, ConceptValueFormat, TableContent } from "../model";
import {
  convertUnitValue,
  isNumericConcept,
  resolveConceptValueFormat,
  resolveEffectiveSourceUnit,
} from "./concept-value-format";
import { roundDecimal } from "../calculation/free-formula";
import { canonicalTable } from "./formula-references";
import type { FormulaResult, TableFormula, TableV2 } from "./table";
import {
  FORMULA_RESULT_MAX_DECIMALS,
  evaluateFormulaWorld,
  formatFormulaNumber,
  formulaErrorLabel,
  readSourceNumber,
  referenceKey,
  type FormulaConceptSource,
  type SourceValue,
} from "./table-formula-engine";

/** Concept types whose value is a text or a number, and so can be computed or read by a formula. */
export function conceptTakesFormula(concept: Pick<Concept, "type">) {
  return concept.type === undefined || concept.type === "text" || concept.type === "number" || concept.type === "currency" || concept.type === "measurement";
}

const hasFormula = (concept: Concept): concept is Concept & { formula: TableFormula } =>
  Boolean(concept.formula?.expression) && conceptTakesFormula(concept);

/** Units a number is converted between when the concept shows a unit other than the one it was captured in. */
function displayedIn(value: number, from: ConceptValueFormat, to: ConceptValueFormat) {
  return from === to ? value : convertUnitValue(value, from, to) ?? value;
}

/**
 * The number a concept contributes to a formula: the one it shows. "169.78 m²"
 * is 169.78, "$ 9,000.00" is 9000, and a concept shown as a percentage is its
 * fraction (5 % is 0.05).
 */
export function conceptSourceValue(concept: Concept, value = concept.value): SourceValue {
  if (!conceptTakesFormula(concept)) return value.trim() ? { kind: "text" } : { kind: "blank" };
  const read = readSourceNumber(value);
  if (read.kind !== "number" || !isNumericConcept(concept)) return read;
  const format = resolveConceptValueFormat(concept);
  const shown = displayedIn(read.value, resolveEffectiveSourceUnit(concept), format);
  return {
    kind: "number",
    value: format === "percent" && !value.includes("%") ? shown / 100 : shown,
    money: read.money || format === "mxn",
  };
}

function plainNumber(value: number, decimals: number) {
  const fixed = roundDecimal(value, decimals).toFixed(decimals);
  const trimmed = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return trimmed === "-0" ? "0" : trimmed;
}

/**
 * The value a computed concept stores for a result, so that the concept's
 * format prints it: the bare number for a concept with a unit (two decimals
 * for money), and the number as read for a concept without one. An error is
 * stored as the spreadsheet mark it shows (#REF!, #DIV/0!…).
 */
export function conceptFormulaValue(concept: Concept, result: FormulaResult): string {
  if (!result.ok) return formulaErrorLabel(result.error);
  if (!isNumericConcept(concept)) return formatFormulaNumber(result.value, undefined, result.money === true);
  const format = resolveConceptValueFormat(concept);
  if (format === "mxn") return roundDecimal(result.value, 2).toFixed(2);
  const shown = format === "percent" ? result.value * 100 : result.value;
  return plainNumber(displayedIn(shown, format, resolveEffectiveSourceUnit(concept)), FORMULA_RESULT_MAX_DECIMALS);
}

/* ================================================================== */
/*  WHOLE-VALUATION EVALUATION                                         */
/* ================================================================== */

type Content = Pick<Block | Apartado, "concepts" | "tables">;

function eachContent(sections: AppSection[], visit: (content: Content) => void) {
  for (const section of sections) {
    for (const block of section.blocks) {
      visit(block);
      for (const apartado of block.apartados) visit(apartado);
    }
  }
}

const formulaTables = new WeakMap<TableV2, boolean>();

function tableHasFormulas(table: TableV2) {
  let has = formulaTables.get(table);
  if (has === undefined) {
    has = table.rows.some((row) => Object.values(row.cells).some((cell) => cell?.kind === "formula"));
    formulaTables.set(table, has);
  }
  return has;
}

function sameResult(left: FormulaResult | undefined, right: FormulaResult) {
  if (!left || left.ok !== right.ok) return false;
  if (left.ok && right.ok) return Object.is(left.value, right.value) && Boolean(left.money) === Boolean(right.money);
  return !left.ok && !right.ok && left.error === right.error;
}

function sameResults(current: Record<string, FormulaResult> | undefined, next: Map<string, FormulaResult>) {
  if (!current || Object.keys(current).length !== next.size) return false;
  for (const [key, result] of next) {
    if (!sameResult(current[key], result)) return false;
  }
  return true;
}

/** Concepts that share a value are one value: the key of the group a concept belongs to. */
const valueGroupKey = (concept: Concept) => (concept.valueKey ? `value:${concept.valueKey}` : `id:${referenceKey(concept.id)}`);

/**
 * The sections with every formula computed.
 *
 * Returns the same objects for whatever did not change, and the same array
 * when nothing did, so it can run on every edit. Applying it twice changes
 * nothing.
 */
export function applyValuationFormulas(sections: AppSection[]): AppSection[] {
  const tables = new Map<string, TableV2>();
  const groups = new Map<string, Concept[]>();
  let anyFormula = false;
  let anyResults = false;

  eachContent(sections, (content) => {
    for (const concept of content.concepts) {
      const key = valueGroupKey(concept);
      const group = groups.get(key);
      if (group) group.push(concept);
      else groups.set(key, [concept]);
      if (hasFormula(concept)) anyFormula = true;
    }
    for (const table of content.tables) {
      const canonical = canonicalTable(table);
      if (!tables.has(canonical.id)) tables.set(canonical.id, canonical);
      if (tableHasFormulas(canonical)) anyFormula = true;
      if (canonical.formulaResults) anyResults = true;
    }
  });
  if (!anyFormula && !anyResults) return sections;

  // Concepts that share a value share its formula; without one they read the value of the first of them.
  const concepts = new Map<string, FormulaConceptSource>();
  const formulaKeyOf = new Map<Concept, string>();
  for (const [key, group] of groups) {
    const owner = group.find(hasFormula);
    for (const concept of group) {
      const id = referenceKey(concept.id);
      if (concepts.has(id)) continue;
      if (owner) {
        concepts.set(id, { kind: "formula", key, formula: owner.formula });
        formulaKeyOf.set(concept, key);
      } else {
        concepts.set(id, { kind: "value", value: conceptSourceValue(concept, group[0].value) });
      }
    }
  }

  const results = evaluateFormulaWorld({ tables, concepts });

  const computedConcept = (concept: Concept): Concept => {
    const key = formulaKeyOf.get(concept);
    const result = key === undefined ? undefined : results.concepts.get(key);
    if (!result) return concept;
    const value = conceptFormulaValue(concept, result);
    return value === concept.value ? concept : { ...concept, value };
  };
  const computedTable = (table: TableContent): TableContent => {
    const canonical = canonicalTable(table);
    const next = tables.get(canonical.id) === canonical ? results.cells.get(canonical.id) : undefined;
    if (!next?.size) {
      if (!canonical.formulaResults) return table;
      const { formulaResults: _stale, ...rest } = canonical;
      return rest as unknown as TableContent;
    }
    if (sameResults(canonical.formulaResults, next)) return table;
    return { ...canonical, formulaResults: Object.fromEntries(next) } as unknown as TableContent;
  };
  const mapped = <T,>(items: T[], map: (item: T) => T): T[] => {
    let changed = false;
    const next = items.map((item) => {
      const result = map(item);
      if (result !== item) changed = true;
      return result;
    });
    return changed ? next : items;
  };
  const computedContent = <T extends Content>(content: T): T => {
    const nextConcepts = mapped(content.concepts, computedConcept);
    const nextTables = mapped(content.tables, computedTable);
    return nextConcepts === content.concepts && nextTables === content.tables ? content : { ...content, concepts: nextConcepts, tables: nextTables };
  };

  return mapped(sections, (section) => {
    const blocks = mapped(section.blocks, (block) => {
      const withContent = computedContent(block);
      const apartados = mapped(block.apartados, computedContent);
      return apartados === block.apartados ? withContent : { ...withContent, apartados };
    });
    return blocks === section.blocks ? section : { ...section, blocks };
  });
}
