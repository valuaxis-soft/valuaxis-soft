import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";

/* ------------------------------------------------------------------ */
/*  File-level structural checks                                       */
/* ------------------------------------------------------------------ */

const rendererPath = path.resolve(
  __dirname,
  "../src/features/valuations/components/document-block-renderer.tsx",
);
const rendererSource = readFileSync(rendererPath, "utf-8");

const reportPreviewPath = path.resolve(
  __dirname,
  "../src/features/valuations/components/report-preview.tsx",
);
const reportPreviewSource = readFileSync(reportPreviewPath, "utf-8");

test("DocumentBlockRenderer file exists", () => {
  assert.ok(rendererSource.length > 0, "document-block-renderer.tsx should exist and have content");
});

test("DocumentBlockRenderer is exported", () => {
  assert.ok(
    rendererSource.includes("export function DocumentBlockRenderer"),
    "should export DocumentBlockRenderer",
  );
});

test("imports BlockFlowV2 resolution", () => {
  assert.ok(
    rendererSource.includes('from "@/features/valuations/services/block-flow"'),
    "should import from block-flow service",
  );
  assert.ok(
    rendererSource.includes("resolveBlockFlowV2"),
    "should use resolveBlockFlowV2",
  );
});

test("imports ContentLayoutV2 resolution", () => {
  assert.ok(
    rendererSource.includes('from "@/features/valuations/services/content-layout-v2"'),
    "should import from content-layout-v2 service",
  );
  assert.ok(
    rendererSource.includes("resolveContentLayoutV2"),
    "should use resolveContentLayoutV2",
  );
});

test("does NOT import DnD libraries", () => {
  assert.ok(
    !rendererSource.includes("@dnd-kit"),
    "should not import @dnd-kit",
  );
  assert.ok(
    !rendererSource.includes("react-dnd"),
    "should not import react-dnd",
  );
  assert.ok(
    !rendererSource.includes("react-beautiful-dnd"),
    "should not import react-beautiful-dnd",
  );
});

test("does NOT import editor components", () => {
  assert.ok(
    !rendererSource.includes("ConceptEditorRow"),
    "should not import ConceptEditorRow",
  );
  assert.ok(
    !rendererSource.includes("ImageEditorItem"),
    "should not import ImageEditorItem",
  );
  assert.ok(
    !rendererSource.includes("TableEditorItem"),
    "should not import TableEditorItem",
  );
  assert.ok(
    !rendererSource.includes("SortableApartado"),
    "should not import SortableApartado",
  );
});

test("reuses DocumentConceptValue", () => {
  assert.ok(
    rendererSource.includes('import { DocumentConceptValue } from "./document-concept-value"'),
    "should import DocumentConceptValue",
  );
  assert.ok(
    rendererSource.includes("<DocumentConceptValue"),
    "should render DocumentConceptValue",
  );
});

test("reuses DocumentImage", () => {
  assert.ok(
    rendererSource.includes('import { DocumentImage } from "./document-image"'),
    "should import DocumentImage",
  );
  assert.ok(
    rendererSource.includes("<DocumentImage"),
    "should render DocumentImage",
  );
});

test("reuses DocumentTable", () => {
  assert.ok(
    rendererSource.includes('import { DocumentTable } from "./document-table"'),
    "should import DocumentTable",
  );
  assert.ok(
    rendererSource.includes("<DocumentTable"),
    "should render DocumentTable",
  );
});

test("reuses DocumentBlockTitleBar", () => {
  assert.ok(
    rendererSource.includes('import { DocumentBlockTitleBar } from "./document-block-title-bar"'),
    "should import DocumentBlockTitleBar",
  );
  assert.ok(
    rendererSource.includes("<DocumentBlockTitleBar"),
    "should render DocumentBlockTitleBar",
  );
});

/* ------------------------------------------------------------------ */
/*  Rendering behavior                                                 */
/* ------------------------------------------------------------------ */

test("renders content rows from BlockFlowV2", () => {
  assert.ok(
    rendererSource.includes("content-row") && rendererSource.includes("DocumentContentRow"),
    "should handle content-row structural rows via DocumentContentRow",
  );
});

