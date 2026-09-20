"use client";

import type { Concept, ContentLayoutPersisted, ImageContent, TableContent } from "@/features/valuations/model";
import { resolveContentLayout } from "@/features/valuations/services/content-layout";
import { formatConceptTitleWithColon } from "@/features/valuations/services/concept-title";
import { useDocumentTheme } from "@/features/valuations/components/document-theme";
import { resolveConceptLabelGuide } from "@/features/valuations/services/concept-presentation";
import { DocumentConceptValue } from "./document-concept-value";
import { DocumentImage } from "./document-image";
import { DocumentTable } from "./document-table";
import type { ConceptPresentation } from "@/features/valuations/services/concept-presentation";

/* ── Technical list single concept row ─────────────────────────── */

function TechnicalConceptRow({
  concept,
  applyConceptLayout,
  labelGuidePx,
}: {
  concept: Concept;
  applyConceptLayout: boolean;
  labelGuidePx: number;
}) {
  return (
    <div
      className="grid min-w-0 w-full max-w-full items-start"
      style={{ gridTemplateColumns: `${labelGuidePx}px minmax(0, 1fr)` }}
    >
      <span className="min-w-0 text-[11px] font-semibold text-[#1a1a1a] leading-snug text-right pr-2 whitespace-nowrap">
        {formatConceptTitleWithColon(concept.label)}
      </span>
      <span className="min-w-0 text-[11px] text-[#333333] whitespace-pre-wrap break-words leading-snug">
        <DocumentConceptValue applyFormatting={applyConceptLayout} concept={concept} fallback="—" />
      </span>
    </div>
  );
}

/* ── Main technical list renderer ───────────────────────────────── */

export function DocumentTechnicalList({
  container,
  applyConceptLayout,
  containerPresentation,
}: {
  container: { concepts: Concept[]; images: ImageContent[]; tables: TableContent[]; contentLayout?: ContentLayoutPersisted };
  applyConceptLayout: boolean;
  containerPresentation?: ConceptPresentation;
}) {
  const resolvedLayout = resolveContentLayout(container);
  const conceptsById = new Map(container.concepts.map((c) => [c.id, c]));
  const imagesById = new Map(container.images.map((i) => [i.id, i]));
  const tablesById = new Map(container.tables.map((t) => [t.id, t]));
  const guidePx = resolveConceptLabelGuide(containerPresentation);

  return (
    <div className="space-y-1">
      {resolvedLayout.rows.map((layoutRow) => (
        layoutRow.columns.map((column) => (
          column.items.map((itemRef) => {
            if (itemRef.type === "concept") {
              const concept = conceptsById.get(itemRef.id);
              if (!concept || concept.enabled === false) return null;
              return (
                <TechnicalConceptRow
                  key={itemRef.id}
                  concept={concept}
                  applyConceptLayout={applyConceptLayout}
                  labelGuidePx={guidePx}
                />
              );
            }
            if (itemRef.type === "image") {
              const image = imagesById.get(itemRef.id);
              if (!image || image.enabled === false) return null;
              return (
                <div className="my-2" key={itemRef.id}>
                  <DocumentImage image={image} />
                </div>
              );
            }
            if (itemRef.type === "table") {
              const table = tablesById.get(itemRef.id);
              if (!table || table.enabled === false) return null;
              return <div className="my-2" key={itemRef.id}><DocumentTable table={table} variant="report" /></div>;
            }
            return null;
          })
        ))
      ))}
    </div>
  );
}
