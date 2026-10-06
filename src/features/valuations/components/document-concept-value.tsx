import type { Concept } from "@/features/valuations/model";
import {
  formatConceptValueForDocument,
  getConceptUrlHref,
} from "@/features/valuations/services/concept-value-format";

/**
 * A concept's value as printed. Its unit, currency, date or phone format
 * belongs to the value, so every section prints it, whatever its layout.
 */
export function DocumentConceptValue({
  concept,
  fallback = "",
}: {
  concept: Concept;
  fallback?: string;
}) {
  const value = formatConceptValueForDocument(concept);
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