test("renders single apartados", () => {
  assert.ok(
    rendererSource.includes("SINGLE APARTADO"),
    "should have SINGLE APARTADO branch",
  );
  assert.ok(
    rendererSource.includes("DocumentApartado"),
    "should render via DocumentApartado",
  );
});

test("renders paired apartados side-by-side", () => {
  assert.ok(
    rendererSource.includes("PAIRED APARTADOS"),
    "should have PAIRED APARTADOS branch",
  );
  assert.ok(
    rendererSource.includes("grid grid-cols-2 gap-4"),
    "paired apartados should use deterministic 2-column grid",
  );
});

test("respects visibility (enabled !== false)", () => {
  assert.ok(
    rendererSource.includes('subBlock.enabled === false'),
    "should skip disabled sub-blocks",
  );
  assert.ok(
    rendererSource.includes('concept.enabled === false'),
    "should filter disabled concepts",
  );
  assert.ok(
    rendererSource.includes('image.enabled === false'),
    "should filter disabled images",
  );
  assert.ok(
    rendererSource.includes('table.enabled === false'),
    "should filter disabled tables",
  );
});

test("uses visible-numbering for apartado labels", () => {
  assert.ok(
    rendererSource.includes('from "@/features/valuations/services/visible-numbering"'),
    "should import from visible-numbering",
  );
  assert.ok(
    rendererSource.includes("formatVisibleChildLabel"),
    "should use formatVisibleChildLabel for apartado labels",
  );
  assert.ok(
    rendererSource.includes("getBlockFlowApartadoOrder"),
    "should use getBlockFlowApartadoOrder for numbering order",
  );
});

/* ------------------------------------------------------------------ */
/*  ReportSection integration                                          */
/* ------------------------------------------------------------------ */

test("ReportSection uses DocumentBlockRenderer", () => {
  assert.ok(
    reportPreviewSource.includes('import { DocumentBlockRenderer } from "./document-block-renderer"'),
    "report-preview should import DocumentBlockRenderer",
  );
  assert.ok(
    reportPreviewSource.includes("<DocumentBlockRenderer"),
    "ReportSection should render DocumentBlockRenderer",
  );
});

test("ReportSection no longer renders ReportBlock directly", () => {
  assert.ok(
    !reportPreviewSource.includes("<ReportBlock"),
    "should not render old ReportBlock",
  );
});

test("ReportSection no longer renders ReportSubBlock directly", () => {
  assert.ok(
    !reportPreviewSource.includes("<ReportSubBlock"),
    "should not render old ReportSubBlock",
  );
});

test("old helper functions removed from report-preview", () => {
  assert.ok(
    !reportPreviewSource.includes("function conceptLayoutClass"),
    "conceptLayoutClass should be removed",
  );
  assert.ok(
    !reportPreviewSource.includes("function conceptLayoutStyle"),
    "conceptLayoutStyle should be removed",
  );
  assert.ok(
    !reportPreviewSource.includes("function ReportBlock"),
    "ReportBlock should be removed",
  );
  assert.ok(
    !reportPreviewSource.includes("function ReportSubBlock"),
    "ReportSubBlock should be removed",
  );
  assert.ok(
    !reportPreviewSource.includes("function ReportMedia"),
    "ReportMedia should be removed",
  );
});

/* ------------------------------------------------------------------ */
/*  DatosPreview migration to DocumentBlockRenderer                    */
/* ------------------------------------------------------------------ */

const datosPreviewPath = path.resolve(
  __dirname,
  "../src/features/valuations/components/datos-generales-preview.tsx",
);
const datosPreviewSource = readFileSync(datosPreviewPath, "utf-8");

test("DatosPreview imports and uses documentBlockFlowItems", () => {
  assert.ok(
    datosPreviewSource.includes('documentBlockFlowItems'),
    "DatosPreview should import documentBlockFlowItems",
  );
  assert.ok(
    datosPreviewSource.includes("documentBlockFlowItems(block"),
    "DatosPreview should call documentBlockFlowItems",
  );
});

