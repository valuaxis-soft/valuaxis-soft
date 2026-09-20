import type { Concept } from "@/features/valuations/model";
import {
  formatConceptValueForDocument,
  getConceptUrlHref,
} from "@/features/valuations/services/concept-value-format";

export function DocumentConceptValue({
  applyFormatting = true,
  concept,
  fallback = "",
}: {
  applyFormatting?: boolean;
  concept: Concept;
  fallback?: string;
}) {
  const value = applyFormatting ? formatConceptValueForDocument(concept) : concept.value.trim();
  const href = getConceptUrlHref(concept);

  if (href && value) {
    return (
      <a className="text-blue-700 underline underline-offset-2" href={href} target="_blank" rel="noopener noreferrer">
        {value}
      </a>
    );
  }

  return value || fallback;
}
