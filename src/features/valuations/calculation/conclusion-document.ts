/**
 * The concluded value in the dictamen: the conclusion section's values and the
 * carátula's value and amount in words. Fills the template concepts by label
 * and leaves the appraiser's own text (observations, declarations) alone.
 */
import type { ConclusionResult } from "../engine/conclusion";
import type { AppSection, Block, Concept, ConceptValueFormat } from "../model";
import { appraisedGoodWording } from "../services/appraised-good-wording";
import { summaryRowValues, type ConclusionCalculationDto } from "./conclusion-types";
import { MACHINERY_PROPERTY_TYPE } from "./machinery-types";

const NOT_APPLICABLE = "NO APLICA";

/**
 * What the calculation writes in a concept: a text as it is, or a number with
 * the format it prints with ("$2,200,000.00 M.N."). The number is stored as
 * such, so "Formato del valor" of the concept can change how it prints; the
 * format is set only when the concept has none yet, so the appraiser's choice
 * stays.
 */
export type ConclusionConceptValue = string | { amount: number; valueFormat: ConceptValueFormat };

const amount = (value: number, valueFormat: ConceptValueFormat): ConclusionConceptValue => ({ amount: value, valueFormat });

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();

const CONCLUDED_VALUE_LABELS = [null, MACHINERY_PROPERTY_TYPE].map((kind) => appraisedGoodWording(kind).concludedValueLabel);

/** The id of the concept that prints a row of the resumen de valores, by its place. */
const SUMMARY_CONCEPT_PREFIX = "conclusion-resumen-";
const summaryConceptId = (index: number) => `${SUMMARY_CONCEPT_PREFIX}${index + 1}`;
const APPROACH_LABELS_IN_DOCUMENT = ["valor por enfoque de costos", "valor por enfoque de mercado", "valor por enfoque de ingresos"];
const isApproachConcept = (concept: Concept) => APPROACH_LABELS_IN_DOCUMENT.includes(normalize(concept.label)) || concept.id.startsWith(SUMMARY_CONCEPT_PREFIX);

/** Label → value of the conclusion section concepts. */
export function conclusionValues(calculation: ConclusionCalculationDto, result: ConclusionResult): Record<string, ConclusionConceptValue> {
  const approach = (value: number | null | undefined) => (value === null || value === undefined ? NOT_APPLICABLE : amount(value, "mxn"));
  // The concluded amount prints with the legal tender mark: "$2,200,000.00 M.N." (2 Nov 2026).
  const concluded = amount(result.value, "mxn-mn");
  const rows = summaryRowValues(calculation);
  return {
    ...(rows.length
      ? Object.fromEntries(rows.map((row, index) => [summaryConceptId(index), approach(row.value)]))
      : {
          "valor por enfoque de costos": approach(result.summary.costos ?? calculation.values.costos),
          "valor por enfoque de mercado": approach(result.summary.mercado ?? calculation.values.mercado),
          "valor por enfoque de ingresos": approach(result.summary.ingresos ?? calculation.values.ingresos),
        }),
    // The concluded value under either name: the real estate books' and the machinery one's.
    ...Object.fromEntries(CONCLUDED_VALUE_LABELS.map((label) => [normalize(label), concluded])),
    "valor concluido con letra": result.valueInWords,
  };
}

/**
 * The concepts of the resumen de valores in the block of the concluded value:
 * the rows the appraiser chose, under the names he wrote, in place of the
 * three approaches. Without rows the block keeps its approach concepts.
 */
export function withSummaryRowConcepts(section: AppSection, calculation: Pick<ConclusionCalculationDto, "summaryRows" | "available">): AppSection {
  const rows = summaryRowValues(calculation);
  if (!rows.length) return section;
  let changed = false;
  const blocks = section.blocks.map((block): Block => {
    const concluded = block.concepts.findIndex((concept) => CONCLUDED_VALUE_LABELS.some((label) => normalize(label) === normalize(concept.label)));
    if (concluded === -1) return block;
    const current = block.concepts.filter(isApproachConcept);
    const next = rows.map((row, index): Concept => {
      const existing = current[index];
      const concept: Concept = existing?.id === summaryConceptId(index)
        ? { ...existing, label: row.label }
        : { id: summaryConceptId(index), label: row.label, value: "", enabled: true };
      return concept;
    });
    const same = current.length === next.length && current.every((concept, index) => concept === next[index]);
    if (same) return block;
    changed = true;
    const kept = block.concepts.filter((concept) => !isApproachConcept(concept));
    const at = kept.findIndex((concept) => CONCLUDED_VALUE_LABELS.some((label) => normalize(label) === normalize(concept.label)));
    return { ...block, concepts: [...kept.slice(0, at), ...next, ...kept.slice(at)] };
  });
  return changed ? { ...section, blocks } : section;
}

/** Label → value of the carátula conclusion concepts. */
export function caratulaConclusionValues(result: ConclusionResult): Record<string, ConclusionConceptValue> {
  return {
    "valor comercial del bien": amount(result.value, "mxn-mn"),
    "cifra en letras": result.valueInWords,
  };
}

/** The number as the concept stores it: two decimals, no separators ("2200000.00"). */
const storedAmount = (value: number) => value.toFixed(2);

function fillConcept(concept: Concept, value: ConclusionConceptValue): Concept {
  if (typeof value === "string") return concept.value === value ? concept : { ...concept, value };
  const stored = storedAmount(value.amount);
  const type = concept.type === "currency" || concept.type === "number" ? concept.type : "currency";
  const valueFormat = concept.valueFormat ?? value.valueFormat;
  if (concept.value === stored && concept.type === type && concept.valueFormat === valueFormat) return concept;
  return { ...concept, value: stored, type, valueFormat };
}

function fillConcepts(concepts: Concept[], values: Record<string, ConclusionConceptValue>) {
  let changed = false;
  const next = concepts.map((concept) => {
    const value = values[normalize(concept.label)];
    if (value === undefined) return concept;
    const filled = fillConcept(concept, value);
    if (filled !== concept) changed = true;
    return filled;
  });
  return changed ? next : concepts;
}

/** Sets the values of the concepts whose labels match, in every block and apartado of the section. */
export function withConceptValues(section: AppSection, values: Record<string, ConclusionConceptValue>): AppSection {
  let changed = false;
  const blocks = section.blocks.map((block): Block => {
    const concepts = fillConcepts(block.concepts, values);
    const apartados = block.apartados.map((apartado) => {
      const apartadoConcepts = fillConcepts(apartado.concepts, values);
      return apartadoConcepts === apartado.concepts ? apartado : { ...apartado, concepts: apartadoConcepts };
    });
    if (concepts === block.concepts && apartados.every((apartado, index) => apartado === block.apartados[index])) return block;
    changed = true;
    return { ...block, concepts, apartados };
  });
  return changed ? { ...section, blocks } : section;
}
