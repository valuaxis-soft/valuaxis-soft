import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  getCaratulaBlockKind,
  hasUntitledConcepts,
  UNTITLED_CARATULA_CONCEPT,
} from "../src/features/valuations/services/caratula-blocks";

const root = process.cwd();

test("clasifica bloques intermedios, Supuestos y Conclusión", () => {
  assert.equal(getCaratulaBlockKind({ id: "datos", title: "DATOS DEL INMUEBLE" }), "intermediate");
  assert.equal(
    getCaratulaBlockKind({ id: "caratula-block-5-supuestos", title: "Título renombrado" }),
    "assumptions",
  );
  assert.equal(getCaratulaBlockKind({ id: "conclusion", title: "CONCLUSIÓN" }), "conclusion");
});

test("detecta conceptos de Carátula sin título", () => {
  assert.equal(
    hasUntitledConcepts([{ concepts: [{ id: "1", label: "   ", value: "", enabled: true }], apartados: [] }]),
    true,
  );
  assert.equal(
    hasUntitledConcepts([
      { concepts: [{ id: "1", label: UNTITLED_CARATULA_CONCEPT, value: "", enabled: true }], apartados: [] },
    ]),
    false,
  );
});

test("el editor ofrece solo campos de texto y orden simple en bloques de Carátula", () => {
  const editor = readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-editor-panel.tsx"),
    "utf8",
  );

  assert.match(editor, /<FieldTitle>Bloques de Carátula<\/FieldTitle>/);
  assert.match(editor, /onMoveBlock\(section\.id, block\.id, -1\)/);
  assert.match(editor, /onMoveBlock\(section\.id, block\.id, 1\)/);
  assert.match(editor, /isIntermediateCaratulaBlock[\s\S]*Campo de texto/);
  assert.match(editor, /caratulaBlockKind === "assumptions"[\s\S]*<LongTextConceptEditor/);
  assert.match(editor, /label="Supuestos y condiciones limitantes"/);
});

test("el workspace inicia con preview al 60% y editor al 40%", () => {
  const workspace = readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-workspace.tsx"),
    "utf8",
  );

  assert.match(workspace, /id="valuation-editor" defaultSize="40%" minSize="30%" maxSize="60%"/);
  assert.match(workspace, /id="valuation-preview" defaultSize="60%" minSize="40%"/);
  assert.match(workspace, /h-full min-w-0 overflow-y-auto overscroll-contain pr-3 pb-4/);
  assert.match(workspace, /orientation="horizontal" className="h-full min-h-0 items-stretch"/);
});

test("el preview usa un visor independiente con hoja tamaño carta", () => {
  const preview = readFileSync(
    join(root, "src/features/valuations/components/report-preview.tsx"),
    "utf8",
  );
  const page = readFileSync(
    join(root, "src/features/valuations/components/document-preview-page.tsx"),
    "utf8",
  );
  const previewPanel = readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-preview-panel.tsx"),
    "utf8",
  );

  assert.match(page, /min-h-\[1056px\] w-full max-w-\[816px\]/);
  assert.match(page, /border-slate-300 bg-white[\s\S]*shadow-xl/);
  assert.match(preview, /<ScrollArea className="h-\[calc\(100vh-10rem\)\] lg:h-full">/);
  assert.match(previewPanel, /flex h-full min-h-0 min-w-0 flex-col/);
  assert.match(previewPanel, /min-h-0 flex-1 overflow-y-auto rounded-2xl/);
});