test("DatosPreview no longer has DatosBlockPreview", () => {
  assert.ok(
    !datosPreviewSource.includes("function DatosBlockPreview"),
    "DatosBlockPreview should be removed",
  );
  assert.ok(
    !datosPreviewSource.includes("<DatosBlockPreview"),
    "DatosBlockPreview should not be rendered",
  );
});

test("DatosPreview no longer has DatosSubBlockPreview", () => {
  assert.ok(
    !datosPreviewSource.includes("function DatosSubBlockPreview"),
    "DatosSubBlockPreview should be removed",
  );
  assert.ok(
    !datosPreviewSource.includes("<DatosSubBlockPreview"),
    "DatosSubBlockPreview should not be rendered",
  );
});

test("DatosPreview no longer has DocumentFieldGrid", () => {
  assert.ok(
    !datosPreviewSource.includes("function DocumentFieldGrid"),
    "DocumentFieldGrid should be removed from DatosPreview",
  );
});

test("DatosPreview no longer has DatosNodePreview", () => {
  assert.ok(
    !datosPreviewSource.includes("function DatosNodePreview"),
    "DatosNodePreview should be removed",
  );
});

test("DatosPreview no longer has DocumentSectionTitle", () => {
  assert.ok(
    !datosPreviewSource.includes("function DocumentSectionTitle"),
    "DocumentSectionTitle should be removed",
  );
});

test("DatosPreview no longer has DocumentMedia", () => {
  assert.ok(
    !datosPreviewSource.includes("function DocumentMedia"),
    "DocumentMedia should be removed from DatosPreview",
  );
});

test("DatosPreview preserves AutoPaginatedDocumentFlow wrapper", () => {
  assert.ok(
    datosPreviewSource.includes("<AutoPaginatedDocumentFlow"),
    "should keep AutoPaginatedDocumentFlow",
  );
  assert.ok(
    datosPreviewSource.includes('pageKeyPrefix="datos"'),
    "should keep pageKeyPrefix datos",
  );
});

test("DatosPreview preserves empty state", () => {
  assert.ok(
    datosPreviewSource.includes('"No se proporcionó"'),
    "should preserve empty state fallback text",
  );
});

test("DatosPreview no longer imports legacy helpers", () => {
  assert.ok(
    !datosPreviewSource.includes("DocumentBlockTitleBar"),
    "should not import DocumentBlockTitleBar directly",
  );
  assert.ok(
    !datosPreviewSource.includes("DocumentConceptValue"),
    "should not import DocumentConceptValue directly",
  );
  assert.ok(
    !datosPreviewSource.includes("DocumentImage"),
    "should not import DocumentImage directly",
  );
  assert.ok(
    !datosPreviewSource.includes("DocumentTable"),
    "should not import DocumentTable directly",
  );
});

/* ------------------------------------------------------------------ */
/*  Frozen areas untouched                                             */
/* ------------------------------------------------------------------ */

test("CaratulaPreview still exists in report-preview", () => {
  assert.ok(
    reportPreviewSource.includes("function CaratulaPreview"),
    "CaratulaPreview must not be removed",
  );
});

test("CoverBlock still exists in report-preview", () => {
  assert.ok(
    reportPreviewSource.includes("function CoverBlock"),
    "CoverBlock must not be removed",
  );
});

test("LongTextCoverBlock exists in modules file", () => {
  const modulesPath = path.join(
    process.cwd(),
    "src/features/valuations/components/caratula-preview-modules.tsx",
  );
  const modulesSource = readFileSync(modulesPath, "utf-8");
  assert.ok(
    modulesSource.includes("CaratulaAssumptionsModule"),
    "CaratulaAssumptionsModule must exist in modules file",
  );
});

test("ConclusionCoverBlock exists in modules file", () => {
  const modulesPath = path.join(
    process.cwd(),
    "src/features/valuations/components/caratula-preview-modules.tsx",
  );
  const modulesSource = readFileSync(modulesPath, "utf-8");
  assert.ok(
    modulesSource.includes("CaratulaConclusionModule"),
    "CaratulaConclusionModule must exist in modules file",
  );
});

/* ------------------------------------------------------------------ */
/*  Concept cell styling                                               */
/* ------------------------------------------------------------------ */

