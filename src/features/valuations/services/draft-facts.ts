import { DRAFT_FACT_LABEL_MAX, DRAFT_FACT_VALUE_MAX, DRAFT_MAX_FACTS, type DraftFact } from "@/features/ai/draft-writing";
import { resolveEffectiveConcept } from "../concept-links";
import type { Concept } from "../model";
import { normalizeConceptTitle } from "./concept-title";
import { formatConceptValueForDocument } from "./concept-value-format";

/**
 * The data a draft for `target` may be written from: the other concepts of
 * its own container that have something captured, as the document prints
 * them. Nothing from other parts of the valuation, and never the field itself.
 */
export function draftFactsFor(target: Pick<Concept, "id">, container: Concept[], allConcepts: Concept[]): DraftFact[] {
  return container
    .filter((concept) => concept.id !== target.id && concept.enabled !== false)
    .map((concept) => resolveEffectiveConcept(concept, allConcepts))
    .map((concept) => ({ label: normalizeConceptTitle(concept.label).trim(), value: formatConceptValueForDocument(concept).trim() }))
    .filter((fact) => fact.label && fact.value && fact.label.length <= DRAFT_FACT_LABEL_MAX && fact.value.length <= DRAFT_FACT_VALUE_MAX)
    .slice(0, DRAFT_MAX_FACTS);
}
