"use client";

import type { CSSProperties } from "react";

import type { Concept } from "@/features/valuations/model";
import { useDocumentTheme } from "@/features/valuations/components/document-theme";
import { cn } from "@/lib/utils";
import { DocumentConceptValue } from "./document-concept-value";

/** The margins of a concept's "Espacio": above and below, in document pixels. */
export function conceptSpacingStyle(concept: Pick<Concept, "spacingBefore" | "spacingAfter">): CSSProperties {
  return { marginTop: concept.spacingBefore ?? 0, marginBottom: concept.spacingAfter ?? 0 };
}

/** A free text with no label, printed edge to edge in the width it was given. */
export function DocumentParagraph({
  concept,
  longText,
  className,
  style,
}: {
  concept: Concept;
  /** Prints at the size of the long texts around it. */
  longText: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const theme = useDocumentTheme();
  return (
    <div className={cn(theme.conceptRow, longText && theme.longTextRow, className)} style={style}>
      <p className={cn(theme.conceptValue, longText && theme.longText)}>
        <DocumentConceptValue concept={concept} fallback="—" />
      </p>
    </div>
  );
}
