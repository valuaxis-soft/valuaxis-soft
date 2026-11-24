/**
 * The concluded value in the dictamen: the conclusion section's values and the
 * carátula's value and amount in words. Fills the template concepts by their
 * key (`calculationKey`; the template label for those saved before it) and
 * leaves the appraiser's own text (observations, declarations) alone.
 *
 * Each of those concepts is linked to the calculation until the appraiser
 * writes its value by hand or unlinks it ("Desvincular"): from then on the
 * calculation leaves it as he wrote it (`calculationUnlinked`) until he links
 * it again (auditoría, nov 2026: a "Valor concluido" written by hand came back
 * as the calculation's on every sync).
 */
import type { ConclusionResult } from "../engine/conclusion";
import { roundIfSet } from "../engine/rounding";
import type { AppSection, Block, Concept, ConceptValueFormat } from "../model";
import { appraisedGoodWording } from "../services/appraised-good-wording";
import type { ValuationSignature } from "../services/valuation-signatures";
import { conclusionEngineConfig, summaryRowValues, type ConclusionCalculationDto } from "./conclusion-types";
import { MACHINERY_PROPERTY_TYPE } from "./machinery-types";

const NOT_APPLICABLE = "NO APLICA";

/**
 * What the calculation writes in each concept, by a key the concept keeps in
 * its configuration (`calculationKey`), so the appraiser may rename "Valor
 * concluido" (V7.3-28: «el nombre que ellos decidan») and it still receives the
 * value. Concepts saved before the key existed are recognized once by their
 * template label and take the key (`conceptCalculationKey`).
 */
export const CONCLUSION_KEYS = {
  costos: "conclusion:approach:costos",
  mercado: "conclusion:approach:mercado",
  ingresos: "conclusion:approach:ingresos",
  value: "conclusion:value",
  words: "conclusion:words",
  /** Who signs, from the carátula's signatures (V7.1-24). */
  signerName: "conclusion:signer-name",
  signerCedula: "conclusion:signer-cedula",
  caratulaValue: "caratula:value",
  caratulaWords: "caratula:words",
} as const;
type ConclusionKey = (typeof CONCLUSION_KEYS)[keyof typeof CONCLUSION_KEYS];

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

/** The template labels of the concepts saved before they carried their key. */
const LEGACY_LABEL_KEYS = new Map<string, ConclusionKey>([
  ["valor por enfoque de costos", CONCLUSION_KEYS.costos],
  ["valor por enfoque de mercado", CONCLUSION_KEYS.mercado],
  ["valor por enfoque de ingresos", CONCLUSION_KEYS.ingresos],
  ...CONCLUDED_VALUE_LABELS.map((label): [string, ConclusionKey] => [normalize(label), CONCLUSION_KEYS.value]),
  ["valor concluido con letra", CONCLUSION_KEYS.words],
  ["valuador", CONCLUSION_KEYS.signerName],
  ["cedula profesional", CONCLUSION_KEYS.signerCedula],
  ["valor comercial del bien", CONCLUSION_KEYS.caratulaValue],
  ["cifra en letras", CONCLUSION_KEYS.caratulaWords],
]);

const SECTION_KEYS: Record<string, ReadonlySet<string>> = {
  CONCLUSIONES: new Set<string>([
    CONCLUSION_KEYS.costos, CONCLUSION_KEYS.mercado, CONCLUSION_KEYS.ingresos, CONCLUSION_KEYS.value, CONCLUSION_KEYS.words,
    CONCLUSION_KEYS.signerName, CONCLUSION_KEYS.signerCedula,
  ]),
  CARATULA: new Set<string>([CONCLUSION_KEYS.caratulaValue, CONCLUSION_KEYS.caratulaWords]),
};

/** The id of the concept that prints a row of the resumen de valores, by its place. */
const SUMMARY_CONCEPT_PREFIX = "conclusion-resumen-";
const summaryConceptId = (index: number) => `${SUMMARY_CONCEPT_PREFIX}${index + 1}`;

