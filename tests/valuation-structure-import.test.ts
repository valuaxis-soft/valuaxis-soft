/**
 * Importing with structure and linking to the valuation's data (Álvaro,
 * video 5.6, 14:30–29:29): several Blocks, subbloques on their own or whole
 * sections from a tree; "Incluir datos y autovincular"; the notice «Este dato
 * ya existe…» and «Vincular con…».
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { Apartado, AppSection, Block, Concept } from "../src/features/valuations/model";
import { applyConceptUpdateEverywhere, changeExistingConceptRelation, conceptLinkIndicator, resolveEffectiveConcept } from "../src/features/valuations/concept-links";
import {
  autoLinkConcepts,
  comparableTitle,
  linkableConcepts,
  suggestLink,
} from "../src/features/valuations/services/concept-link-suggestions";
import {
  EMPTY_SELECTION,
  apartadoKey,
  blockLeaves,
  checkState,
  destinationSectionFor,
  importStructure,
  importSummaryText,
  importTree,
  isEmptySection,
  ownContentKey,
  planImport,
  sectionLeaves,
  toggleLeaves,
  type ImportSelection,
} from "../src/features/valuations/services/structure-import";
import { stripClientDataFromSections } from "../src/features/valuations/services/document-template";
import { importDataOptionTexts } from "../src/features/valuations/components/workspace/template-dialogs";

/* ------------------------------------------------------------------ */
/*  Fixtures (invented data)                                           */
/* ------------------------------------------------------------------ */

const concept = (id: string, label: string, value = ""): Concept => ({ id, label, value, enabled: true, labelKey: `${id}-label`, valueKey: `${id}-value` });

const apartado = (id: string, concepts: Concept[]): Apartado => ({ id, title: id.toUpperCase(), enabled: true, concepts, tables: [], images: [] });

const block = (id: string, concepts: Concept[], apartados: Apartado[] = []): Block => ({
  id,
  title: id.toUpperCase(),
  sectionLabel: "",
  enabled: true,
  required: false,
  concepts,
  apartados,
  tables: [],
  images: [],
});

const section = (id: string, title: string, blocks: Block[], extra: Partial<AppSection> = {}): AppSection => ({ id, label: "", title, sourceFile: "", enabled: true, required: false, blocks, ...extra });

/** The source: another valuation of the firm, with the data of another client. */
function sourceDocument(): AppSection[] {
  return [
    section("caratula", "Carátula", [block("src-car", [concept("src-sol-car", "Solicitante", "Cliente Inventado Uno")])]),
    section("datos", "DATOS", [
      block("generales", [], [
        apartado("antecedentes", [
          concept("s-asunto", "Asunto", "Se emite trabajo valuatorio"),
          concept("s-sol", "Solicitante", "Cliente Inventado Uno"),
          concept("s-prop", "Propietario:", "Propietaria Inventada"),
        ]),
        apartado("informacion", [concept("s-inm", "Inmueble que se valúa", "Casa habitación")]),
      ]),
      block("zona", [concept("s-clas", "Clasificación de la zona", "Habitacional")], [apartado("servicios", [concept("s-agua", "Agua potable", "Sí")])]),
    ]),
    section("custom-otra", "Anexo de prueba", [block("anexo-bloque", [concept("s-nota", "Nota", "Texto de anexo")])], { custom: true, documentRole: "annex" }),
  ];
}

/** This valuation: its carátula has the applicant already captured. */
function destinationDocument(datos: Block[] = []): AppSection[] {
  return [
    section("caratula", "Carátula", [block("car", [concept("d-sol", "Solicitante", "Persona Inventada Dos"), concept("d-fecha", "Fecha del avalúo", "13 de noviembre de 2026")])]),
    section("datos", "DATOS", datos),
    section("conclusion", "Conclusión", [block("concl", [])]),
  ];
}

const allConcepts = (sections: AppSection[]) => sections.flatMap((item) => item.blocks.flatMap((b) => [...b.concepts, ...b.apartados.flatMap((a) => a.concepts)]));
const byLabel = (sections: AppSection[], label: string, sectionId: string) =>
  sections.find((item) => item.id === sectionId)!.blocks.flatMap((b) => [...b.concepts, ...b.apartados.flatMap((a) => a.concepts)]).filter((c) => comparableTitle(c.label) === comparableTitle(label));

