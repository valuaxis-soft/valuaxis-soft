import assert from "node:assert/strict";
import test from "node:test";

import { verifyListingExtraction } from "../src/features/ai/listing-extraction";
import { listingRows } from "../src/features/ai/listing-prefill";
import { assumptionsDraftData, draftFactsFor, draftFactsOf, draftTablesFor, ownFieldFacts } from "../src/features/valuations/services/draft-facts";
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
  // The location goes by parts, as the card captures it; the line the dictamen prints is built from them.
  assert.deepEqual(row(rows, "municipality"), { field: "municipality", label: "Municipio o alcaldía", value: "Arandas", evidence: "Arandas" });
  assert.deepEqual(row(rows, "state"), { field: "state", label: "Estado", value: "Jalisco", evidence: "Jalisco" });
  // A land has no field for its construction: it goes to «Observaciones», as written.
  assert.equal(row(rows, "notes")?.value, "Construcción: 90 m2.");
  assert.equal(row(rows, "notes")?.evidence, "90 m2");
  assert.equal(row(rows, "bedrooms"), undefined);
  // The source comes from the link when the text names no portal.
  assert.deepEqual(row(rows, "sourceName"), { field: "sourceName", label: "Fuente", value: "lamudi.com.mx", evidence: "https://www.lamudi.com.mx/predio-123" });
  // What the listing does not say stays empty, with no evidence.
  assert.deepEqual(row(rows, "frontage"), { field: "frontage", label: "Frente (m)", value: "", evidence: null });
  assert.deepEqual(row(rows, "contactName"), { field: "contactName", label: "Contacto", value: "", evidence: null });
  assert.deepEqual(notices, [
    "Tipo de inmueble según el anuncio: «predio rústico».",
    "El anuncio también indica superficie construida («90 m2»): un terreno no tiene campo para ella y va en Observaciones.",
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
  assert.equal(row(rows, "municipality")?.value, "Arandas");
  assert.equal(row(rows, "neighborhood")?.value, "", "the same place is not written twice");
});

test("a built comparable takes the built surface, and a sale listing among rents is pointed out", () => {
  const { rows, notices } = listingRows(proposal, "INMUEBLE_RENTA", "Renta mensual ($)");
  assert.deepEqual(row(rows, "area"), { field: "area", label: "Superficie rentable (m²)", value: "90", evidence: "90 m2", note: undefined });
  // The land of a building has its own field now, converted from hectares with its notice.
  assert.equal(row(rows, "landArea")?.value, "125000");
  assert.match(row(rows, "landArea")?.note ?? "", /12\.5 ha; se convirtió a m²/);
  assert.equal(row(rows, "constructionType")?.value, "predio rústico");
  assert.ok(notices.includes("El anuncio es de venta («Venta de predio rústico») y estás capturando comparables en renta."));
});

const HOME = `Casa en venta, Fraccionamiento Valle Inventado, Av. Ficticia 245, C.P. 47600, Villa Ejemplo, Jalisco.
3 recámaras, 2 baños completos y 1 medio baño, 2 cajones de estacionamiento, 2 plantas, 12 años de antigüedad, en buen estado.
Terreno 160 m2, construcción 185 m2. Forma regular, 1 frente. Zona habitacional.
Amenidades: jardín, cocina integral, cuarto de servicio. Orientación norte. Vigilancia 24 horas.
$2,350,000. ID: EB-XX0001. Gran oportunidad de inversión.`;

