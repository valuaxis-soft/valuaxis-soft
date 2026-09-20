import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(
  new URL("../src/features/valuations/components/workspace/valuation-editor-panel.tsx", import.meta.url),
  "utf8",
);

function assertFieldUsesSpan(span: string, fieldPattern: RegExp) {
  const escapedSpan = span.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wrapperPattern = new RegExp(
    `<div className="${escapedSpan}">((?:(?!</div>)[\\s\\S])*)</div>`,
    "g",
  );
  const matchingWrapper = [...editor.matchAll(wrapperPattern)].some((match) =>
    fieldPattern.test(match[1]),
  );

  assert.ok(matchingWrapper, `${fieldPattern} must be contained by the ${span} wrapper`);
}

test("Carátula uses a responsive twelve-column desktop grid with semantic field spans", () => {
  assert.match(editor, /grid grid-cols-1 gap-3 md:grid-cols-6 xl:grid-cols-12/);

  assertFieldUsesSpan("min-w-0 md:col-span-6 xl:col-span-6", /label="Dirección del encabezado"/);
  assertFieldUsesSpan("min-w-0 md:col-span-3 xl:col-span-2", /label="Teléfono"/);
  assertFieldUsesSpan("min-w-0 md:col-span-3 xl:col-span-4", /label="Correo"/);
  assertFieldUsesSpan("min-w-0 md:col-span-3 xl:col-span-4", /label="Fecha del avalúo"/);
  assertFieldUsesSpan("min-w-0 md:col-span-3 xl:col-span-4", /label="Vigencia"/);
  assertFieldUsesSpan("min-w-0 md:col-span-3 xl:col-span-4", /label="Folio"/);

  assertFieldUsesSpan("min-w-0 md:col-span-6 xl:col-span-6", /label="Título del inmueble"/);
  assertFieldUsesSpan("min-w-0 md:col-span-6 xl:col-span-6", /label="Ubicación del inmueble"/);
  assertFieldUsesSpan("min-w-0 md:col-span-3 xl:col-span-2", /label="Código postal"/);
  assertFieldUsesSpan("min-w-0 md:col-span-3 xl:col-span-3", /<FieldLabel>Tipo de inmueble/);
  assertFieldUsesSpan("min-w-0 md:col-span-3 xl:col-span-3", /<FieldLabel>Tipo de avalúo/);
  assert.doesNotMatch(editor, /label="Solicitante"/);
  assert.doesNotMatch(editor, /label="Propietario"/);
  assert.doesNotMatch(editor, /label="Objeto"/);
  assert.doesNotMatch(editor, /label="Propósito"/);
});

test("Carátula date pickers pass the Spanish locale to the calendar", () => {
  assert.match(editor, /import \{ es \} from "react-day-picker\/locale";/);
  assert.match(editor, /<Calendar[\s\S]*locale=\{es\}/);
});

function caratulaGridBranch() {
  const branchStart = editor.indexOf('if (layout === "caratulaGrid")');
  assert.ok(branchStart > 0, "ConceptEditorRow must keep a dedicated caratulaGrid branch");

  const branchEnd = editor.indexOf("  return (\n    <div\n      className={cn(", branchStart);
  assert.ok(branchEnd > branchStart, "caratulaGrid branch must end before the default ConceptEditorRow return");

  return editor.slice(branchStart, branchEnd);
}

test("Carátula dynamic concepts use a compact responsive editor grid", () => {
  assert.match(editor, /layout=\{usesCompactConceptSystem \? "caratulaGrid" : "default"\}/);
  assert.match(editor, /grid-cols-1[\s\S]*md:grid-cols-2[\s\S]*xl:grid-cols-3/);

  const branch = caratulaGridBranch();
  assert.match(branch, /className="grid min-w-0 grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_auto_auto\] items-start gap-2"/);
  assert.match(branch, /value=\{concept\.label\}/);
  assert.match(branch, /value=\{formatCaratulaConceptValue\(concept\)\}/);
  assert.match(branch, /onChange=\{\(event\) => handleLinkedAwareUpdate\(\{ value: normalizeCaratulaConceptValue\(conceptType, event\.target\.value\) \}\)\}/);
  assert.match(branch, /onClick=\{\(\) => onRemove\(concept\.id\)\}/);
});