function select(tree: ReturnType<typeof importTree>, keys: string[], wholeSection?: string): ImportSelection {
  if (wholeSection) {
    const item = tree.find((entry) => entry.section.id === wholeSection)!;
    return toggleLeaves(EMPTY_SELECTION, tree, sectionLeaves(item), true, wholeSection);
  }
  return toggleLeaves(EMPTY_SELECTION, tree, keys, true);
}

/* ------------------------------------------------------------------ */
/*  The tree                                                           */
/* ------------------------------------------------------------------ */

test("the tree lists Sección › Bloque › Subbloque, without the carátula", () => {
  const tree = importTree(sourceDocument());
  assert.deepEqual(tree.map((item) => item.title), ["DATOS", "Anexo de prueba"]);
  const [generales, zona] = tree[0].blocks;
  // A Block with no concepts of its own offers only its subbloques; one with its own concepts offers them as a box too.
  assert.deepEqual(blockLeaves(generales), ["datos/generales/antecedentes", "datos/generales/informacion"]);
  assert.deepEqual(blockLeaves(zona), ["datos/zona#own", "datos/zona/servicios"]);
});

test("several Blocks and subbloques are chosen at once; a Block's box is checked, unchecked or partly", () => {
  const tree = importTree(sourceDocument());
  const [generales, zona] = tree[0].blocks;
  let selection = toggleLeaves(EMPTY_SELECTION, tree, [apartadoKey(generales, generales.block.apartados[0])], true);
  selection = toggleLeaves(selection, tree, blockLeaves(zona), true);
  assert.equal(checkState(selection, blockLeaves(generales)), "indeterminate");
  assert.equal(checkState(selection, blockLeaves(zona)), true);
  assert.equal(checkState(selection, sectionLeaves(tree[0])), "indeterminate");
  assert.equal(selection.wholeSections.size, 0);
  // Checking every Block one by one is not the same as choosing the section.
  selection = toggleLeaves(selection, tree, blockLeaves(generales), true);
  assert.equal(checkState(selection, sectionLeaves(tree[0])), true);
  assert.equal(selection.wholeSections.size, 0);
});

test("a section's own box chooses it whole; unchecking a subbloque inside makes it a choice of Blocks again", () => {
  const tree = importTree(sourceDocument());
  let selection = select(tree, [], "datos");
  assert.deepEqual([...selection.wholeSections], ["datos"]);
  selection = toggleLeaves(selection, tree, ["datos/zona/servicios"], false);
  assert.equal(selection.wholeSections.size, 0);
});

/* ------------------------------------------------------------------ */
/*  Blocks and subbloques                                              */
/* ------------------------------------------------------------------ */

test("several Blocks and a loose subbloque go at the end of this section, each subbloque inside its Block", () => {
  const source = sourceDocument();
  const tree = importTree(source);
  const [generales, zona] = tree[0].blocks;
  const selection = select(tree, [apartadoKey(generales, generales.block.apartados[0]), ...blockLeaves(zona)]);
  const destination = destinationDocument([block("existente", [concept("d-x", "Algo", "valor")])]);
  const result = importStructure(destination, "datos", planImport(tree, selection, destination));
  assert.equal(result.changed, true);
  const datos = result.sections.find((item) => item.id === "datos")!;
  assert.deepEqual(datos.blocks.map((item) => item.title), ["EXISTENTE", "GENERALES", "ZONA"]);
  const imported = datos.blocks[1];
  assert.notEqual(imported.id, "generales");
  // Only the chosen subbloque, under its Block's title.
  assert.deepEqual(imported.apartados.map((item) => item.title), ["ANTECEDENTES"]);
  assert.deepEqual(imported.concepts, []);
  assert.deepEqual(datos.blocks[2].apartados.map((item) => item.title), ["SERVICIOS"]);
  assert.deepEqual(datos.blocks[2].concepts.map((item) => item.label), ["Clasificación de la zona"]);
  // Without data, as before: the values stay blank.
  assert.ok(allConcepts([datos]).filter((item) => item.id !== "d-x").every((item) => item.value === ""));
  assert.deepEqual(result.summary, { blocks: 2, sections: 0, newSections: 0, linked: 0 });
});

test("a Block's own concepts alone come without its subbloques", () => {
  const tree = importTree(sourceDocument());
  const zona = tree[0].blocks[1];
  const destination = destinationDocument();
  const result = importStructure(destination, "datos", planImport(tree, select(tree, [ownContentKey(zona)]), destination), { includeData: true });
  const imported = result.sections.find((item) => item.id === "datos")!.blocks[0];
  assert.deepEqual(imported.apartados, []);
  assert.deepEqual(imported.concepts.map((item) => item.value), ["Habitacional"]);
});