/** What the calculation writes in the concept: its key, or the one its template label had. */
export function conceptCalculationKey(concept: Pick<Concept, "label" | "calculationKey">): string | undefined {
  return concept.calculationKey ?? LEGACY_LABEL_KEYS.get(normalize(concept.label));
}

const APPROACH_KEYS = new Set<string>([CONCLUSION_KEYS.costos, CONCLUSION_KEYS.mercado, CONCLUSION_KEYS.ingresos]);

/** A row of the resumen de valores: one of the three approaches, or a row the appraiser chose. */
export function isSummaryConcept(concept: Pick<Concept, "id" | "label" | "calculationKey">) {
  return concept.id.startsWith(SUMMARY_CONCEPT_PREFIX) || APPROACH_KEYS.has(conceptCalculationKey(concept) ?? "");
}
const isConcludedConcept = (concept: Pick<Concept, "label" | "calculationKey">) => conceptCalculationKey(concept) === CONCLUSION_KEYS.value;

/** Whether the conclusion writes this concept of the section (by canonical key), linked or not. */
export function isConclusionCalculatedConcept(sectionKey: string, concept: Pick<Concept, "id" | "label" | "calculationKey">): boolean {
  if (sectionKey === "CONCLUSIONES" && concept.id.startsWith(SUMMARY_CONCEPT_PREFIX)) return true;
  return SECTION_KEYS[sectionKey]?.has(conceptCalculationKey(concept) ?? "") ?? false;
}

/**
 * A change the appraiser makes to a concept: writing by hand the value of one
 * the calculation fills unlinks it, so the next sync leaves what he wrote.
 * Renaming it keeps it linked: the key goes with the new name.
 */
export function withManualConclusionEdit(sectionKey: string, concept: Concept, patch: Partial<Concept>): Partial<Concept> {
  if (!isConclusionCalculatedConcept(sectionKey, concept)) return patch;
  const key = conceptCalculationKey(concept);
  const renamed = patch.label !== undefined && patch.label !== concept.label;
  const keyed = renamed && key && !concept.calculationKey && !concept.id.startsWith(SUMMARY_CONCEPT_PREFIX) ? { ...patch, calculationKey: key } : patch;
  if (keyed.value === undefined || keyed.value === concept.value) return keyed;
  if (concept.calculationUnlinked || "calculationUnlinked" in keyed) return keyed;
  return { ...keyed, calculationUnlinked: true };
}

/**
 * Key → value of the conclusion section concepts (the rows of the resumen go
 * by their id). Every value of the resumen prints with the rounding of the
 * conclusion, the rows the appraiser chose too (FAL-03, FAL-45: they printed
 * $3,148,754.45 under «A decenas de miles»).
 */
export function conclusionValues(calculation: ConclusionCalculationDto, result: ConclusionResult): Record<string, ConclusionConceptValue> {
  const approach = (value: number | null | undefined) => (value === null || value === undefined ? NOT_APPLICABLE : amount(value, "mxn"));
  const config = conclusionEngineConfig(calculation).rounding;
  const rounding = config.conclusion;
  // One figure per value (FAL-14): a row of the cost or market approach lists it as its approach printed it, like the approach concepts.
  const rowRounding = (source: string) => (config.summaryRoundsApproaches === false && (source === "costos" || source.startsWith("mercado")) ? null : rounding);
  const rows = summaryRowValues(calculation);
  return {
    ...(rows.length
      ? Object.fromEntries(rows.map((row, index) => [summaryConceptId(index), approach(row.value === null ? null : roundIfSet(row.value, rowRounding(row.source)))]))
      : {
          [CONCLUSION_KEYS.costos]: approach(result.summary.costos ?? calculation.values.costos),
          [CONCLUSION_KEYS.mercado]: approach(result.summary.mercado ?? calculation.values.mercado),
          [CONCLUSION_KEYS.ingresos]: approach(result.summary.ingresos ?? calculation.values.ingresos),
        }),
    // The concluded amount prints with the legal tender mark: "$2,200,000.00 M.N." (2 Nov 2026).
    [CONCLUSION_KEYS.value]: amount(result.value, "mxn-mn"),
    [CONCLUSION_KEYS.words]: result.valueInWords,
  };
}

