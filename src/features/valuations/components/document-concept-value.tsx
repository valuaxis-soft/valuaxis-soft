import type { ReactNode } from "react";

import type { Concept } from "@/features/valuations/model";
import {
  formatConceptValueForDocument,
  getConceptUrlHref,
} from "@/features/valuations/services/concept-value-format";
import { hasTextMarks, parseTextMarks } from "@/features/valuations/services/text-marks";
import { useNumberPresentation } from "./number-presentation-context";

/** The runs of a marked value, each in its own span with its marks nested bold > italic > underline. */
export function markedRuns(value: string): ReactNode {
  return parseTextMarks(value).map((segment, index) => {
    let node: ReactNode = segment.text;
    if (segment.underline) node = <u>{node}</u>;
    if (segment.italic) node = <em>{node}</em>;
    if (segment.bold) node = <strong>{node}</strong>;
    return <span key={index}>{node}</span>;
  });
}

/**
 * A concept's value as printed. Its unit, currency, date or phone format
 * belongs to the value, so every section prints it, whatever its layout.
 * Bold, italic and underline marks render; a value without them prints as
 * one text node, as before.
 */
export function DocumentConceptValue({
  concept,
  fallback = "",
}: {
  concept: Concept;
  fallback?: string;
}) {
  const value = formatConceptValueForDocument(concept, useNumberPresentation());
  const href = getConceptUrlHref(concept);

  if (href && value) {
    return (
      <a className="text-blue-700 underline underline-offset-2" href={href} target="_blank" rel="noopener noreferrer">
        {value}
      </a>
    );
  }

  if (value && hasTextMarks(value)) return markedRuns(value);
  return value || fallback;
}
