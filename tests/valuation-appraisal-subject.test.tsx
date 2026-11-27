/**
 * «Clase de avalúo» and «¿Qué se está valuando?» (voice notes of 24 Nov 2026):
 * the class and the essence of a valuation, the firm's own lists of them and
 * of «Tipo de avalúo», the machinery wordings of the printed document and
 * the machine's data of a comparable's card. Every name here is invented.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { resolveCustomUnits } from "../src/features/firm/custom-units";
import { addFirmListItemTo, firmListItemSchema, MAX_FIRM_LIST_ITEMS, removeFirmListItemFrom, resolveFirmLists, withUnits } from "../src/features/firm/firm-lists";
import type { ComparableCardDto } from "../src/features/valuations/calculation/comparable-card.service";
import { machineryCardRows, machineryDetailsOf, meterText } from "../src/features/valuations/calculation/comparable-machinery";
import { comparableValidity } from "../src/features/valuations/calculation/comparable-validity";
import { MACHINERY_PROPERTY_TYPE } from "../src/features/valuations/calculation/machinery-types";
import { comparableInputSchema } from "../src/features/valuations/calculation/market-schemas";
import { defaultCharacteristicFields, type ComparableDto } from "../src/features/valuations/calculation/market-types";
import { CaratulaConclusionModule, CaratulaCoverModule } from "../src/features/valuations/components/caratula-preview-modules";
import { ComparableCardView } from "../src/features/valuations/components/calculation/comparable-card-view";
import { ComparableSheetForm, type ComparableDialogProps } from "../src/features/valuations/components/calculation/comparable-dialog";
import { machineryDetailsFromDraft, machineryDraftOf } from "../src/features/valuations/components/calculation/comparable-machinery-fields";
import { propertyTypeIdFor, subjectOfPropertyType } from "../src/features/valuations/components/create-valuation-form";
import { subjectPatch } from "../src/features/valuations/components/editor/caratula-subject-fields";
import { DocumentPreviewHeader } from "../src/features/valuations/components/document-preview-header";
import type { CaratulaFormData, Letterhead, ValuationMeta } from "../src/features/valuations/model";
import { buildCanonicalValuationSections } from "../src/features/valuations/repositories/valuation.repository";
import { getInitialSectionTemplate } from "../src/features/valuations/sections";
import {
  essenceChoices,
  essenceOptions,
  ofTheEssence,
  propertyKindFor,
  readAppraisalSubject,
} from "../src/features/valuations/services/appraisal-subject";
import { appraisedGoodWording } from "../src/features/valuations/services/appraised-good-wording";
import { COMPANY_HEADER_BLOCK_ID } from "../src/features/valuations/services/caratula-company-header";
import { hydrateGeneralCaratulaTemplate } from "../src/features/valuations/services/general-valuation-template";
import {
  NEW_OWN_CHOICE,
  appraisalKindChoiceOf,
  appraisalKindChoices,
  appraisalKindOfChoice,
} from "../src/features/valuations/services/property-kinds";

const MACHINERY = MACHINERY_PROPERTY_TYPE.toLowerCase();

/* ------------------------------------------------------------------ */
/*  Class and essence                                                  */
/* ------------------------------------------------------------------ */

test("a valuation of before reads its class and essence from its «Tipo de bien»", () => {
  assert.deepEqual(readAppraisalSubject(null, "casa_habitacion"), { appraisalClass: "INMUEBLE", essence: "Casa habitación" });
  assert.deepEqual(readAppraisalSubject({}, "CASA"), { appraisalClass: "INMUEBLE", essence: "Casa habitación" }, "the old key and the case");
  // «Nave industrial o bodega, que se entiende que es lo mismo».
  assert.deepEqual(readAppraisalSubject({}, "industrial"), { appraisalClass: "INMUEBLE", essence: "Bodega / Nave industrial" });
  assert.deepEqual(readAppraisalSubject({}, "bodega"), { appraisalClass: "INMUEBLE", essence: "Bodega / Nave industrial" });
  assert.deepEqual(readAppraisalSubject({ tipoBienOtro: "Kiosco" }, "otro"), { appraisalClass: "INMUEBLE", essence: "Kiosco" }, "«Otro → ¿Cuál?» of PR #152");
  assert.deepEqual(readAppraisalSubject({}, MACHINERY), { appraisalClass: "MAQUINARIA", essence: "" }, "machinery of before had no essence");
});

