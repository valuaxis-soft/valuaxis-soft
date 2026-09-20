import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createInitialSections } from "../src/features/valuations/sections";
import {
  COMPANY_HEADER_BLOCK_ID,
  ensureCompanyHeaderFields,
  readCompanyHeaderFields,
  updateCompanyHeaderFields,
} from "../src/features/valuations/services/caratula-company-header";

const root = process.cwd();

test("agrega los campos internos de Caratula usando conceptos persistibles", () => {
  const sections = ensureCompanyHeaderFields(createInitialSections());
  const block = sections
    .find((section) => section.id === "caratula")
    ?.blocks.find((item) => item.id === COMPANY_HEADER_BLOCK_ID);

  assert.ok(block);
  assert.deepEqual(
    block.concepts.map((concept) => concept.label),
    ["Título del inmueble", "Dirección de empresa", "Teléfono de empresa", "Correo de empresa"],
  );
});

test("actualiza y recupera los datos de encabezado desde la estructura existente", () => {
  const sections = updateCompanyHeaderFields(createInitialSections(), {
    tituloInmueble: "TERRENO URBANO CON CASA HABITACIÓN",
    direccionEmpresa: "Av. Reforma 100",
    telefonoEmpresa: "5555 0101",
    correoEmpresa: "contacto@valuadora.mx",
  });

  assert.deepEqual(readCompanyHeaderFields(sections), {
    tituloInmueble: "TERRENO URBANO CON CASA HABITACIÓN",
    direccionEmpresa: "Av. Reforma 100",
    telefonoEmpresa: "5555 0101",
    correoEmpresa: "contacto@valuadora.mx",
  });
});

test("el editor y el preview consumen los campos internos de Caratula", () => {
  const editor = readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-editor-panel.tsx"),
    "utf8",
  );
  const preview = readFileSync(
    join(root, "src/features/valuations/components/report-preview.tsx"),
    "utf8",
  );
  const previewHeader = readFileSync(
    join(root, "src/features/valuations/components/document-preview-header.tsx"),
    "utf8",
  );

  assert.match(editor, /label="Dirección del encabezado"/);
  assert.match(editor, /label="Título del inmueble"/);
  assert.match(editor, /label="Teléfono"/);
  assert.match(editor, /label="Correo"/);
  assert.match(previewHeader, /caratula\.direccionEmpresa \|\| "Dirección pendiente"/);
  assert.match(previewHeader, /caratula\.telefonoEmpresa \|\| "Teléfono pendiente"/);
  assert.match(previewHeader, /caratula\.correoEmpresa \|\| "Correo pendiente"/);
  assert.match(preview, /caratula\.tituloInmueble \|\| "Título del inmueble pendiente"/);
});

test("Número de avalúo no aparece en edición y Folio conserva su edición", () => {
  const editor = readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-editor-panel.tsx"),
    "utf8",
  );

  assert.doesNotMatch(editor, /label="Número de avalúo"/);
  assert.match(editor, /label="Folio"[\s\S]*?onChange=\{\(folio\) => onUpdate\(\{ folio \}\)\}/);
});

test("Caratula agrupa sus campos y protege los valores calculados", () => {
  const editor = readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-editor-panel.tsx"),
    "utf8",
  );
  assert.match(editor, /<FieldTitle>Encabezado del documento<\/FieldTitle>/);
  assert.match(editor, /<FieldTitle>Datos del avalúo \/ Carátula<\/FieldTitle>/);
  assert.match(editor, /<FieldTitle>Conclusión<\/FieldTitle>[\s\S]*?<CalculatedValuesEditor/);
  assert.match(editor, /<\/section>[\s\S]*?<ValuerCompanyEditor/);
  assert.doesNotMatch(editor, /<FieldTitle>Valores calculados<\/FieldTitle>/);
  assert.equal((editor.match(/label="Número de avalúo"/g) ?? []).length, 0);
  assert.match(editor, /inputReadOnly\s+label="Valor total"/);
  assert.match(editor, /inputReadOnly\s+label="Valor con letra"/);
  assert.match(editor, /<FieldTitle>Datos de empresa valuadora<\/FieldTitle>/);
  assert.match(editor, /label="Valuador"/);
});

test("Caratula usa Calendar y Popover para ambas fechas", () => {
  const editor = readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-editor-panel.tsx"),
    "utf8",
  );

  assert.equal((editor.match(/<CaratulaDatePicker/g) ?? []).length, 2);
  assert.match(editor, /<Calendar[\s\S]*mode="single"/);
  assert.match(editor, /<Popover open=\{open\} onOpenChange=\{setOpen\}>/);
});