/**
 * Who signs the conclusion: the carátula's signatures (V7.1-24: «y las
 * firmas»), linked as the values are. Several signers read one after another.
 */
export function signatureConceptValues(signatures: ReadonlyArray<Pick<ValuationSignature, "name" | "cedula">>): Record<string, ConclusionConceptValue> {
  const join = (values: string[]) => values.map((value) => value.trim()).filter(Boolean).join(", ");
  return {
    [CONCLUSION_KEYS.signerName]: join(signatures.map((signature) => signature.name)),
    [CONCLUSION_KEYS.signerCedula]: join(signatures.map((signature) => signature.cedula)),
  };
}

/**
 * The concepts of the resumen de valores in the block of the concluded value:
 * the rows the appraiser chose, under the names he wrote, in place of the
 * three approaches. Without rows the block keeps its approach concepts. With
 * one row and "the concluded value takes its name" (V7.3-28), the concluded
 * value prints under that row's name.
 */
export function withSummaryRowConcepts(section: AppSection, calculation: Pick<ConclusionCalculationDto, "summaryRows" | "available" | "concludedNameFromRow">): AppSection {
  const rows = summaryRowValues(calculation);
  if (!rows.length) return withApproachConcepts(section);
  const concludedName = rows.length === 1 && calculation.concludedNameFromRow ? rows[0].label : null;
  let changed = false;
  const blocks = section.blocks.map((block): Block => {
    const concluded = block.concepts.findIndex(isConcludedConcept);
    if (concluded === -1) return block;
    const current = block.concepts.filter(isSummaryConcept);
    const next = rows.map((row, index): Concept => {
      const existing = current[index];
      if (existing?.id !== summaryConceptId(index)) return { id: summaryConceptId(index), label: row.label, value: "", enabled: true };
      return existing.label === row.label ? existing : { ...existing, label: row.label };
    });
    const same = current.length === next.length && current.every((concept, index) => concept === next[index]);
    const renamed = concludedName !== null && block.concepts[concluded].label !== concludedName;
    if (same && !renamed) return block;
    changed = true;
    const kept = (same ? block.concepts : block.concepts.filter((concept) => !isSummaryConcept(concept)))
      .map((concept) => (renamed && isConcludedConcept(concept) ? { ...concept, label: concludedName, calculationKey: CONCLUSION_KEYS.value } : concept));
    if (same) return { ...block, concepts: kept };
    const at = kept.findIndex(isConcludedConcept);
    return { ...block, concepts: [...kept.slice(0, at), ...next, ...kept.slice(at)] };
  });
  return changed ? { ...section, blocks } : section;
}

/** The three approaches as the template lists them, for a block that lost them to the rows of the resumen. */
const APPROACH_CONCEPTS: ReadonlyArray<{ key: ConclusionKey; label: string }> = [
  { key: CONCLUSION_KEYS.costos, label: "Valor por enfoque de costos" },
  { key: CONCLUSION_KEYS.mercado, label: "Valor por enfoque de mercado" },
  { key: CONCLUSION_KEYS.ingresos, label: "Valor por enfoque de ingresos" },
];

/**
 * Without rows in the resumen, the block of the concluded value lists the
 * three approaches as always: the rows the appraiser removed go, and the
 * approaches they had replaced come back before the concluded value (FAL-03:
 * removing the last row left the block without them). An approach the block
 * still has stays as it is, under the name he gave it.
 */
