import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReportPreview } from "../src/features/valuations/components/report-preview";
import type { AppSection, CaratulaFormData } from "../src/features/valuations/model";
import { ensureTerrenoSection, terrenoSection } from "../src/features/valuations/sections/terreno";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

const caratula: CaratulaFormData = {
  tituloInmueble: "",
  numeroAvaluo: "",
  folio: "VLO-001",
  direccionEmpresa: "Dirección",
  telefonoEmpresa: "33 0000 0000",
  correoEmpresa: "correo@example.com",
  solicitante: "",
  propietario: "",
  objeto: "",
  proposito: "",
  valuador: "",
  registroValuador: "",
  valorTotal: "",
  valorConLetra: "",
  fechaAvaluo: "01/01/2026",
  fechaVigencia: "01/07/2026",
};

const emptySection: AppSection = {
  id: "costos",
  label: "IV",
  title: "CONSTRUCCIÓN",
  sourceFile: "",
  enabled: true,
  required: false,
  blocks: [],
};

const contentBlock = {
  id: "bloque-contenido",
  title: "BLOQUE CON CONTENIDO",
  sectionLabel: "I",
  enabled: true,
  required: false,
  concepts: [{ id: "concepto-contenido", label: "Campo", value: "Valor", enabled: true }],
  apartados: [],
  tables: [],
  images: [],
};

// Sections without visible content render no document pages, so each fixture carries one block.
test("Datos, Terreno y secciones genéricas comparten el encabezado universal", () => {
  const sections: AppSection[] = [
    { ...emptySection, id: "datosGenerales", label: "II", title: "DATOS GENERALES", blocks: [contentBlock] },
    ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" }),
    { ...emptySection, blocks: [contentBlock] },
  ];

  for (const section of sections) {
    const html = renderPreview(section);
    assert.match(html, /data-document-preview-header="true"/);
    assert.match(html, />DICTAMEN VALUATORIO</);
    assert.match(html, />Empresa</);
    assert.match(html, />VLO-001</);
  }
});

function renderPreview(section: AppSection) {
  return renderToStaticMarkup(createElement(ReportPreview, {
    caratula,
    companyName: "Empresa",
    meta: {
      folio: "VLO-001",
      client: "",
      postalCode: "",
      location: "",
      valuationKind: "venta",
      propertyKind: "casa",
    },
    section,
    comparables: [],
    principalCoverImage: null,
  }));
}
