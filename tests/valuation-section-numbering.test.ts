import assert from "node:assert/strict";
import test from "node:test";
import type { AppSection, Block } from "../src/features/valuations/model";
import { chapterLabel, resequenceSections, sectionDisplayName } from "../src/features/valuations/components/workspace/model/section-numbering";
import { formatDocumentBlockTitle } from "../src/features/valuations/components/document-block-title-bar";
import { printableSectionGroups } from "../src/features/valuations/services/printable-sections";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const block = (id: string, extra: Partial<Block> = {}): Block => ({
  id,
  title: id.toUpperCase(),
  sectionLabel: "",
  enabled: true,
  required: false,
  concepts: [{ id: `${id}-c`, label: "Dato", value: "1", enabled: true }],
  apartados: [],
  tables: [],
  images: [],
  ...extra,
});

const section = (id: string, blocks: Block[], extra: Partial<AppSection> = {}): AppSection =>
  ({ id, label: "", title: id.toUpperCase(), sourceFile: "", enabled: true, required: false, blocks, ...extra });

/** What the dictamen prints on the title of every block, section by section. */
function printedTitles(sections: AppSection[]) {
  return printableSectionGroups(sections).flat().map((item) => ({
    id: item.id,
    titles: item.blocks.filter((entry) => entry.enabled).map((entry) => formatDocumentBlockTitle(entry.sectionLabel, entry.title)),
  }));
}

/* ------------------------------------------------------------------ */
/*  Editor and dictamen read the same numeral                          */
/* ------------------------------------------------------------------ */

test("the tab of a chapter shows the numeral its first block prints, with hidden sections, calculation blocks and annexes in between", () => {
  const sections = resequenceSections([
    section("caratula", [block("portada")]),
    section("datos", [block("datos-1"), block("datos-2")]),
    // Hidden: it keeps its place but takes no number and prints nothing.
    section("terreno", [block("terreno-1")], { enabled: false }),
    // The calculation's pages count like any other block: they print.
    section("mercadoVenta", [block("mercadoVenta-1"), block("motor-mercado-terreno_venta-1"), block("motor-mercado-terreno_venta-2")]),
    // A hidden block takes no number; the next one continues the count.
    section("fotosSujeto", [block("fotos-oculto", { enabled: false }), block("fotos-1")]),
    section("conclusiones", [block("conclusion")]),
    section("mapaComparables", [block("mapa")]),
  ]);

  assert.deepEqual(sections.map((item) => [item.id, item.label]), [
    ["caratula", ""],
    ["datos", "I"],
    ["terreno", ""],
    ["mercadoVenta", "III"],
    ["fotosSujeto", "VI"],
    ["conclusiones", "VII"],
    ["mapaComparables", "ANEXO 1"],
  ]);
  assert.deepEqual(sections[3].blocks.map((item) => item.sectionLabel), ["III", "IV", "V"]);
  assert.deepEqual(sections[4].blocks.map((item) => item.sectionLabel), ["", "VI"]);

  // The ribbon, the badges and the printed titles agree.
  assert.equal(sectionDisplayName(sections[4]), "VI. FOTOSSUJETO");
  assert.equal(sectionDisplayName(sections[2]), "TERRENO · oculta");
  assert.deepEqual(printedTitles(sections), [
    { id: "caratula", titles: ["PORTADA"] },
    { id: "datos", titles: ["I. DATOS-1", "II. DATOS-2"] },
    { id: "mercadoVenta", titles: ["III. MERCADOVENTA-1", "IV. MOTOR-MERCADO-TERRENO_VENTA-1", "V. MOTOR-MERCADO-TERRENO_VENTA-2"] },
    { id: "fotosSujeto", titles: ["VI. FOTOS-1"] },
    { id: "conclusiones", titles: ["VII. CONCLUSION"] },
    { id: "mapaComparables", titles: ["ANEXO 1. MAPA"] },
  ]);
  for (const item of sections.filter((entry) => entry.enabled && entry.id !== "caratula")) {
    const printed = printedTitles(sections).find((entry) => entry.id === item.id)?.titles[0] ?? "";
    assert.ok(printed.startsWith(`${item.label}. `), `${item.id}: tab "${item.label}" vs dictamen "${printed}"`);
  }
});

test("an approach left out of the dictamen takes no number in the editor either, and the chapter after it keeps the count", () => {
  const sections = resequenceSections([
    section("caratula", []),
    section("costos", [block("costos-1")], { excludedFromReport: ["costos"] }),
    section("mercadoVenta", [block("mercadoVenta-1"), block("motor-mercado-terreno_venta-1"), block("motor-mercado-inmueble_venta-1")], { excludedFromReport: ["mercado-terrenos"] }),
    section("conclusiones", [block("conclusion")]),
  ]);
  assert.equal(sections[1].label, "", "a section left out has no numeral");
  assert.deepEqual(sections[2].blocks.map((item) => item.sectionLabel), ["I", "", "II"], "the land market's page is left out");
  assert.equal(sections[2].label, "I");
  assert.equal(sections[3].label, "III");
  assert.deepEqual(printedTitles(sections).map((item) => item.titles), [[], ["I. MERCADOVENTA-1", "II. MOTOR-MERCADO-INMUEBLE_VENTA-1"], ["III. CONCLUSION"]]);
});

test("a chapter with nothing printed shows no numeral, and the numeral of a chapter is that of its first printed block", () => {
  assert.equal(chapterLabel([{ sectionLabel: "" }, { sectionLabel: "IV" }, { sectionLabel: "V" }]), "IV");
  assert.equal(chapterLabel([{ sectionLabel: "" }]), "");
  const sections = resequenceSections([
    section("caratula", []),
    section("datos", [block("datos-1", { enabled: false })]),
    section("terreno", [block("terreno-1")]),
  ]);
  assert.equal(sections[1].label, "");
  assert.equal(sectionDisplayName(sections[1]), "DATOS");
  assert.equal(sections[2].label, "I");
});
