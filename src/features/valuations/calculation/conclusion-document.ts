/**
 * The concluded value in the dictamen: the conclusion section's values and the
 * carátula's value and amount in words. Fills the template concepts by label
 * and leaves the appraiser's own text (observations, declarations) alone.
 */
import type { ConclusionResult } from "../engine/conclusion";
import type { AppSection, Block, Concept } from "../model";
import type { ConclusionCalculationDto } from "./conclusion-types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NOT_APPLICABLE = "NO APLICA";

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();

/** Label → value of the conclusion section concepts. */
export function conclusionValues(calculation: ConclusionCalculationDto, result: ConclusionResult): Record<string, string> {
  const approach = (value: number | null | undefined) => (value === null || value === undefined ? NOT_APPLICABLE : money.format(value));
  return {
    "valor por enfoque de costos": approach(result.summary.costos ?? calculation.values.costos),
    "valor por enfoque de mercado": approach(result.summary.mercado ?? calculation.values.mercado),
    "valor por enfoque de ingresos": approach(result.summary.ingresos ?? calculation.values.ingresos),
    "valor concluido": money.format(result.value),
    "valor concluido con letra": result.valueInWords,
  };
}

/** Label → value of the carátula conclusion concepts. */
export function caratulaConclusionValues(result: ConclusionResult): Record<string, string> {
  return {
    "valor comercial del bien": money.format(result.value),
    "cifra en letras": result.valueInWords,
  };
}

function fillConcepts(concepts: Concept[], values: Record<string, string>) {
  let changed = false;
  const next = concepts.map((concept) => {
    const value = values[normalize(concept.label)];
    if (value === undefined || concept.value === value) return concept;
    changed = true;
    return { ...concept, value };
  });
  return changed ? next : concepts;
}

/** Sets the values of the concepts whose labels match, in every block and apartado of the section. */
export function withConceptValues(section: AppSection, values: Record<string, string>): AppSection {
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