test("DocumentConceptCell applies layout span for full-width concepts", () => {
  assert.ok(
    rendererSource.includes('concept.layoutSpan === "full"'),
    "should check layoutSpan for full-width",
  );
  assert.ok(
    rendererSource.includes("col-span-2"),
    "full-width concept should span 2 columns",
  );
});

test("DocumentConceptCell applies spacing when applyConceptLayout is true", () => {
  assert.ok(
    rendererSource.includes("spacingBefore"),
    "should use spacingBefore",
  );
  assert.ok(
    rendererSource.includes("spacingAfter"),
    "should use spacingAfter",
  );
});

/* ------------------------------------------------------------------ */
/*  Content row grid                                                   */
/* ------------------------------------------------------------------ */

test("DocumentContentRow uses deterministic document grid based on column count", () => {
  assert.ok(
    rendererSource.includes("grid-cols-1"),
    "single column should use grid-cols-1",
  );
  assert.ok(
    rendererSource.includes('"grid-cols-2"'),
    "two columns should use grid-cols-2 (document-fixed)",
  );
  assert.ok(
    rendererSource.includes('"grid-cols-3"'),
    "three columns should use grid-cols-3 (document-fixed)",
  );
  // Must NOT use responsive breakpoints for semantic column count
  assert.ok(
    !rendererSource.includes("sm:grid-cols-2") && !rendererSource.includes("sm:grid-cols-3"),
    "must not use responsive breakpoints for semantic column count",
  );
});

/* ------------------------------------------------------------------ */
/*  Structural parity: Apartado ContentLayoutV2                        */
/* ------------------------------------------------------------------ */

test("DocumentContentLayoutRenderer exists and is reusable", () => {
  assert.ok(
    rendererSource.includes("function DocumentContentLayoutRenderer"),
    "should define DocumentContentLayoutRenderer",
  );
  assert.ok(
    rendererSource.includes("resolveContentLayoutV2(container)"),
    "DocumentContentLayoutRenderer must resolve layout from container",
  );
});

test("DocumentApartado consumes SubBlock ContentLayoutV2 via DocumentContentLayoutRenderer", () => {
  assert.ok(
    rendererSource.includes("<DocumentContentLayoutRenderer"),
    "DocumentApartado should render DocumentContentLayoutRenderer",
  );
  // Must NOT render concepts directly in a hardcoded grid
  assert.ok(
    !rendererSource.includes("subBlock.concepts.filter"),
    "must not iterate subBlock.concepts directly — use layout",
  );
});

test("DocumentApartado no longer renders DocumentMedia separately", () => {
  assert.ok(
    !rendererSource.includes("<DocumentMedia"),
    "must not render DocumentMedia — layout handles images/tables",
  );
  assert.ok(
    !rendererSource.includes("function DocumentMedia"),
    "DocumentMedia helper should be removed — layout subsumes it",
  );
});

test("DocumentContentLayoutRenderer handles single-concept row (1 column)", () => {
  // DocumentContentRow already renders grid-cols-1 for single-column rows.
  // DocumentContentLayoutRenderer delegates to DocumentContentRow, so the
  // grid class is determined by the resolved layout's column count.
  assert.ok(
    rendererSource.includes("DocumentContentRow") && rendererSource.includes("resolvedLayout.rows.map"),
    "DocumentContentLayoutRenderer must map over resolved layout rows and delegate to DocumentContentRow",
  );
});

test("Apartado layout order follows ContentLayoutV2, not concepts[] order", () => {
  // The renderer resolves layout via resolveContentLayoutV2 which respects
  // the persisted contentLayout order. It does NOT fall back to concepts[].
  assert.ok(
    rendererSource.includes("resolveContentLayoutV2(container)"),
    "DocumentContentLayoutRenderer must use resolveContentLayoutV2 for ordering",
  );
  // Verify no direct .map on subBlock.concepts in DocumentApartado
  const apartadoSection = rendererSource.slice(
    rendererSource.indexOf("function DocumentApartado"),
    rendererSource.indexOf("function DocumentContentLayoutRenderer"),
  );
  assert.ok(
    !apartadoSection.includes(".map("),
    "DocumentApartado must not .map concepts directly — layout controls order",
  );
});
