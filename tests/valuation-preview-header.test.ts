import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReportPreview } from "../src/features/valuations/components/report-preview";
import type { AppSection, CaratulaFormData } from "../src/features/valuations/model";
import { ensureTerrenoSection, terrenoSection } from "../src/features/valuations/sections/terreno";

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

test("Datos, Terreno y secciones genéricas comparten el encabezado universal", () => {
  const sections: AppSection[] = [
    { ...emptySection, id: "datosGenerales", label: "II", title: "DATOS GENERALES" },
    ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" }),
    emptySection,
  ];

  for (const section of sections) {
    const html = renderPreview(section);
    assert.match(html, /data-document-preview-header="true"/);
    assert.match(html, /sm:grid-cols-\[190px_minmax\(0,1fr\)\]/);
    assert.match(html, /h-24/);
    assert.match(html, /text-3xl/);
    assert.match(html, /bg-\[var\(--caratula-dark-blue\)\][^>]*>DICTAMEN VALUATORIO/);
    assert.match(html, /pt-3 sm:px-8/);
  }
});

test("la hoja compartida conserva borde, sombra y proporción carta", () => {
  const html = renderPreview(emptySection);
  assert.match(html, /min-h-\[1056px\]/);
  assert.match(html, /max-w-\[816px\]/);
  assert.match(html, /border border-slate-300/);
  assert.match(html, /shadow-xl shadow-slate-900\/10/);
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