test("everything the listing publishes lands in its field of the card; the rest goes to the observations, as written", () => {
  const read = verifyListingExtraction(HOME, null, {
    ...EMPTY_EXTRACTION,
    operation: "venta", operationEvidence: "Casa en venta", price: "$2,350,000", landArea: "Terreno 160 m2", builtArea: "construcción 185 m2",
    street: "Av. Ficticia", streetNumber: "245", subdivision: "Fraccionamiento Valle Inventado", municipality: "Villa Ejemplo", state: "Jalisco",
    postalCode: "C.P. 47600", propertyType: "Casa", bedrooms: "3 recámaras", bathrooms: "2 baños completos", halfBaths: "1 medio baño",
    parking: "2 cajones de estacionamiento", levels: "2 plantas", age: "12 años de antigüedad", conservation: "en buen estado",
    frontCount: "1 frente", shape: "Forma regular", zone: "Zona habitacional", publicationId: "ID: EB-XX0001",
    amenities: ["jardín", "cocina integral", "cuarto de servicio", "alberca"],
    otherFacts: ["Orientación norte", "Vigilancia 24 horas"],
  });
  // Not in the text: dropped, like any other field.
  assert.ok(read.discarded.includes("amenities"));
  assert.deepEqual(read.bedrooms, { value: 3, evidence: "3 recámaras" });
  assert.deepEqual(read.age, { value: 12, evidence: "12 años de antigüedad" });
  assert.deepEqual(read.postalCode, { value: "47600", evidence: "C.P. 47600" });
  assert.deepEqual(read.publicationId, { value: "EB-XX0001", evidence: "ID: EB-XX0001" });

  const { rows } = listingRows(read, "INMUEBLE_VENTA", "Precio de oferta ($)");
  const values = Object.fromEntries(rows.filter((item) => item.value).map((item) => [item.field, item.value]));
  assert.deepEqual(values, {
    state: "Jalisco", municipality: "Villa Ejemplo", postalCode: "47600", subdivision: "Fraccionamiento Valle Inventado", street: "Av. Ficticia", number: "245",
    price: "2350000", area: "185", landArea: "160", constructionType: "Casa", bedrooms: "3", bathrooms: "2.5", parking: "2", levels: "2", age: "12",
    conservation: "en buen estado", frontCount: "1", shape: "Forma regular", zone: "Zona habitacional",
    notes: "Amenidades: jardín, cocina integral, cuarto de servicio. Orientación norte. Vigilancia 24 horas.",
    publicationId: "EB-XX0001",
  });
  assert.match(row(rows, "bathrooms")?.note ?? "", /2 baños y 1 medio baño: cada medio baño se captura como 0\.5/);
  // A sales phrase is not a fact of the property: the model is told so, and nothing the code adds says it.
  assert.doesNotMatch(row(rows, "notes")?.value ?? "", /oportunidad/i);
});

const LOT = "Terreno en venta en Calle Hidalgo 245, Col. Centro, Arandas, Jalisco, C.P. 47180. Precio: $1,850,000 MXN. "
  + "Superficie de terreno: 320 m2, frente de 10 m. Uso de suelo habitacional mixto. Servicios: agua, luz y drenaje. Estado: excelente. "
  + "Contacto: Inmobiliaria Ejemplo, tel. 33 1234 5678. Publicación No. 998877. Amenidades: cerca de la plaza y escuelas.";
const LOT_ANSWER = {
  ...EMPTY_EXTRACTION,
  operation: "venta" as const, operationEvidence: "Terreno en venta", price: "$1,850,000 MXN", landArea: "320 m2", frontage: "frente de 10 m",
  street: "Calle Hidalgo", streetNumber: "245", neighborhood: "Col. Centro", municipality: "Arandas", state: "Jalisco", postalCode: "C.P. 47180",
  propertyType: "Terreno", landUse: "habitacional mixto", services: "agua, luz y drenaje", conservation: "excelente",
  contactName: "Inmobiliaria Ejemplo", contactPhone: "tel. 33 1234 5678", publicationId: "Publicación No. 998877",
  otherFacts: ["cerca de la plaza y escuelas"],
};

