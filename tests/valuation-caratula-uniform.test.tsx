import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SectionDocument } from "../src/features/valuations/components/report-preview";
import { ApproachValues } from "../src/features/valuations/components/calculation/conclusion-panel";
import { CaratulaSignaturesModule } from "../src/features/valuations/components/caratula-preview-modules";
import { DictamenToolbar } from "../src/features/valuations/components/dictamen/valuation-dictamen";
import { ConceptEditorList } from "../src/features/valuations/components/editor/concept-editor";
import { ValuationDateDropdown } from "../src/features/valuations/components/editor/valuation-date-field";
import {
  CARATULA_CONCLUSION_DELETE_REASON,
  blockToolbarState,
} from "../src/features/valuations/components/editor/block-toolbar";
import { buildSectionsPayload } from "../src/features/valuations/components/workspace/model/save-payload";
import type { AppSection, Block, CaratulaFormData, Letterhead } from "../src/features/valuations/model";
import { hydrateSectionMetadata } from "../src/features/valuations/metadata";
import { createInitialSections } from "../src/features/valuations/sections";
import {
  primaryCaratulaConclusionId,
  withCaratulaBlockAdded,
  withCaratulaFreeBlockOrder,
} from "../src/features/valuations/services/caratula-blocks";
import { COMPANY_HEADER_BLOCK_ID } from "../src/features/valuations/services/caratula-company-header";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

const caratula: CaratulaFormData = {
  tituloInmueble: "Casa de prueba",
  numeroAvaluo: "PRB-0001",
  folio: "PRB-0001",
  direccionEmpresa: "",
  telefonoEmpresa: "",
  correoEmpresa: "",
  solicitante: "",
  propietario: "",
  objeto: "",
  proposito: "",
  firmas: [{ name: "M. en Val. Ing. Nombre Inventado Muy Largo de Prueba", cedula: "1234567", role: "" }],
  valorTotal: "1500000",
  valorConLetra: "UN MILLÓN QUINIENTOS MIL PESOS 00/100 M.N.",
  fechaAvaluo: "2026-11-12",
  mesesVigencia: 6,
  fechaVigencia: "",
};
const meta = { folio: "PRB-0001", client: "", postalCode: "", location: "", valuationKind: "venta", propertyKind: "casa" } as const;
const letterhead: Letterhead = { name: "Despacho de prueba", legalName: null, rfc: null, address: null, phone: null, email: null, logoUrl: null };

const templateCaratula = () => createInitialSections().find((section) => section.id === "caratula")!;

function printCaratula(section: AppSection) {
  return renderToStaticMarkup(
    <SectionDocument caratula={caratula} letterhead={letterhead} meta={meta} principalCoverImage={null} section={section} />,
  );
}

const positionOf = (html: string, text: string) => {
  const index = html.indexOf(text);
  assert.ok(index >= 0, `«${text}» is printed`);
  return index;
};

const block = (id: string, title: string, extra: Partial<Block> = {}): Block => ({
  id,
  title,
  sectionLabel: "",
  enabled: true,
  required: false,
  concepts: [],
  apartados: [],
  tables: [],
  images: [],
  ...extra,
});

/* ------------------------------------------------------------------ */
/*  Printed carátula                                                   */
/* ------------------------------------------------------------------ */

test("the carátula prints the title of each of its blocks (videos 5.2 and 5.6: «DATOS DEL BIEN» was missing)", () => {
  const html = printCaratula(templateCaratula());
  const titles = [...html.matchAll(/data-caratula-block-title="true">([^<]+)</g)].map((match) => match[1]);
  assert.deepEqual(titles, [
    "DATOS DEL BIEN",
    "DATOS DEL SOLICITANTE",
    "CARACTERISTICAS",
    "DATOS DEL AVALUO",
    "SUPUESTOS Y CONDICIONES LIMITANTES QUE INFLUYEN EN EL VALOR DICTAMINADO",
    "CONCLUSIÓN",
  ]);
});