test("the class and essence saved with the valuation win, except that machinery follows its «Tipo de bien»", () => {
  assert.deepEqual(readAppraisalSubject({ claseAvaluo: "MAQUINARIA", queSeValua: "Retroexcavadora" }, MACHINERY), { appraisalClass: "MAQUINARIA", essence: "Retroexcavadora" });
  assert.deepEqual(readAppraisalSubject({ claseAvaluo: "AGROPECUARIO", queSeValua: "Huerta de aguacate" }, "rural"), { appraisalClass: "AGROPECUARIO", essence: "Huerta de aguacate" });
  assert.equal(readAppraisalSubject({ claseAvaluo: "INMUEBLE", queSeValua: "Casa" }, MACHINERY).appraisalClass, "MAQUINARIA");
  assert.equal(readAppraisalSubject({ claseAvaluo: "MAQUINARIA" }, "terreno").appraisalClass, "INMUEBLE", "nothing becomes machinery but by its kind");
  assert.equal(readAppraisalSubject({ claseAvaluo: "NAVE" }, "terreno").appraisalClass, "INMUEBLE", "an unknown class is no class");
});

test("what is valued decides the catalog's «Tipo de bien», so the panels and sections keep working", () => {
  assert.equal(propertyKindFor("INMUEBLE", "Casa habitación"), "casa_habitacion");
  assert.equal(propertyKindFor("INMUEBLE", "casa HABITACION"), "casa_habitacion", "without case or accents");
  assert.equal(propertyKindFor("INMUEBLE", "Bodega / Nave industrial"), "bodega");
  assert.equal(propertyKindFor("INMUEBLE", "Hotel boutique"), "otro", "an essence of the firm's own is «Otro» with its name");
  assert.equal(propertyKindFor("MAQUINARIA", "Retroexcavadora"), MACHINERY);
  assert.equal(propertyKindFor("MAQUINARIA", "Grúa"), MACHINERY);
  assert.equal(propertyKindFor("AGROPECUARIO", "Cultivo"), "rural");
  assert.deepEqual(subjectPatch("INMUEBLE", "Hotel boutique"), { appraisalClass: "INMUEBLE", essence: "Hotel boutique", propertyKind: "otro", propertyKindOther: "Hotel boutique" });
  assert.deepEqual(subjectPatch("INMUEBLE", "Oficina"), { appraisalClass: "INMUEBLE", essence: "Oficina", propertyKind: "oficina", propertyKindOther: "" });
});

test("«¿Qué se está valuando?» proposes the common ones of the class, then the firm's own, once each", () => {
  const machinery = essenceOptions("MAQUINARIA", ["Grúa", "retroexcavadora", "  Tractor  "]);
  for (const name of ["Automóvil", "Camioneta", "Camión", "Motocicleta", "Retroexcavadora", "Maquinaria de construcción", "Maquinaria industrial", "Equipo", "Aeronave", "Embarcación"]) {
    assert.ok(machinery.includes(name), name);
  }
  assert.deepEqual(machinery.slice(-2), ["Grúa", "Tractor"], "«retroexcavadora» is the proposal already there");
  assert.deepEqual(essenceOptions("AGROPECUARIO", []), ["Cultivo", "Ganado", "Forestal"]);
  assert.ok(essenceOptions("INMUEBLE", []).includes("Departamento"));
  assert.ok(essenceOptions("INMUEBLE", [], "Kiosco").includes("Kiosco"), "the one a valuation has stays in its list");
  assert.equal(essenceChoices("INMUEBLE", []).at(-1)?.value, NEW_OWN_CHOICE, "and «Otro…» to type a new one");
});

