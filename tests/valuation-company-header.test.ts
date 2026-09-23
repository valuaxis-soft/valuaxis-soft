import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSections } from "../src/features/valuations/sections";
import {
  COMPANY_HEADER_BLOCK_ID,
  ensureCompanyHeaderFields,
  readCompanyHeaderFields,
  updateCompanyHeaderFields,
} from "../src/features/valuations/services/caratula-company-header";

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
