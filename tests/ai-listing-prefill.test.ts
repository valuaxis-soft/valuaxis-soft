import assert from "node:assert/strict";
import test from "node:test";

import { verifyListingExtraction } from "../src/features/ai/listing-extraction";
import { listingRows } from "../src/features/ai/listing-prefill";
import { assumptionsDraftData, draftFactsFor, draftTablesFor } from "../src/features/valuations/services/draft-facts";
import type { AppSection, Concept, TableContent } from "../src/features/valuations/model";
import { EMPTY_EXTRACTION } from "./support/fake-ai-gateway";

const RANCH = `Venta de predio rústico en Los Altos, municipio de Arandas, Jalisco.
Superficie: 12-50-00 has de agostadero, con casa de 90 m2. USD 150,000.
Ver https://www.lamudi.com.mx/predio-123.`;

const proposal = verifyListingExtraction(RANCH, null, {
  ...EMPTY_EXTRACTION,
  operation: "venta", operationEvidence: "Venta de predio rústico",
  price: "USD 150,000", landArea: "12-50-00 has", builtArea: "90 m2",
  municipality: "Arandas", state: "Jalisco", propertyType: "predio rústico",
});

const row = (rows: ReturnType<typeof listingRows>["rows"], field: string) => rows.find((item) => item.field === field);

test("a listing in hectares fills the form in m² and says so; dollars are never converted", () => {
  const { rows, notices } = listingRows(proposal, "TERRENO_VENTA", "Precio de oferta ($)");
  assert.deepEqual(row(rows, "area"), {
    field: "area", label: "Superficie de terreno (m²)", value: "125000", evidence: "12-50-00 has",
    note: "El anuncio dice 12.5 ha; se convirtió a m² (1 ha = 10,000 m²). Revísalo.",
  });
  const price = row(rows, "price");
  assert.equal(price?.value, "", "the form is in pesos");
  assert.equal(price?.evidence, "USD 150,000");
  assert.match(price?.note ?? "", /dólares.*no se convirtió/);
  assert.deepEqual(row(rows, "location"), { field: "location", label: "Ubicación", value: "Arandas, Jalisco", evidence: "Arandas · Jalisco" });
  // The source comes from the link when the text names no portal.
  assert.deepEqual(row(rows, "sourceName"), { field: "sourceName", label: "Fuente", value: "lamudi.com.mx", evidence: "https://www.lamudi.com.mx/predio-123" });
  // What the listing does not say stays empty, with no evidence.
  assert.deepEqual(row(rows, "frontage"), { field: "frontage", label: "Frente (m)", value: "", evidence: null });
  assert.deepEqual(row(rows, "contactName"), { field: "contactName", label: "Contacto", value: "", evidence: null });
  assert.deepEqual(notices, [
    "El anuncio también indica superficie construida («90 m2»); este comparable no tiene campo para ella.",
    "Tipo de inmueble según el anuncio: «predio rústico».",
  ]);
});

test("a price per hectare is shown but never used as the price of the offer, and a repeated place is written once", () => {
  const text = "terreno en vta!!! arandas jal. Superficie total de 12.5 hectáreas. Precio: 2.35 mdp por hectárea.";
  const messy = verifyListingExtraction(text, null, {
    ...EMPTY_EXTRACTION, operation: "venta", operationEvidence: "en vta", price: "2.35 mdp", landArea: "12.5 hectáreas", neighborhood: "arandas", municipality: "Arandas",
  });
  assert.deepEqual(messy.operation, { value: "venta", evidence: "en vta" });
  assert.deepEqual(messy.price, { amount: 2_350_000, currency: "MXN", per: "ha", evidence: "2.35 mdp" });
  const { rows } = listingRows(messy, "TERRENO_VENTA", "Precio de oferta ($)");
  assert.equal(row(rows, "price")?.value, "");
  assert.match(row(rows, "price")?.note ?? "", /por hectárea, no el de la oferta completa: no se calculó/);
  assert.equal(row(rows, "location")?.value, "arandas");
});

test("a built comparable takes the built surface, and a sale listing among rents is pointed out", () => {
  const { rows, notices } = listingRows(proposal, "INMUEBLE_RENTA", "Renta mensual ($)");
  assert.deepEqual(row(rows, "area"), { field: "area", label: "Superficie construida (m²)", value: "90", evidence: "90 m2", note: undefined });
  assert.ok(notices.includes("El anuncio es de venta («Venta de predio rústico») y estás capturando comparables en renta."));
});