function withApproachConcepts(section: AppSection): AppSection {
  let changed = false;
  const blocks = section.blocks.map((block): Block => {
    if (!block.concepts.some(isConcludedConcept) || !block.concepts.some((concept) => concept.id.startsWith(SUMMARY_CONCEPT_PREFIX))) return block;
    changed = true;
    const kept = block.concepts.filter((concept) => !concept.id.startsWith(SUMMARY_CONCEPT_PREFIX));
    const present = new Set(kept.map((concept) => conceptCalculationKey(concept)));
    const restored = APPROACH_CONCEPTS.filter((approach) => !present.has(approach.key)).map((approach): Concept => ({
      id: `${block.id}-${approach.key.replace(/[^a-z]+/g, "-")}`,
      label: approach.label,
      value: "",
      enabled: true,
      calculationKey: approach.key,
    }));
    const at = kept.findIndex(isConcludedConcept);
    return { ...block, concepts: [...kept.slice(0, at), ...restored, ...kept.slice(at)] };
  });
  return changed ? { ...section, blocks } : section;
}

/** Key → value of the carátula conclusion concepts. */
export function caratulaConclusionValues(result: ConclusionResult): Record<string, ConclusionConceptValue> {
  return {
    [CONCLUSION_KEYS.caratulaValue]: amount(result.value, "mxn-mn"),
    [CONCLUSION_KEYS.caratulaWords]: result.valueInWords,
  };
}

/** The number as the concept stores it: two decimals, no separators ("2200000.00"). */
const storedAmount = (value: number) => value.toFixed(2);

function fillConcept(concept: Concept, value: ConclusionConceptValue): Concept {
  // Written by hand or unlinked: the appraiser's value stays until he links it again.
  if (concept.calculationUnlinked) return concept;
  if (typeof value === "string") return concept.value === value ? concept : { ...concept, value };
  const stored = storedAmount(value.amount);
  const type = concept.type === "currency" || concept.type === "number" ? concept.type : "currency";
  const valueFormat = concept.valueFormat ?? value.valueFormat;
  if (concept.value === stored && concept.type === type && concept.valueFormat === valueFormat) return concept;
  return { ...concept, value: stored, type, valueFormat };
}

/** The concept with its key written: saved before the key existed, it is recognized by its label once. */
function withKey(concept: Concept, key: string | undefined): Concept {
  return key && !concept.id.startsWith(SUMMARY_CONCEPT_PREFIX) && concept.calculationKey !== key ? { ...concept, calculationKey: key } : concept;
}

function fillConcepts(concepts: Concept[], values: Record<string, ConclusionConceptValue>) {
  let changed = false;
  const next = concepts.map((concept) => {
    // The rows of the resumen de valores go by their id, the rest by their key: their labels are the appraiser's.
    const key = conceptCalculationKey(concept);
    const value = values[concept.id] ?? (key === undefined ? undefined : values[key]);
    if (value === undefined) return concept;
    const filled = fillConcept(withKey(concept, key), value);
    if (filled !== concept) changed = true;
    return filled;
  });
  return changed ? next : concepts;
}

/** Sets the values of the concepts whose keys match, in every block and apartado of the section. */
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

/** The block of the concluded value: the one holding the concept the concluded value is written in. */
export function isConcludedValueBlock(block: Pick<Block, "concepts">) {
  return block.concepts.some(isConcludedConcept);
}

/** "Gráfica de los valores" chosen in the panel (V7.1-26): the block of the concluded value prints it. */
export function withValueChart(section: AppSection, on: boolean): AppSection {
  let changed = false;
  const blocks = section.blocks.map((block): Block => {
    if (!isConcludedValueBlock(block) || Boolean(block.valueChart) === on) return block;
    changed = true;
    if (on) return { ...block, valueChart: true };
    const { valueChart: _chart, ...rest } = block;
    return rest;
  });
  return changed ? { ...section, blocks } : section;
}