test("the carátula prints its blocks in the editor's order, and the commercial value follows its conclusion wherever it goes (video 5.5)", () => {
  const section = templateCaratula();
  const conclusion = section.blocks.find((item) => item.id === "caratula-block-6-conclusion")!;
  const reordered = { ...section, blocks: [section.blocks[0], conclusion, ...section.blocks.slice(1).filter((item) => item !== conclusion)] };
  const html = printCaratula(reordered);
  assert.ok(positionOf(html, "CONCLUSIÓN") < positionOf(html, "DATOS DEL BIEN"));
  assert.ok(positionOf(html, "UN MILLÓN QUINIENTOS MIL PESOS") < positionOf(html, "DATOS DEL BIEN"), "the value prints with its conclusion");
  assert.equal(html.split("UN MILLÓN QUINIENTOS MIL PESOS").length - 1, 1, "once");
});

test("a duplicated conclusion does not print the commercial value twice, and a subbloque of the assumptions prints", () => {
  const section = templateCaratula();
  const conclusion = section.blocks.find((item) => item.id === "caratula-block-6-conclusion")!;
  const assumptions = section.blocks.find((item) => item.id.includes("supuestos"))!;
  const withSub = {
    ...assumptions,
    apartados: [{ id: "sub-1", title: "LIMITACIONES ADICIONALES", enabled: true, concepts: [{ id: "sub-c", label: "Alcance", value: "Solo el terreno de prueba", enabled: true }], images: [], tables: [] }],
  };
  const html = printCaratula({
    ...section,
    blocks: section.blocks.map((item) => (item === assumptions ? withSub : item)).concat({ ...conclusion, id: "copia-conclusion" }),
  });
  assert.equal(html.split("UN MILLÓN QUINIENTOS MIL PESOS").length - 1, 1);
  assert.ok(positionOf(html, "LIMITACIONES ADICIONALES") < positionOf(html, "Solo el terreno de prueba"));
});

test("with its conclusion hidden, the carátula still prints the commercial value, as before", () => {
  const section = templateCaratula();
  const html = printCaratula({ ...section, blocks: section.blocks.map((item) => (item.id === "caratula-block-6-conclusion" ? { ...item, enabled: false } : item)) });
  assert.equal(html.split("UN MILLÓN QUINIENTOS MIL PESOS").length - 1, 1);
});