test("the creation form maps a template's «Tipo de bien» to its class and essence, and back to the catalog's id", () => {
  const catalog = [
    { id: 1, key: "TERRENO", label: "Terreno" },
    { id: 2, key: "CASA_HABITACION", label: "Casa habitacion" },
    { id: 11, key: "OTRO", label: "Otro" },
    { id: 12, key: "MAQUINARIA_EQUIPO", label: "Maquinaria y equipo" },
  ];
  assert.deepEqual(subjectOfPropertyType(catalog, "12"), { appraisalClass: "MAQUINARIA", essence: "Automóvil" });
  assert.deepEqual(subjectOfPropertyType(catalog, "1"), { appraisalClass: "INMUEBLE", essence: "Terreno" });
  assert.deepEqual(subjectOfPropertyType(catalog, undefined), { appraisalClass: "INMUEBLE", essence: "Casa habitación" });
  assert.equal(propertyTypeIdFor(catalog, "MAQUINARIA", "Retroexcavadora"), 12);
  assert.equal(propertyTypeIdFor(catalog, "INMUEBLE", "Terreno"), 1);
  assert.equal(propertyTypeIdFor(catalog, "INMUEBLE", "Hotel boutique"), 11);
});

/* ------------------------------------------------------------------ */
/*  The firm's lists                                                   */
/* ------------------------------------------------------------------ */

test("a name typed and ticked joins the firm's list once, however it was written, beside the units", () => {
  const units = ["piezas", "lotes"];
  let stored: unknown[] = units;
  stored = addFirmListItemTo(stored, { list: "queSeValua", appraisalClass: "MAQUINARIA", name: "  Grúa   telescópica " }).stored;
  stored = addFirmListItemTo(stored, { list: "tipoAvaluo", name: "Catastral" }).stored;
  const again = addFirmListItemTo(stored, { list: "queSeValua", appraisalClass: "MAQUINARIA", name: "grua telescopica" });
  assert.equal(again.added, false, "the same name without accents or case");
  assert.equal(addFirmListItemTo(stored, { list: "queSeValua", appraisalClass: "INMUEBLE", name: "Grúa telescópica" }).added, true, "each class has its own list");

  assert.deepEqual(resolveFirmLists(stored), {
    essences: { INMUEBLE: [], MAQUINARIA: ["Grúa telescópica"], AGROPECUARIO: [] },
    appraisalKinds: ["Catastral"],
  });
  // The units read only their strings, and writing them keeps the lists.
  assert.deepEqual(resolveCustomUnits(stored), units);
  const renamed = withUnits(stored, ["piezas", "cabezas"]);
  assert.deepEqual(resolveCustomUnits(renamed), ["piezas", "cabezas"]);
  assert.deepEqual(resolveFirmLists(renamed), resolveFirmLists(stored));

  const removed = removeFirmListItemFrom(stored, { list: "tipoAvaluo", name: "CATASTRAL" });
  assert.equal(removed.removed, true);
  assert.deepEqual(resolveFirmLists(removed.stored).appraisalKinds, []);
  assert.deepEqual(resolveCustomUnits(removed.stored), units);
});

test("a full list makes room with its oldest name; malformed entries are left out", () => {
  let stored: unknown[] = [{ lista: "queSeValua", nombre: "Sin clase" }, { lista: "otra", nombre: "X" }, 7];
  for (let index = 0; index < MAX_FIRM_LIST_ITEMS + 1; index += 1) {
    stored = addFirmListItemTo(stored, { list: "queSeValua", appraisalClass: "MAQUINARIA", name: `Máquina ${index}` }).stored;
  }
  const lists = resolveFirmLists(stored);
  assert.equal(lists.essences.MAQUINARIA.length, MAX_FIRM_LIST_ITEMS);
  assert.equal(lists.essences.MAQUINARIA[0], "Máquina 1");
  assert.equal(firmListItemSchema.safeParse({ list: "queSeValua", name: "Grúa" }).success, false, "an essence needs its class");
  assert.equal(firmListItemSchema.safeParse({ list: "tipoAvaluo", name: "   " }).success, false);
});

