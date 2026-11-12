"use client";

import type { CSSProperties } from "react";

import type { Concept, ContentRowTagStyle } from "@/features/valuations/model";
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
  className,
  style,
  tagStyle,
}: {
  concept: Concept;
  className?: string;
  /** Printed as a data label: marks it for the row's "Etiquetas". */
  tagStyle?: ContentRowTagStyle;
  style?: CSSProperties;
}) {
  const theme = useDocumentTheme();
  return (
    <div className={cn(theme.conceptRow, className)} style={style} data-concept-tag={tagStyle}>
      <p className={theme.conceptValue}>
        <DocumentConceptValue concept={concept} fallback="—" />
      </p>
    </div>
  );
}