test("nothing chosen imports nothing and says why", () => {
  const tree = importTree(sourceDocument());
  const destination = destinationDocument();
  const result = importStructure(destination, "datos", planImport(tree, EMPTY_SELECTION, destination));
  assert.equal(result.changed, false);
  assert.match(result.reason ?? "", /Elige al menos/);
});

/* ------------------------------------------------------------------ */
/*  Whole sections                                                     */
/* ------------------------------------------------------------------ */

test("a whole section replaces its empty section of this valuation", () => {
  const source = sourceDocument();
  const tree = importTree(source);
  const destination = destinationDocument([block("vacio", [])]);
  assert.equal(isEmptySection(destination[1]), true);
  const plan = planImport(tree, select(tree, [], "datos"), destination);
  assert.equal(plan.sections[0].destination?.id, "datos");
  assert.equal(plan.sections[0].destinationHasContent, false);
  const result = importStructure(destination, "conclusion", plan, { includeData: true });
  const datos = result.sections.find((item) => item.id === "datos")!;
  assert.deepEqual(datos.blocks.map((item) => item.title), ["GENERALES", "ZONA"]);
  assert.equal(result.summary?.focusSectionId, "datos");
  assert.equal(result.sections.length, destination.length);
});

test("a whole section into one with content: added at its end or replacing it, as the appraiser chose", () => {
  const tree = importTree(sourceDocument());
  const destination = destinationDocument([block("mio", [concept("d-mio", "Dato mío", "valor mío")])]);
  const plan = planImport(tree, select(tree, [], "datos"), destination);
  assert.equal(plan.sections[0].destinationHasContent, true);
  const appended = importStructure(destination, "datos", plan, { conflict: "append" });
  assert.deepEqual(appended.sections.find((item) => item.id === "datos")!.blocks.map((item) => item.title), ["MIO", "GENERALES", "ZONA"]);
  const replaced = importStructure(destination, "datos", plan, { conflict: "replace" });
  assert.deepEqual(replaced.sections.find((item) => item.id === "datos")!.blocks.map((item) => item.title), ["GENERALES", "ZONA"]);
});

test("a section this valuation does not have comes as a new section, an annex at the end", () => {
  const tree = importTree(sourceDocument());
  const destination = destinationDocument();
  const plan = planImport(tree, select(tree, [], "custom-otra"), destination);
  assert.equal(plan.sections[0].destination, null);
  const result = importStructure(destination, "datos", plan, { includeData: true });
  const added = result.sections.at(-1)!;
  assert.equal(added.title, "Anexo de prueba");
  assert.equal(added.custom, true);
  assert.notEqual(added.id, "custom-otra");
  assert.equal(added.documentRole, "annex");
  assert.equal(added.blocks[0].concepts[0].value, "Texto de anexo");
  assert.equal(result.summary?.newSections, 1);
  assert.equal(result.summary?.focusSectionId, added.id);
});

test("a section is matched by its title when the ids differ, never the carátula", () => {
  const destination = [...destinationDocument(), section("custom-x", "Anexo  de PRUEBA", [])];
  assert.equal(destinationSectionFor(destination, { id: "custom-otra", title: "Anexo de prueba", label: "" })?.id, "custom-x");
  assert.equal(destinationSectionFor(destination, { id: "caratula", title: "Carátula", label: "" }), null);
});

/* ------------------------------------------------------------------ */
/*  Incluir datos y autovincular                                       */
/* ------------------------------------------------------------------ */

test("«Incluir datos y autovincular»: a concept called like one of the valuation is linked to it; the rest bring their value", () => {
  const tree = importTree(sourceDocument());
  const generales = tree[0].blocks[0];
  const destination = destinationDocument();
  const plan = planImport(tree, select(tree, blockLeaves(generales)), destination);
  const result = importStructure(destination, "datos", plan, { includeData: true, autoLink: true });
  assert.equal(result.summary?.linked, 1);
  const [solicitante] = byLabel(result.sections, "Solicitante", "datos");
  const caratula = result.sections[0].blocks[0].concepts[0];
  // It shows the valuation's applicant, not the source's, and the two are one datum now.
  assert.equal(solicitante.value, "Persona Inventada Dos");
  assert.equal(solicitante.valueKey, caratula.valueKey);
  assert.equal(conceptLinkIndicator(solicitante, allConcepts(result.sections)), "partial");
  const edited = applyConceptUpdateEverywhere(allConcepts(result.sections), caratula.id, { value: "Persona Inventada Tres" });
  assert.equal(resolveEffectiveConcept(edited.find((item) => item.id === solicitante.id)!, edited).value, "Persona Inventada Tres");
  // The rest keep the source's values.
  assert.equal(byLabel(result.sections, "Propietario", "datos")[0].value, "Propietaria Inventada");
  assert.equal(importSummaryText(result.summary!, true), "Se importó 1 bloque; 1 concepto quedó vinculado a datos de tu avalúo.");
});