test("«Tipo de avalúo» offers the catalog's, Catastral and the firm's own, and «Otro…» to type a new one", () => {
  const choices = appraisalKindChoices(["Arbitraje", "catastral"]);
  assert.deepEqual(choices.map((choice) => choice.label), ["Comercial", "Hipotecario", "Fiscal", "Judicial", "Catastral", "Arbitraje", "Otro… (escribir uno nuevo)"]);
  assert.deepEqual(appraisalKindOfChoice("own:Arbitraje"), { key: "otro", ownName: "Arbitraje" });
  assert.deepEqual(appraisalKindOfChoice(NEW_OWN_CHOICE, " Seguros "), { key: "otro", ownName: "Seguros" });
  assert.deepEqual(appraisalKindOfChoice("fiscal"), { key: "fiscal", ownName: "" });
  assert.equal(appraisalKindChoiceOf("OTRO", "Arbitraje"), "own:Arbitraje");
  assert.equal(appraisalKindChoiceOf("COMERCIAL", undefined), "comercial");
});

/* ------------------------------------------------------------------ */
/*  Machinery terminology in the printed document                      */
/* ------------------------------------------------------------------ */

const caratula = { tituloInmueble: "", valorTotal: "980000", valorConLetra: "(NOVECIENTOS OCHENTA MIL PESOS 00/100 M.N.)", firmas: [], fechaAvaluo: "", mesesVigencia: null, fechaVigencia: "" } as unknown as CaratulaFormData;
const letterhead: Letterhead = { name: "Empresa", legalName: null, rfc: null, address: null, phone: null, email: null, logoUrl: null };
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);

test("the value's title of a machinery valuation names what is valued; real estate keeps its own", () => {
  assert.equal(appraisedGoodWording(MACHINERY, "Retroexcavadora").commercialValueTitle, "VALOR COMERCIAL DE LA RETROEXCAVADORA");
  assert.equal(appraisedGoodWording(MACHINERY, "Automóvil").commercialValueTitle, "VALOR COMERCIAL DEL AUTOMÓVIL");
  assert.equal(appraisedGoodWording(MACHINERY, "Maquinaria de construcción").commercialValueTitle, "VALOR COMERCIAL DE LA MAQUINARIA DE CONSTRUCCIÓN");
  assert.equal(appraisedGoodWording(MACHINERY, "Grúa").commercialValueTitle, "VALOR COMERCIAL DE LA GRÚA", "a name of the firm's own ending in «a»");
  assert.equal(appraisedGoodWording(MACHINERY, "Tractor").commercialValueTitle, "VALOR COMERCIAL DEL TRACTOR");
  assert.equal(appraisedGoodWording(MACHINERY, "").commercialValueTitle, "VALOR COMERCIAL DEL BIEN", "without an essence, the MEH book's");
  assert.equal(appraisedGoodWording("casa_habitacion", "Casa habitación").commercialValueTitle, "VALOR COMERCIAL DEL INMUEBLE");
  assert.equal(ofTheEssence("Aeronave"), "de la aeronave");

  const meta = { location: "", propertyKind: MACHINERY, essence: "Retroexcavadora" } as ValuationMeta;
  const conclusion = textOf(renderToStaticMarkup(createElement(CaratulaConclusionModule, { blocks: [], caratula, meta })));
  assert.deepEqual(conclusion, ["CONCLUSIÓN", "VALOR COMERCIAL DE LA RETROEXCAVADORA", "$980,000.00 M.N.", "(NOVECIENTOS OCHENTA MIL PESOS 00/100 M.N.)"]);

  // The conclusion's template names it too, and the calculation still fills it by its key.
  const labels = buildCanonicalValuationSections([], MACHINERY, "Retroexcavadora").find((section) => section.label === "CONCLUSIONES")?.blocks[0].subBlocks.flatMap((apartado) => apartado.concepts);
  const concluded = labels?.find((concept) => concept.calculationKey === "conclusion:value");
  assert.equal(concluded?.label, "Valor comercial de la retroexcavadora");
});