test("the signature's name keeps one line, centred on its line (video 6.1)", () => {
  const html = renderToStaticMarkup(createElement(CaratulaSignaturesModule, { caratula }));
  assert.match(html, /<div class="flex justify-center"><p class="whitespace-nowrap[^"]*" data-signature-name="true">M\. en Val\. Ing\. Nombre Inventado/);
  assert.doesNotMatch(html, /break-words[^"]*font-bold/);
});

/* ------------------------------------------------------------------ */
/*  Order of a carátula saved before the change                         */
/* ------------------------------------------------------------------ */

test("a carátula saved before its blocks moved freely prints as it did: its own blocks first, then the assumptions and the conclusion", () => {
  const header = block(COMPANY_HEADER_BLOCK_ID, "ENCABEZADO");
  const datos = block("caratula-block-1-datos-del-inmueble", "DATOS DEL BIEN");
  const supuestos = block("caratula-block-5-supuestos", "SUPUESTOS");
  const conclusion = block("caratula-block-6-conclusion", "CONCLUSION");
  const added = block("propio", "DATOS ADICIONALES");
  const legacy: Pick<AppSection, "id" | "freeBlockOrder" | "blocks"> = { id: "caratula", blocks: [header, datos, supuestos, conclusion, added] };

  const once = withCaratulaFreeBlockOrder(legacy);
  assert.deepEqual(once.blocks.map((item) => item.id), [COMPANY_HEADER_BLOCK_ID, datos.id, added.id, supuestos.id, conclusion.id]);
  assert.equal(once.freeBlockOrder, true);

  // From then on the appraiser's order is kept.
  const chosen = { ...once, blocks: [header, conclusion, datos, added, supuestos] };
  assert.equal(withCaratulaFreeBlockOrder(chosen), chosen);
  // Other sections are left as they are.
  const other: Pick<AppSection, "id" | "freeBlockOrder" | "blocks"> = { id: "terreno", blocks: [conclusion, datos] };
  assert.equal(withCaratulaFreeBlockOrder(other), other);
});

test("the choice is saved with the carátula and read back", () => {
  const section = { ...templateCaratula(), freeBlockOrder: true };
  const [saved] = buildSectionsPayload([section]);
  assert.equal(saved.freeBlockOrder, true);
  assert.equal(hydrateSectionMetadata(saved).freeBlockOrder, true);
  assert.equal(hydrateSectionMetadata({}).freeBlockOrder, undefined);
});

test("a new block of the carátula goes before the assumptions and the conclusion", () => {
  const blocks = [block(COMPANY_HEADER_BLOCK_ID, ""), block("a", "DATOS"), block("s", "SUPUESTOS"), block("c", "CONCLUSIÓN")];
  assert.deepEqual(withCaratulaBlockAdded(blocks, block("nuevo", "")).map((item) => item.id), [COMPANY_HEADER_BLOCK_ID, "a", "nuevo", "s", "c"]);
  assert.deepEqual(withCaratulaBlockAdded([block("a", "DATOS")], block("nuevo", "")).map((item) => item.id), ["a", "nuevo"]);
  assert.equal(primaryCaratulaConclusionId(blocks), "c");
});

/* ------------------------------------------------------------------ */
/*  Editor                                                             */
/* ------------------------------------------------------------------ */

test("every block of the carátula has the same controls; only its only conclusion is not deleted, and says why (videos 5.5 and 5.6)", () => {
  const state = blockToolbarState({ kind: "caratula-block" });
  for (const control of ["transfer", "move", "visibility", "alignment", "add", "subblock", "delete"] as const) {
    assert.equal(state[control].enabled, true, control);
  }
  const conclusion = blockToolbarState({ kind: "caratula-block", deleteLock: CARATULA_CONCLUSION_DELETE_REASON });
  assert.equal(conclusion.delete.enabled, false);
  assert.match(conclusion.delete.reason ?? "", /valor comercial/);
  assert.equal(conclusion.move.enabled && conclusion.add.enabled && conclusion.subblock.enabled, true);
});

test("a concept's title is bold in the editor, as it prints (video 6.1)", () => {
  const html = renderToStaticMarkup(
    createElement(ConceptEditorList, {
      concepts: [{ id: "c1", label: "Calle", value: "Av. Inventada", enabled: true }],
      onRemove: () => {},
      onUpdate: () => {},
      readOnly: false,
    }),
  );
  const title = /<input[^>]*data-concept-title="true"[^>]*class="([^"]*)"[^>]*value="Calle"/.exec(html);
  assert.match(title?.[1] ?? "", /\bfont-semibold\b/);
  const value = /<input[^>]*class="([^"]*)"[^>]*value="Av\. Inventada"/.exec(html);
  assert.doesNotMatch(value?.[1] ?? "", /font-semibold/, "the value keeps its weight");
});

test("the month and year of the calendar sit over its arrows, so a click opens them (video 5.6, 10:29)", () => {
  const html = renderToStaticMarkup(
    createElement(ValuationDateDropdown, {
      options: [{ value: 0, label: "0", disabled: false }, { value: 1, label: "1", disabled: false }],
      value: 0,
      onChange: () => {},
      "aria-label": "Mes",
    } as Parameters<typeof ValuationDateDropdown>[0]),
  );
  assert.match(html, /aria-label="Mes"[^>]*class="[^"]*\brelative z-10\b/);
});

test("the dictamen's title keeps a readable width and its buttons wrap below it (video 5.3)", () => {
  const html = renderToStaticMarkup(
    <DictamenToolbar backHref="/workspace?id=1" folio="PRB-0001"><button>Imprimir</button></DictamenToolbar>,
  );
  assert.match(html, /class="min-w-64 flex-1" data-dictamen-title="true"/);
  assert.match(html, /class="flex flex-wrap items-center gap-2" data-dictamen-actions="true"><button>Imprimir<\/button>/);
});

test("an approach without a value says why next to «No aplica» (UNI-02)", () => {
  const calculation = {
    values: { costos: 1_200_000, mercado: null, ingresos: null },
    marketSource: null,
    excluded: ["ingresos"],
  } as unknown as Parameters<typeof ApproachValues>[0]["calculation"];
  const html = renderToStaticMarkup(<ApproachValues calculation={calculation} />);
  assert.match(html, /No aplica<\/dd><dd[^>]*data-approach-unavailable="mercado">Aún no hay valor de mercado: calcula el mercado/);
  assert.doesNotMatch(html, /data-approach-unavailable="costos"/, "a value needs no reason");
  assert.doesNotMatch(html, /data-approach-unavailable="ingresos"/, "left out of the report says so itself");
});