test("a draft is written only from the other concepts of the same container that have something captured", () => {
  const concept = (id: string, label: string, value: string, extra: Partial<Concept> = {}): Concept => ({ id, label, value, enabled: true, ...extra });
  const container = [
    concept("a", "Uso actual:", "Casa habitación"),
    concept("b", "Superficie construida", "185", { type: "measurement", valueFormat: "m2" }),
    concept("c", "Edad", ""),
    concept("d", "Oculto", "no se imprime", { enabled: false }),
    concept("target", "Descripción general", "Texto previo", { type: "longText" }),
  ];
  const elsewhere = concept("z", "Valor comercial", "2350000", { type: "currency", valueFormat: "mxn" });
  assert.deepEqual(draftFactsFor(container[4], container, [...container, elsewhere]), [
    { label: "Uso actual", value: "Casa habitación" },
    { label: "Superficie construida", value: "185 m²" },
  ]);
});

test("the tables of the apartado travel whole and as printed, within the cap of cells", () => {
  const table = (id: string, title: string, columns: string[], rows: string[][], extra: Partial<TableContent> = {}): TableContent => ({ id, title, columns, rows, enabled: true, ...extra });
  const boundaries = table("t1", "Colindancias", ["Orientación", "Distancia"], [["Norte", "12.50 m"], ["", ""], ["Sur", " 12.50  m "]]);
  assert.deepEqual(draftTablesFor([boundaries, table("t2", "Oculta", ["A"], [["1"]], { enabled: false }), table("t3", "Vacía", ["A", "B"], [["", ""]])]), [
    { title: "Colindancias", columns: ["Orientación", "Distancia"], rows: [["Norte", "12.50 m"], ["Sur", "12.50 m"]] },
  ]);

  // 400 cells for all the tables together, headers included: a table that does not fit is left out whole, a later smaller one still goes.
  const big = (id: string, rows: number) => table(id, id, ["A", "B", "C", "D"], Array.from({ length: rows }, (_, index) => [String(index), "x", "y", "z"]));
  assert.deepEqual(draftTablesFor([big("uno", 60), big("dos", 60), boundaries]).map((item) => [item.title, item.rows.length]), [["uno", 60], ["Colindancias", 2]]);
  // A cell too long to draft from leaves its table out; no more than six tables.
  assert.deepEqual(draftTablesFor([table("largo", "Largo", ["A"], [["x".repeat(201)]]), boundaries]).map((item) => item.title), ["Colindancias"]);
  assert.equal(draftTablesFor(Array.from({ length: 8 }, (_, index) => table(`t${index}`, `T${index}`, ["A"], [["1"]]))).length, 6);
});

test("the carátula's assumptions are drafted only from the assumptions and limiting conditions of the considerations", () => {
  const concept = (id: string, label: string, value: string, enabled = true): Concept => ({ id, label, value, enabled });
  const container = (id: string, title: string, concepts: Concept[], enabled = true) => ({ id, title, enabled, concepts, tables: [], images: [] });
  const section = (id: string, apartados: ReturnType<typeof container>[], blockConcepts: Concept[] = []): AppSection => ({
    id, label: "", title: id, sourceFile: "", enabled: true, required: false,
    blocks: [{ ...container(`${id}-b`, "BLOQUE", blockConcepts), sectionLabel: "", required: false, apartados }],
  });
  const sections = [
    section("consideraciones", [
      container("general", "CONSIDERACIONES GENERALES", [concept("g1", "Criterio técnico", "Normas del INDAABIN")]),
      container("definiciones", "DEFINICIONES", [concept("d1", "Valor comercial", "Precio más probable…")]),
      container("supuestos", "COMENTARIOS GENERALES, SUPUESTOS Y CONDICIONES LIMITANTES DEL AVALÚO", [
        concept("comentario_01", "1", "No se verificaron gravámenes."),
        concept("comentario_02", "2", ""),
        concept("comentario_03", "3", "La superficie se tomó de la escritura.", false),
        concept("comentario_04", "4", "No existen condiciones hipotéticas."),
        concept("propio", "Supuestos especiales", "No hay supuestos especiales."),
      ]),
    ]),
    section("conclusiones", [], [concept("c1", "Valor concluido", "$980,000.00"), concept("c2", "Limitaciones", "Ninguna")]),
    section("costos", [container("otro", "SUPUESTOS DE COSTO", [concept("x1", "Otro", "No va")])]),
  ];
  assert.deepEqual(assumptionsDraftData(sections), {
    facts: [
      { label: "Comentario", value: "No se verificaron gravámenes." },
      { label: "Comentario", value: "No existen condiciones hipotéticas." },
      { label: "Supuestos especiales", value: "No hay supuestos especiales." },
    ],
    tables: [],
  });
  // Nothing of the conclusion, of the values or of other sections; a hidden considerations section gives nothing.
  assert.deepEqual(assumptionsDraftData(sections.map((item) => ({ ...item, enabled: item.id !== "consideraciones" }))), { facts: [], tables: [] });
});