test("el preview acomoda intermedios en dos columnas y concentra la conclusión", () => {
  const preview = readFileSync(
    join(root, "src/features/valuations/components/report-preview.tsx"),
    "utf8",
  );

  assert.match(preview, /className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2"/);
  assert.match(preview, /<LongTextCoverBlock block=\{block\}/);
  assert.match(preview, /<ConclusionCoverBlock blocks=\{conclusions\} caratula=\{caratula\}/);
  assert.match(preview, /caratula\.valorTotal \|\| "Sin calcular"/);
  assert.match(preview, /caratula\.valuador \|\| "Valuador pendiente"/);
});

test("el diseño interno de Carátula sigue el lenguaje visual del PDF", () => {
  const preview = readFileSync(
    join(root, "src/features/valuations/components/report-preview.tsx"),
    "utf8",
  );
  const header = readFileSync(
    join(root, "src/features/valuations/components/document-preview-header.tsx"),
    "utf8",
  );

  assert.match(header, /sm:grid-cols-\[190px_minmax\(0,1fr\)\]/);
  assert.match(header, /Fecha del Avalúo:/);
  assert.match(header, /Folio:[\s\S]*border-2 border-\[var\(--caratula-blue\)\]/);
  assert.match(preview, /h-\[294px\] w-full object-cover/);
  assert.match(preview, /border-b-2 border-\[var\(--caratula-blue\)\][\s\S]*uppercase[\s\S]*text-\[var\(--caratula-blue\)\]/);
  assert.match(preview, /border-2 border-\[var\(--caratula-blue\)\] bg-slate-200\/80/);
  assert.match(preview, /mx-auto mb-2 mt-16 max-w-sm border-t/);
});

test("los tonos azules de Carátula están centralizados", () => {
  const preview = readFileSync(
    join(root, "src/features/valuations/components/report-preview.tsx"),
    "utf8",
  );
  const header = readFileSync(
    join(root, "src/features/valuations/components/document-preview-header.tsx"),
    "utf8",
  );

  assert.match(preview, /const CARATULA_BLUE = "#003B73"/);
  assert.match(preview, /const CARATULA_DARK_BLUE = "#00285A"/);
  assert.match(preview, /"--caratula-blue": CARATULA_BLUE/);
  assert.match(preview, /"--caratula-dark-blue": CARATULA_DARK_BLUE/);
  assert.match(header, /bg-\[var\(--caratula-dark-blue\)\]/);
  assert.match(header, /border-\[var\(--caratula-blue\)\]/);
});

test("orden y visibilidad usan IOrden y BVisible ya existentes", () => {
  const workspace = readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-workspace.tsx"),
    "utf8",
  );
  const repository = readFileSync(
    join(root, "src/features/valuations/repositories/valuation.repository.ts"),
    "utf8",
  );
  const workflow = readFileSync(
    join(root, "src/features/valuations/services/valuation-workflow.service.ts"),
    "utf8",
  );

  assert.match(workspace, /enabled: block\.enabled/);
  assert.match(workspace, /enabled: b\.enabled/);
  assert.match(workspace, /sortOrder: bi/);
  assert.match(repository, /enabled: node\.BVisible/);
  assert.match(workflow, /visible: block\.enabled \?\? true/);
  assert.match(workflow, /BVisible: input\.visible \?\? true/);
  assert.match(workflow, /IOrden: input\.order/);
});

test("frontend y persistencia protegen STitulo vacío", () => {
  const workspace = readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-workspace.tsx"),
    "utf8",
  );
  const editor = readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-editor-panel.tsx"),
    "utf8",
  );
  const workflow = readFileSync(
    join(root, "src/features/valuations/services/valuation-workflow.service.ts"),
    "utf8",
  );

  assert.match(workspace, /toast\.error\("Revisa los campos sin título antes de guardar\."\)/);
  assert.match(workspace, /sectionId === "caratula" \? UNTITLED_CARATULA_CONCEPT : undefined/);
  assert.match(editor, /if \(titleMissing\) onUpdate\(concept\.id, \{ label: UNTITLED_CARATULA_CONCEPT \}\)/);
  assert.match(editor, /<FieldError>Escribe un título para este campo\.<\/FieldError>/);
  assert.match(workflow, /const safeTitle = normalizeNodeTitle\(input\.title\) \|\| "Campo sin título"/);
  assert.match(workflow, /const safeNodeTitle = limitDbText\(safeTitle, DOCUMENT_NODE_TITLE_MAX_LENGTH\)/);
  assert.match(workflow, /STitulo: safeNodeTitle/);
});