test("Canonical concept row keeps a capped title column and a flexible value field", () => {
  assert.match(editor, /grid-cols-\[auto_minmax\(0,220px\)_minmax\(0,1fr\)_auto\]/);
  assert.match(editor, /grid-cols-\[auto_minmax\(0,220px\)_minmax\(0,1fr\)_auto\] items-start/);
});

test("Carátula dynamic concept grid avoids card wrappers and keeps normal types compact", () => {
  const branch = caratulaGridBranch();

  assert.doesNotMatch(branch, /rounded-lg border bg-background p-3/);
  assert.doesNotMatch(branch, /shadow/);
  assert.doesNotMatch(branch, /min-h-24/);
  assert.doesNotMatch(branch, /resize-y/);
  assert.match(branch, /const conceptType = concept\.type \?\? "text";/);
  assert.match(branch, /conceptType === "longText" \? \(/);
  assert.match(branch, /<Textarea[\s\S]*value=\{concept\.value\}/);
  assert.match(branch, /conceptType === "date" \? \(/);
  assert.match(branch, /<CaratulaDatePicker[\s\S]*value=\{concept\.value\}/);
  assert.match(branch, /type=\{caratulaInputType\(conceptType\)\}/);
  assert.match(editor, /function caratulaInputType\(type: ConceptType\)/);
  assert.match(editor, /function formatCaratulaConceptValue\(concept: Concept\)/);
  assert.match(editor, /type === "currency"[\s\S]*Intl.NumberFormat\("es-MX"/);
  assert.match(editor, /type === "measurement"[\s\S]*m²/);
  assert.match(editor, /function normalizeCaratulaConceptValue\(type: ConceptType, value: string\)/);
  assert.match(editor, /type === "number"[\s\S]*digitsOnly\(value\)/);
  assert.doesNotMatch(branch, /type=\{caratulaInputType\(conceptType\)\}[\s\S]*type="date"/);
});

test("Carátula block concept menu stays below its concept list and offers every type", () => {
  const caratulaConceptList = editor.indexOf(
    'layout={usesCompactConceptSystem ? "caratulaGrid" : "default"}',
  );
  const addConcept = editor.indexOf("Concepto", caratulaConceptList);

  assert.ok(caratulaConceptList > 0, "Carátula concepts must use the dedicated editor list");
  assert.ok(addConcept > caratulaConceptList, "Carátula add button must appear after the concept list");
  assert.match(editor, /Crear concepto/);
  assert.match(editor, /Usar concepto existente/);
  assert.match(editor, /aria-label="Copiar independiente\. No se sincroniza\."/);
  assert.match(editor, /aria-label="Vincular completo\. Título y dato se sincronizan\."/);
  assert.match(editor, /aria-label="Vincular solo dato\. Solo el dato se sincroniza\."/);
  assert.doesNotMatch(editor, />\s*Copiar independiente\s*</);
  assert.doesNotMatch(editor, />\s*Vincular completo\s*</);
  assert.doesNotMatch(editor, />\s*Vincular solo dato\s*</);
  assert.match(editor, /CONCEPT_TYPE_OPTIONS/);
  assert.match(editor, /const usesCompactConceptSystem = isIntermediateCaratulaBlock \|\| isDatosGenerales;/);
  assert.match(editor, /!isCaratula && !isFixedTerreno && !isDatosGenerales/);
  for (const type of ["text", "date", "phone", "email", "number", "currency", "measurement", "longText"]) {
    assert.match(editor, new RegExp(`type: "${type}"`));
  }
});

test("Carátula linked concepts use tiny status icons and compact inline actions", () => {
  assert.match(editor, /conceptLinkIndicator\(concept, allConcepts\)/);
  assert.match(editor, /isFull \? "text-blue-600" : "text-green-600"/);
  assert.match(editor, /isFull \? <Link2 \/> : <Link \/>/);
  assert.match(editor, /Vínculo completo: título y dato se actualizan en todos lados\./);
  assert.match(editor, /Vínculo parcial: solo el campo vinculado se actualiza en todos lados\./);
  assert.doesNotMatch(editor, /pendingLinkedEdit|setPendingLinkedEdit|Update linked concept everywhere|Update value everywhere|Edit only here/);
  assert.match(editor, /Desvincular/);
  assert.match(editor, /Convierte este concepto en independiente\./);
  assert.doesNotMatch(editor, /DialogContent|AlertDialogContent|SheetContent/);
});
