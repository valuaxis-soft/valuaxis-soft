import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DatosPreview } from "../src/features/valuations/components/datos-generales-preview";
import {
  formatDatosBlockTitle,
  stripLeadingRomanNumeral,
  toRomanNumeral,
} from "../src/features/valuations/components/datos-generales-display";
import { ReportPreview } from "../src/features/valuations/components/report-preview";
import { formatDocumentBlockTitle } from "../src/features/valuations/components/document-block-title-bar";
import type { AppSection, Block, CaratulaFormData } from "../src/features/valuations/model";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

function block(id: string, title: string, value = "Valor editable"): Block {
  return {
    id,
    title,
    sectionLabel: "I",
    enabled: true,
    required: false,
    concepts: [{ id: `${id}-concept`, label: `Campo ${id}`, value, enabled: true }],
    apartados: [],
    tables: [],
    images: [],
  };
}

const section: AppSection = {
  id: "datos",
  label: "II.",
  title: "Datos generales desde la sección",
  sourceFile: "2. DATOS.pdf",
  enabled: true,
  required: true,
  blocks: [
    {
      ...block("principal", "TÍTULO EDITABLE DEL DOCUMENTO"),
      sectionLabel: "I",
      apartados: [
        {
          id: "subblock",
          title: "SUBTÍTULO EDITABLE",
          enabled: true,
          concepts: [{ id: "long-text", label: "Narrativa", value: "Texto largo editable\ncon segunda línea.", enabled: true }],
          tables: [{ id: "table", title: "Tabla editable", columns: ["Columna"], rows: [["Celda"]], enabled: true }],
          images: [{ id: "image", title: "Imagen editable", src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", enabled: true }],
        },
      ],
    },
  ],
};

const caratula: CaratulaFormData = {
  tituloInmueble: "",
  numeroAvaluo: "",
  folio: "",
  direccionEmpresa: "",
  telefonoEmpresa: "",
  correoEmpresa: "",
  solicitante: "",
  propietario: "",
  objeto: "",
  proposito: "",
  valuador: "",
  registroValuador: "",
  valorTotal: "",
  valorConLetra: "",
  fechaAvaluo: "",
  fechaVigencia: "",
};

test("el preview de Datos renderiza la estructura dinámica sin títulos artificiales", () => {
  const html = renderToStaticMarkup(createElement(DatosPreview, {
    header: createElement("header", null, "Encabezado"),
    section,
  }));

  assert.match(html, /I\. TÍTULO EDITABLE DEL DOCUMENTO/);
  assert.doesNotMatch(html, /A\. TÍTULO EDITABLE DEL DOCUMENTO/);
  assert.match(html, /SUBTÍTULO EDITABLE/);
  assert.match(html, /Texto largo editable/);
  assert.match(html, /Tabla editable/);
  assert.match(html, /Celda/);
  assert.match(html, /Imagen editable/);
  assert.doesNotMatch(html, /Datos generales desde la sección/);
  assert.doesNotMatch(html, /I\. DATOS GENERALES/);
  assert.doesNotMatch(html, /II\. CARACTERÍSTICAS URBANAS/);
});

// Height-based page splitting now happens on the client after DOM measurement
// (AutoPaginatedDocumentFlow), so server rendering only shows the provisional layout.
test("el preview respeta visibilidad con contenido abundante", () => {
  const manyBlocks = Array.from(
    { length: 8 },
    (_, index) => block(`block-${index}`, `Bloque ${index}`, "x".repeat(240)),
  );
  manyBlocks.push({ ...block("hidden", "NO DEBE VERSE"), enabled: false });
  const html = renderToStaticMarkup(createElement(DatosPreview, {
    header: createElement("header", null, "Encabezado repetible"),
    section: { ...section, blocks: manyBlocks },
  }));

  assert.ok((html.match(/data-document-page=/g) ?? []).length >= 1);
  assert.match(html, /Encabezado repetible/);
  for (let index = 0; index < 8; index += 1) {
    assert.match(html, new RegExp(`Bloque ${index}`));
  }
  assert.doesNotMatch(html, /NO DEBE VERSE/);
});

test("el preview vacío muestra solo un placeholder discreto", () => {
  const html = renderToStaticMarkup(createElement(DatosPreview, {
    header: createElement("header", null, "Encabezado"),
    section: { ...section, blocks: [] },
  }));

  assert.match(html, /No se proporcionó/);
  assert.doesNotMatch(html, /Datos generales desde la sección/);
  assert.doesNotMatch(html, /DATOS GENERALES/);
});

test("la cinta principal cambia únicamente con el título editable del bloque", () => {
  const original = renderToStaticMarkup(createElement(DatosPreview, {
    header: createElement("header", null, "Encabezado"),
    section: { ...section, blocks: [block("editable", "II. Datos generales")] },
  }));
  const renamed = renderToStaticMarkup(createElement(DatosPreview, {
    header: createElement("header", null, "Encabezado"),
    section: { ...section, blocks: [block("editable", "Nombre cambiado por el usuario")] },
  }));

  assert.match(original, /I\. Datos generales/);
  assert.doesNotMatch(original, /I\. II\. Datos generales/);
  assert.doesNotMatch(renamed, /II\. Datos generales/);
  assert.match(renamed, /I\. Nombre cambiado por el usuario/);
});

test("la numeración romana sigue el orden visible de los bloques", () => {
  const first = { ...block("datos", "Datos generales"), sectionLabel: "II" };
  const second = { ...block("zona", "Características urbanas"), sectionLabel: "I" };
  const hidden = { ...block("hidden", "Oculto"), enabled: false };
  const html = renderToStaticMarkup(createElement(DatosPreview, {
    header: createElement("header", null, "Encabezado"),
    section: { ...section, blocks: [second, hidden, first] },
  }));

  assert.match(html, /I\. Características urbanas/);
  assert.match(html, /II\. Datos generales/);
  assert.doesNotMatch(html, /Oculto/);
});

test("el formato romano limpia únicamente prefijos romanos canónicos en display", () => {
  assert.equal(toRomanNumeral(14), "XIV");
  assert.equal(stripLeadingRomanNumeral("I. Datos generales"), "Datos generales");
  assert.equal(stripLeadingRomanNumeral("IIV. Título literal"), "IIV. Título literal");
  assert.equal(formatDatosBlockTitle("I. Datos generales", 2), "II. Datos generales");
  assert.equal(formatDocumentBlockTitle("III.", "II. Info terreno"), "III. Info terreno");
});

test("ReportPreview reconoce el identificador actual datosGenerales", () => {
  const html = renderToStaticMarkup(createElement(ReportPreview, {
    caratula,
    companyName: "Empresa",
    meta: {
      folio: "",
      client: "",
      postalCode: "",
      location: "",
      valuationKind: "venta",
      propertyKind: "casa",
    },
    section: { ...section, id: "datosGenerales", blocks: [] },
    comparables: [],
    principalCoverImage: null,
  }));

  assert.match(html, /No se proporcionó/);
  assert.doesNotMatch(html, /Datos generales desde la sección/);
  assert.match(html, /data-document-preview-header="true"/);
  assert.match(html, /sm:grid-cols-\[190px_minmax\(0,1fr\)\]/);
  assert.match(html, /h-24/);
  assert.match(html, /bg-\[var\(--caratula-dark-blue\)\][^>]*>DICTAMEN VALUATORIO/);
  assert.match(html, /px-5 pb-10 pt-3 sm:px-8/);
});