test("without «autovincular» the import keeps the source's values; without data, they come blank", () => {
  const tree = importTree(sourceDocument());
  const generales = tree[0].blocks[0];
  const destination = destinationDocument();
  const plan = planImport(tree, select(tree, blockLeaves(generales)), destination);
  const withData = importStructure(destination, "datos", plan, { includeData: true });
  const [solicitante] = byLabel(withData.sections, "Solicitante", "datos");
  assert.equal(solicitante.value, "Cliente Inventado Uno");
  assert.notEqual(solicitante.valueKey, withData.sections[0].blocks[0].concepts[0].valueKey);
  assert.equal(importSummaryText(withData.summary!, false), "Se importó 1 bloque.");
  const blank = importStructure(destination, "datos", plan, {});
  assert.equal(byLabel(blank.sections, "Solicitante", "datos")[0].value, "");
});

test("autolink prefers the first concept with a value and leaves generic titles and formulas alone", () => {
  const sections: AppSection[] = [
    section("caratula", "Carátula", [block("car", [concept("vacio", "Solicitante", ""), concept("lleno", "Solicitante:", "Persona Inventada Dos"), concept("nuevo", "Nuevo concepto", "x")])]),
    section("datos", "Datos", [block("b", [
      concept("imp-sol", "SOLICITANTE", "otro"),
      concept("imp-nuevo", "Nuevo concepto", "y"),
      { ...concept("imp-formula", "Solicitante", "z"), formula: { expression: { type: "operand", operand: { type: "constant", value: 1 } } } },
    ])]),
  ];
  const result = autoLinkConcepts(sections, new Set(["imp-sol", "imp-nuevo", "imp-formula"]));
  assert.equal(result.linked, 1);
  const imported = result.sections[1].blocks[0].concepts;
  assert.equal(imported[0].value, "Persona Inventada Dos");
  assert.equal(imported[0].valueKey, "lleno-value");
  assert.equal(imported[1].value, "y");
  assert.equal(imported[2].value, "z");
});

test("autolink does not link to a concept of the valuation that is still empty: the imported value stays", () => {
  const sections: AppSection[] = [
    section("caratula", "Carátula", [block("car", [concept("calle", "Calle", "")])]),
    section("datos", "Datos", [block("b", [concept("i-calle", "Calle", "Calle Inventada")])]),
  ];
  const result = autoLinkConcepts(sections, new Set(["i-calle"]));
  assert.equal(result.linked, 0);
  assert.equal(result.sections[1].blocks[0].concepts[0].value, "Calle Inventada");
});

test("concepts linked to each other in the source follow the one that is autolinked", () => {
  const shared = { valueKey: "k-src" };
  const sections: AppSection[] = [
    section("caratula", "Carátula", [block("car", [concept("d-sol", "Solicitante", "Persona Inventada Dos")])]),
    section("datos", "Datos", [block("b", [{ ...concept("i1", "Solicitante", "viejo"), ...shared }, { ...concept("i2", "Nombre del solicitante", "viejo"), ...shared }])]),
  ];
  const result = autoLinkConcepts(sections, new Set(["i1", "i2"]));
  assert.equal(result.linked, 2);
  assert.ok(result.sections[1].blocks[0].concepts.every((item) => item.value === "Persona Inventada Dos" && item.valueKey === "d-sol-value"));
});

test("a source concept without a value key gets one its linked copies share", () => {
  const { valueKey: _none, ...bare } = concept("d-sol", "Solicitante", "Persona Inventada Dos");
  const sections: AppSection[] = [
    section("caratula", "Carátula", [block("car", [bare])]),
    section("datos", "Datos", [block("b", [concept("i1", "Solicitante", "")])]),
  ];
  const result = autoLinkConcepts(sections, new Set(["i1"]));
  assert.equal(result.sections[0].blocks[0].concepts[0].valueKey, "d-sol-value");
  assert.equal(result.sections[1].blocks[0].concepts[0].valueKey, "d-sol-value");
});