test("a machinery carátula asks for the machine's data, not the street, the land or the levels (FAL-21), and never says «inmueble»", () => {
  const template = getInitialSectionTemplate("CARATULA", MACHINERY);
  assert.ok(template);
  const labels = template.blocks.flatMap((block) => block.concepts.map((concept) => concept.label));
  for (const realEstate of ["Calle", "Código postal", "Superficie total terreno", "Superficie total de construccion", "Numero de niveles", "Ejido o poblado"]) {
    assert.ok(!labels.includes(realEstate), realEstate);
  }
  for (const machine of ["Tipo de máquina / equipo", "Marca", "Modelo", "Número de serie", "Año de fabricación", "Capacidad / potencia", "Horas de uso (horómetro)", "Kilometraje (odómetro)", "Ubicación del bien"]) {
    assert.ok(labels.includes(machine), machine);
  }
  // Same applicant, valuation, assumptions and conclusion as the real estate carátula, with the same ids.
  const real = getInitialSectionTemplate("CARATULA", "casa_habitacion");
  const shared = (section: typeof template) => section.blocks.filter((block) => !block.id.includes("datos-del-") || block.id.includes("solicitante")).filter((block) => !block.id.includes("caracteristicas")).map((block) => block.id);
  assert.deepEqual(shared(template), shared(real!));
  assert.deepEqual(getInitialSectionTemplate("CARATULA", "casa_habitacion"), getInitialSectionTemplate("CARATULA"), "real estate is as before");

  // What is valued fills «Tipo de máquina / equipo».
  const hydrated = hydrateGeneralCaratulaTemplate(template, { essence: "Retroexcavadora", title: "Retroexcavadora Caterpillar 416E" });
  assert.equal(hydrated.blocks.flatMap((block) => block.concepts).find((concept) => concept.label === "Tipo de máquina / equipo")?.value, "Retroexcavadora");

  // Nothing of what prints for a machinery carátula says «inmueble».
  const meta = { location: "Guadalajara, Jalisco", propertyKind: MACHINERY, essence: "Retroexcavadora" } as ValuationMeta;
  const printed = [
    renderToStaticMarkup(createElement(DocumentPreviewHeader, { caratula, letterhead, propertyKind: MACHINERY })),
    renderToStaticMarkup(createElement(CaratulaCoverModule, { caratula, meta, principalImage: null })),
    renderToStaticMarkup(createElement(CaratulaConclusionModule, { blocks: [], caratula, meta })),
    // The letterhead's block feeds the header and the cover; its fields do not print as concepts.
    ...template.blocks.filter((block) => block.id !== COMPANY_HEADER_BLOCK_ID).flatMap((block) => [block.title, ...block.concepts.map((concept) => concept.label)]),
    ...(getInitialSectionTemplate("CONCLUSIONES", MACHINERY, "Retroexcavadora")?.blocks.flatMap((block) => [block.title, ...block.concepts.map((concept) => concept.label)]) ?? []),
  ].join("\n");
  assert.doesNotMatch(printed, /inmueble/i);
  assert.match(printed, /DICTAMEN VALUATORIO DE MAQUINARIA Y EQUIPO/);
});

/* ------------------------------------------------------------------ */
/*  Machinery comparable card                                          */
/* ------------------------------------------------------------------ */

const machineComparable = (extra: Partial<ComparableDto> = {}): ComparableDto => ({
  id: "comparable-maquina", reference: 1, location: "Zona industrial inventada, Guadalajara, Jalisco", area: null, price: 1_680_000, landUse: null,
  shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null, sourceName: "Portal de prueba",
  contactName: "Vendedor Inventado", contactPhone: null, url: null, offerDate: "2026-11-20", photos: [], factors: [],
  machinery: {
    brand: "Caterpillar", model: "420F", year: 2018, serial: "SERIE-PRUEBA-001", capacity: "101 HP (75 kW)", meterKind: "HOROMETRO",
    meterReading: 5480, condition: "Bueno", operatingState: "Activo", maintenance: "Preventivo", attachments: "Cucharón frontal y retro estándar",
    origin: "Estados Unidos", freight: 25_000,
  },
  ...extra,
});