test("a pasted lot: its colonia without «Col.», its publication number, its phone, and the leftovers labeled in the observations", () => {
  const read = verifyListingExtraction(LOT, null, LOT_ANSWER);
  // Nothing the listing says is lost: «Publicación No.» and «tel.» are labels, not reasons to discard the datum.
  assert.deepEqual(read.discarded, []);
  assert.deepEqual(read.publicationId, { value: "998877", evidence: "Publicación No. 998877" });
  assert.equal(read.contactPhone?.value, "33 1234 5678");

  const { rows } = listingRows(read, "TERRENO_VENTA", "Precio de oferta ($)");
  assert.equal(row(rows, "neighborhood")?.value, "Centro", "the dictamen prints its own «col.»");
  assert.equal(row(rows, "neighborhood")?.evidence, "Col. Centro");
  assert.equal(row(rows, "publicationId")?.value, "998877");
  assert.equal(row(rows, "contactPhone")?.value, "33 1234 5678");
  // A land has no field for its condition: it goes to the observations with the label the listing gives it, as does any other fact.
  assert.equal(row(rows, "notes")?.value, "Estado: excelente. Amenidades: cerca de la plaza y escuelas.");

  // The same fact as an «other fact» keeps its label too.
  const asFact = verifyListingExtraction(LOT, null, { ...LOT_ANSWER, conservation: "", otherFacts: ["excelente", "cerca de la plaza y escuelas"] });
  assert.equal(row(listingRows(asFact, "TERRENO_VENTA", "Precio de oferta ($)").rows, "notes")?.value, "Estado: excelente. Amenidades: cerca de la plaza y escuelas.");

  // A building has a field for its condition: it goes there, as written.
  const built = listingRows(read, "INMUEBLE_VENTA", "Precio de oferta ($)").rows;
  assert.equal(row(built, "conservation")?.value, "excelente");
  assert.equal(row(built, "notes")?.value, "Amenidades: cerca de la plaza y escuelas.");

  // Without a label in the text, the observations name what the fragment is.
  const bare = verifyListingExtraction("Terreno en venta en buen sitio, excelente, 320 m2.", null, { ...EMPTY_EXTRACTION, conservation: "excelente" });
  assert.equal(row(listingRows(bare, "TERRENO_VENTA", "Precio de oferta ($)").rows, "notes")?.value, "Conservación: excelente.");
});

test("an id or a phone the listing does not write is never filled", () => {
  const read = verifyListingExtraction(LOT, null, { ...LOT_ANSWER, publicationId: "Publicación No. 112233", contactPhone: "tel. 33 9999 0000" });
  assert.equal(read.publicationId, null);
  assert.equal(read.contactPhone, null);
  assert.ok(read.discarded.includes("publicationId") && read.discarded.includes("contactPhone"));
});

test("counts are read in code: a year of construction is not an age, and a bare half bathroom is half", () => {
  const text = "Casa construida en 1998, medio baño en planta baja, dos recámaras.";
  const read = verifyListingExtraction(text, null, {
    ...EMPTY_EXTRACTION, age: "construida en 1998", halfBaths: "medio baño", bedrooms: "dos recámaras",
  });
  assert.equal(read.age, null);
  assert.ok(read.discarded.includes("age"));
  assert.deepEqual(read.bedrooms, { value: 2, evidence: "dos recámaras" });
  // «medio baño» without a number is one half bathroom: 0.5, with its note.
  assert.deepEqual(read.halfBaths, { value: 1, evidence: "medio baño" });
  const { rows } = listingRows(read, "INMUEBLE_VENTA", "Precio de oferta ($)");
  assert.equal(row(rows, "bathrooms")?.value, "0.5");
  // On a land, the rooms the listing names go to «Observaciones», as written.
  const land = listingRows(read, "TERRENO_VENTA", "Precio de oferta ($)").rows;
  assert.equal(row(land, "notes")?.value, "dos recámaras. medio baño.");
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

test("a field's own draft reads only its text; the apartado summary reads every concept", () => {
  const field = { id: "d", label: "Descripción", value: "Casa de <b>dos</b> niveles", enabled: true };
  const other = { id: "u", label: "Uso", value: "Habitacional", enabled: true };
  assert.deepEqual(ownFieldFacts(field, [field, other]), [{ label: "Descripción", value: "Casa de dos niveles" }]);
  assert.deepEqual(ownFieldFacts({ ...field, label: "", type: "paragraph" }, [field, other]), [{ label: "Texto", value: "Casa de dos niveles" }], "a paragraph has no label");
  assert.deepEqual(ownFieldFacts({ ...field, value: "  " }, [field, other]), [], "nothing written, nothing to draft from");
  assert.deepEqual(draftFactsOf([field, other], [field, other]), [
    { label: "Descripción", value: "Casa de dos niveles" },
    { label: "Uso", value: "Habitacional" },
  ]);
});