/* ------------------------------------------------------------------ */
/*  «Este dato ya existe…» and «Vincular con…»                          */
/* ------------------------------------------------------------------ */

test("writing a value another concept already holds suggests linking to it, with where it is", () => {
  const sections = destinationDocument([block("generales", [], [apartado("antecedentes", [concept("n-sol", "Solicitante", "persona  inventada dos")])])]);
  const suggestion = suggestLink(sections, "n-sol", "value");
  assert.equal(suggestion?.source.id, "d-sol");
  assert.equal(suggestion?.location, "Carátula › CAR");
  // Short or common values are not suggested: they repeat by chance.
  const short = destinationDocument([block("b", [concept("n1", "Clave", "1"), concept("n2", "Otra", "1")])]);
  assert.equal(suggestLink(short, "n1", "value"), null);
});

test("naming a new concept like an existing one with a value suggests linking to it; not when already linked", () => {
  const sections = destinationDocument([block("b", [concept("n-sol", "Solicitante:", "")])]);
  assert.equal(suggestLink(sections, "n-sol", "title")?.source.id, "d-sol");
  assert.equal(suggestLink(sections, "n-sol", "value"), null);
  const linked = destinationDocument([block("b", [{ ...concept("n-sol", "Solicitante", "Persona Inventada Dos"), valueKey: "d-sol-value" }])]);
  assert.equal(suggestLink(linked, "n-sol", "value"), null);
  assert.equal(suggestLink(linked, "n-sol", "title"), null);
});

test("«Vincular con…» links the datum of a concept to the one chosen; «Desvincular» lets it go with its value", () => {
  const sections = destinationDocument([block("b", [concept("n-sol", "Nombre del solicitante", "otro")])]);
  const candidates = linkableConcepts(sections).filter((item) => item.concept.id !== "n-sol");
  assert.ok(candidates.some((item) => item.concept.id === "d-sol" && item.location === "Carátula › CAR"));
  const linked = changeExistingConceptRelation(allConcepts(sections), "n-sol", "value", "d-sol");
  const target = linked.find((item) => item.id === "n-sol")!;
  assert.equal(target.value, "Persona Inventada Dos");
  assert.equal(target.label, "Nombre del solicitante");
  assert.equal(conceptLinkIndicator(target, linked), "partial");
  const unlinked = changeExistingConceptRelation(linked, "n-sol", "unlink");
  const free = unlinked.find((item) => item.id === "n-sol")!;
  assert.equal(conceptLinkIndicator(free, unlinked), "none");
  assert.equal(free.value, "Persona Inventada Dos");
});

/* ------------------------------------------------------------------ */
/*  From a template (as in the video): no client data                  */
/* ------------------------------------------------------------------ */

test("from a template, «autovincular» fills the concepts called like the valuation's with its data; the rest come blank", () => {
  // A template keeps no client data: the source as a template stores it.
  const template = stripClientDataFromSections(sourceDocument(), { includeImages: false });
  const tree = importTree(template);
  const destination = destinationDocument();
  const result = importStructure(destination, "datos", planImport(tree, select(tree, blockLeaves(tree[0].blocks[0])), destination), { includeData: true, autoLink: true });
  assert.equal(result.summary?.linked, 1);
  assert.equal(byLabel(result.sections, "Solicitante", "datos")[0].value, "Persona Inventada Dos");
  assert.equal(byLabel(result.sections, "Propietario", "datos")[0].value, "");
  assert.ok(!allConcepts(result.sections).some((item) => item.value.includes("Cliente Inventado Uno")));
});

test("the dialog does not promise a template's data: it says templates keep only the appraiser's texts", () => {
  const template = importDataOptionTexts("template");
  assert.match(template.includeData, /no guardan datos del cliente/);
  assert.match(template.autoLink, /llegan vacíos/);
  assert.doesNotMatch(template.autoLink, /traen el valor/);
  assert.match(importDataOptionTexts("valuation").autoLink, /traen el valor del avalúo de origen/);
});

test("the calculation's Blocks are not offered to link to", () => {
  const sections = destinationDocument([block("motor-costos", [concept("calc", "Valor físico", "1,000,000.00")])]);
  assert.ok(!linkableConcepts(sections).some((item) => item.concept.id === "calc"));
});
