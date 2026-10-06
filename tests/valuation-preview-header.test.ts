import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReportPreview } from "../src/features/valuations/components/report-preview";
import { DocumentPreviewHeader } from "../src/features/valuations/components/document-preview-header";
import type { AppSection, CaratulaFormData, Letterhead } from "../src/features/valuations/model";
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
  firmas: [],
  valorTotal: "",
  valorConLetra: "",
  fechaAvaluo: "01/01/2026",
  mesesVigencia: null,
  fechaVigencia: "01/07/2026",
};

const letterhead: Letterhead = {
  name: "Empresa",
  legalName: null,
  rfc: null,
  address: null,
  phone: null,
  email: null,
  logoUrl: null,
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
    letterhead,
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

test("el membrete del despacho llena lo que la carátula del avalúo deja vacío", () => {
  const firm: Letterhead = {
    name: "Valuadores de los Altos",
    legalName: "Valuadores de los Altos S.A. de C.V.",
    rfc: "VAL010101AB1",
    address: "Av. Despacho 100, Guadalajara",
    phone: "33 1111 1111",
    email: "contacto@despacho.mx",
    logoUrl: "https://example.test/logo.jpg",
  };
  const blank = { ...caratula, direccionEmpresa: "", telefonoEmpresa: "", correoEmpresa: "" };
  const fromFirm = renderToStaticMarkup(createElement(DocumentPreviewHeader, { caratula: blank, letterhead: firm }));
  // The name printed is the firm's legal name, with its RFC underneath.
  assert.match(fromFirm, />Valuadores de los Altos S\.A\. de C\.V\.</);
  assert.doesNotMatch(fromFirm, />Valuadores de los Altos</);
  assert.match(fromFirm, />RFC VAL010101AB1</);
  assert.match(fromFirm, /alt="Logotipo de Valuadores de los Altos S\.A\. de C\.V\."/);
  assert.match(fromFirm, /Av\. Despacho 100, Guadalajara/);
  assert.match(fromFirm, /33 1111 1111/);
  assert.match(fromFirm, /contacto@despacho\.mx/);
  assert.match(fromFirm, /src="https:\/\/example\.test\/logo\.jpg"/);

  const own = renderToStaticMarkup(createElement(DocumentPreviewHeader, {
    caratula,
    letterhead: firm,
    headerImage: { id: "img", src: "https://example.test/propia.jpg", title: "Propia", enabled: true },
  }));
  assert.match(own, />Dirección</);
  assert.match(own, /33 0000 0000/);
  assert.match(own, /src="https:\/\/example\.test\/propia\.jpg"/);
  assert.doesNotMatch(own, /logo\.jpg/);
});

test("sin razón social, el encabezado imprime el nombre de la organización", () => {
  const header = (firm: Partial<Letterhead>) =>
    renderToStaticMarkup(createElement(DocumentPreviewHeader, { caratula, letterhead: { ...letterhead, name: "Espacio personal de Alvaro", ...firm } }));

  assert.match(header({ legalName: "ALVARO GUTIERREZ NAVARRO" }), />ALVARO GUTIERREZ NAVARRO</);
  assert.doesNotMatch(header({ legalName: "ALVARO GUTIERREZ NAVARRO" }), /Espacio personal de Alvaro/);
  assert.match(header({ legalName: null }), />Espacio personal de Alvaro</);
  assert.match(header({ legalName: "   " }), />Espacio personal de Alvaro</, "a blank legal name is no name");
  assert.match(header({ legalName: null, rfc: "GUNA9408205Q4" }), />RFC GUNA9408205Q4</);
});
