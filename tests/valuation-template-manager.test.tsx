/**
 * The "Plantillas" page's list: what each template brings, who saved it and
 * when, and the actions; "Crear avalúo con esta plantilla" only for those who
 * create valuations.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TemplateManager } from "../src/features/valuations/components/template-manager";
import { printableTemplateSections } from "../src/features/valuations/components/template-preview-dialog";
import type { AppSection, Letterhead } from "../src/features/valuations/model";
import type { ValuationTemplateSummary } from "../src/features/valuations/services/valuation-template.service";

const letterhead: Letterhead = { name: "Valuadores de los Altos", legalName: null, rfc: null, address: null, phone: null, email: null, logoUrl: null };

const template = (overrides: Partial<ValuationTemplateSummary>): ValuationTemplateSummary => ({
  id: "6f1c2b0e-8d4a-4c1e-9f3b-2a5d7e9c1b40",
  name: "Casa habitación",
  description: null,
  includeData: false,
  includeImages: false,
  sections: 1,
  blocks: 3,
  version: 1,
  createdAt: "2026-10-16T18:00:00.000Z",
  createdBy: "Ana López",
  updatedAt: "2026-10-16T18:00:00.000Z",
  versionBy: "Ana López",
  ...overrides,
});

const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

test("each template shows its sections, blocks, what it includes, its version and who saved it", () => {
  const markup = renderToStaticMarkup(createElement(TemplateManager, {
    canCreate: true,
    letterhead,
    initialTemplates: [
      template({}),
      template({
        id: "0b9e4f6a-1c2d-4e3f-8a7b-6c5d4e3f2a1b",
        name: "Terreno",
        description: "Lotes urbanos",
        includeData: true,
        includeImages: true,
        sections: 4,
        version: 2,
        updatedAt: "2026-10-20T18:00:00.000Z",
        versionBy: "Luis Pérez",
      }),
    ],
  }));
  const shown = text(markup);
  assert.match(shown, /1 Casa habitación Sin notas\. Agrégalas con «Editar nombre y notas»\. 1 sección 3 bloques Creada: 16 oct 2026 por Ana López/);
  assert.match(shown, /2 Terreno Lotes urbanos 4 secciones 3 bloques Con datos Con imágenes Versión 2/);
  assert.match(shown, /Actualizada: 20 oct 2026 · versión 2 de Luis Pérez/);
  assert.doesNotMatch(shown, /Casa habitación.*Con datos.*Terreno/, "a template without data says nothing about it");
  assert.equal(markup.match(/Editar nombre y notas<\/button>/g)?.length, 2);
  assert.equal(markup.match(/Vista previa/g)?.length, 2);
  assert.ok(markup.includes('data-template-number="2"'), "templates are numbered");
  assert.equal(markup.match(/Eliminar/g)?.length, 2);
  assert.ok(markup.includes('href="/workspace?action=new&amp;plantilla=6f1c2b0e-8d4a-4c1e-9f3b-2a5d7e9c1b40"'));
});

test("without AVALUO_CREAR there is no link to create a valuation; without templates, how to save one", () => {
  const readOnly = renderToStaticMarkup(createElement(TemplateManager, { canCreate: false, letterhead, initialTemplates: [template({})] }));
  assert.ok(!readOnly.includes("Crear avalúo con esta plantilla"));
  assert.ok(readOnly.includes("Editar nombre y notas"));
  assert.ok(readOnly.includes("Vista previa"), "previewing does not need AVALUO_CREAR");

  const empty = text(renderToStaticMarkup(createElement(TemplateManager, { canCreate: true, letterhead, initialTemplates: [] })));
  assert.match(empty, /El despacho aún no tiene plantillas\. Abre un avalúo y usa "Guardar como plantilla"/);
});

test("the preview walks through the sections that print: enabled and with blocks", () => {
  const section = (id: string, blocks: number, enabled = true) =>
    ({ id, label: "", title: id, sourceFile: "", enabled, required: false, blocks: Array.from({ length: blocks }, (_, index) => ({ id: `${id}-${index}` })) }) as unknown as AppSection;
  assert.deepEqual(printableTemplateSections([section("caratula", 1), section("vacia", 0), section("oculta", 2, false), section("terreno", 3)]).map((item) => item.id), ["caratula", "terreno"]);
});