test("the card of a machine shows its data instead of the land, the construction and the price per m²", () => {
  const card: ComparableCardDto = {
    comparable: machineComparable(), type: "INMUEBLE_VENTA", valuation: null, validity: comparableValidity("2026-11-01", "2026-11-12"), warnings: [], uses: [], history: [],
  };
  const html = renderToStaticMarkup(<ComparableCardView card={card} />);
  assert.match(html, /data-machinery-card/);
  for (const text of ["Datos de la máquina o equipo", "Caterpillar", "420F", "2018", "SERIE-PRUEBA-001", "101 HP (75 kW)", "Horómetro (horas)", "5,480 horas", "Cucharón frontal", "Estados Unidos", "Flete / costo de envío", "$25,000.00"]) {
    assert.ok(html.includes(text), text);
  }
  for (const realEstate of ["aria-label=\"Terreno\"", "aria-label=\"Construcción\"", "$/m²", "Superficie construida"]) {
    assert.ok(!html.includes(realEstate), realEstate);
  }
  // A real estate comparable is as before.
  const house = renderToStaticMarkup(<ComparableCardView card={{ ...card, comparable: machineComparable({ machinery: null, area: 180 }) }} />);
  assert.ok(house.includes("aria-label=\"Terreno\"") && !house.includes("data-machinery-card"));
  // The class says so even before a datum is captured.
  assert.match(renderToStaticMarkup(<ComparableCardView card={{ ...card, comparable: machineComparable({ machinery: null }) }} machinery />), /data-machinery-card/);
});

test("the odómetro reads in km; empty data are no data; the sheet asks for the machine's fields", () => {
  assert.equal(meterText({ meterKind: "ODOMETRO", meterReading: 2145 }), "2,145 km");
  assert.equal(meterText({ meterReading: 10 }), "10");
  assert.equal(machineryDetailsOf({ brand: " ", model: "" }), null);
  assert.equal(machineryDetailsOf({ brand: "", year: 2012 })?.year, 2012);
  assert.equal(machineryCardRows(null).find((row) => row.label === "Horómetro u odómetro")?.value, "—");

  const draft = machineryDraftOf(machineComparable().machinery);
  assert.deepEqual(machineryDetailsFromDraft(draft), { details: machineComparable().machinery });
  assert.deepEqual(machineryDetailsFromDraft({ ...draft, year: "18" }), { field: "machinery-year", error: "El año «18» va en cuatro dígitos, como 2018." });
  assert.deepEqual(machineryDetailsFromDraft({ ...draft, freight: "$25,000" }), { details: machineComparable().machinery }, "the freight as money");

  const props: ComparableDialogProps = {
    open: true, onOpenChange: () => undefined, comparable: machineComparable(), card: null, characteristicFields: defaultCharacteristicFields("INMUEBLE_VENTA"),
    comparableType: "INMUEBLE_VENTA", unitLabel: "Precio de oferta ($)", readOnly: false, onSubmit: async () => true,
    onUploadPhoto: async () => undefined, onRemovePhoto: async () => undefined, onUploadScreenshot: async () => undefined, onRemoveScreenshot: async () => undefined,
    onCheckDuplicates: async () => [], onReuse: async () => true,
  };
  const sheet = renderToStaticMarkup(<ComparableSheetForm {...props} />);
  assert.match(sheet, /data-machinery-fields/);
  assert.match(sheet, /id="machinery-brand"[^>]*value="Caterpillar"|value="Caterpillar"[^>]*id="machinery-brand"/);
  assert.ok(!sheet.includes('aria-label="Terreno"') && !sheet.includes('aria-label="Construcción"'));

  // The API keeps them in the snapshot: the schema takes them and refuses a year that is not one.
  const payload = { location: "X", area: null, price: 1, landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, factors: [] };
  assert.equal(comparableInputSchema.safeParse({ ...payload, machinery: machineComparable().machinery }).success, true);
  assert.equal(comparableInputSchema.safeParse({ ...payload, machinery: { year: 18 } }).success, false);
});
