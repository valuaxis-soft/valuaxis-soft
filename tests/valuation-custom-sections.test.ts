import assert from "node:assert/strict";
import test from "node:test";

import { createCustomSection } from "../src/features/valuations/components/workspace/model/content-factories";
import { adjacentPreviewSectionId, previewSectionPosition } from "../src/features/valuations/components/workspace/model/preview-navigation";
import { buildSectionsPayload } from "../src/features/valuations/components/workspace/model/save-payload";
import { resequenceSections, sectionDisplayName } from "../src/features/valuations/components/workspace/model/section-numbering";
import { hydrateSectionMetadata, isRemovedSectionConfig, sectionMetadataFromContent } from "../src/features/valuations/metadata";
import type { AppSection } from "../src/features/valuations/model";
import { buildCanonicalValuationSections } from "../src/features/valuations/repositories/valuation.repository";
import { createInitialSections } from "../src/features/valuations/sections";
import { isCustomSectionId } from "../src/features/valuations/sections/section-registry";
import { NEW_SECTION_TITLE, removeCustomSection, renameSection } from "../src/features/valuations/services/section-edit-operations";

/* ------------------------------------------------------------------ */
/*  Editor operations                                                  */
/* ------------------------------------------------------------------ */

test("a section the appraiser adds has its own id, one block titled like it, and is numbered by its position", () => {
  const section = createCustomSection();
  assert.equal(isCustomSectionId(section.id), true);
  assert.equal(section.custom, true);
  assert.equal(section.title, NEW_SECTION_TITLE);
  assert.equal(section.blocks[0].title, NEW_SECTION_TITLE);

  const sections = resequenceSections([...createInitialSections(), section]);
  const last = sections.at(-1)!;
  assert.equal(last.id, section.id);
  assert.equal(last.label, "XVI", "the sixteenth tab");
  assert.equal(sectionDisplayName(last), `XVI. ${NEW_SECTION_TITLE}`);

  // Moved to the second place, it takes the second number and the rest shift.
  const moved = resequenceSections([sections[0], last, ...sections.slice(1, -1)]);
  assert.equal(moved[1].label, "II");
  assert.equal(moved[2].label, "III");
});

test("renaming a tab keeps the title, marks it edited and renames the block that carried the section's name", () => {
  const custom = createCustomSection();
  const sections = [...createInitialSections(), custom];
  const renamed = renameSection(sections, custom.id, "  Anexos fotográficos  ");
  const section = renamed.at(-1)!;
  assert.equal(section.title, "Anexos fotográficos");
  assert.equal(section.titleEdited, true);
  assert.equal(section.blocks[0].title, "Anexos fotográficos", "the printed banner follows the tab");

  // A registry section is renamed the same way; its blocks have their own titles and stay.
  const terreno = renameSection(sections, "terreno", "ZONA")[2];
  assert.equal(terreno.title, "ZONA");
  assert.equal(terreno.titleEdited, true);
  assert.equal(terreno.id, "terreno", "the identity of the section never changes");
  assert.deepEqual(terreno.blocks.map((block) => block.title), sections[2].blocks.map((block) => block.title));

  // Empty, unchanged or unknown: nothing happens, same reference.
  assert.equal(renameSection(sections, custom.id, "   "), sections);
  assert.equal(renameSection(sections, custom.id, NEW_SECTION_TITLE), sections);
  assert.equal(renameSection(sections, "nope", "X"), sections);
  assert.equal(renameSection(sections, custom.id, "A".repeat(500)).at(-1)!.title.length, 120);
});

test("only a section the appraiser added can be removed", () => {
  const custom = createCustomSection();
  const sections = [...createInitialSections(), custom];
  assert.equal(removeCustomSection(sections, custom.id).length, sections.length - 1);
  assert.equal(removeCustomSection(sections, "terreno"), sections, "registry sections are hidden, never removed");
  assert.equal(removeCustomSection(sections, "seccion-unknown"), sections);
});

test("the full save sends whether a section was added or renamed; the metadata reads it back", () => {
  const custom = createCustomSection();
  const payload = buildSectionsPayload(renameSection([createInitialSections()[0], custom], custom.id, "PLANOS"));
  assert.equal(payload[0].custom, undefined);
  assert.equal(payload[0].titleEdited, undefined);
  assert.equal(payload[1].custom, true);
  assert.equal(payload[1].titleEdited, true);
  assert.equal(payload[1].title, "PLANOS");
  assert.equal(payload[1].sortOrder, 1);

  assert.deepEqual(sectionMetadataFromContent({ enabled: true, custom: true, titleEdited: true }), { enabled: true, startOnNewPage: undefined, flowSpacingBeforePx: undefined, thousandsSeparator: undefined, custom: true, titleEdited: true });
  const hydrated = hydrateSectionMetadata({ custom: true, titleEdited: true, startOnNewPage: false });
  assert.equal(hydrated.custom, true);
  assert.equal(hydrated.titleEdited, true);
  assert.equal(hydrateSectionMetadata({ title: "X" }).titleEdited, undefined);
  assert.equal(isRemovedSectionConfig({ removed: true }), true);
  assert.equal(isRemovedSectionConfig({ removed: "yes" }), false);
  assert.equal(isRemovedSectionConfig(null), false);
});

/* ------------------------------------------------------------------ */
/*  Reading a valuation                                                */
/* ------------------------------------------------------------------ */

test("a stored custom section comes back at its saved position, with its blocks; a removed one never does", () => {
  const sections = buildCanonicalValuationSections([
    dbSection(1, "caratula", "CARATULA", 0),
    dbSection(2, "datosGenerales", "DATOS", 1),
    dbSection(3, "seccion-a1b2", "PLANOS", 2, { custom: true, titleEdited: true }),
    dbSection(4, "seccion-zzzz", "BORRADA", 3, { custom: true, removed: true }),
    dbSection(5, "seccion-c3d4", "ANEXOS", 99, { custom: true }),
  ] as never);

  assert.equal(sections[2].id, "seccion-a1b2");
  assert.equal(sections[2].title, "PLANOS");
  assert.equal(sections[2].custom, true);
  assert.equal(sections[2].required, false);
  assert.equal(sections[2].blocks[0].title, "PLANOS");
  assert.equal(sections.some((section) => section.id === "seccion-zzzz"), false);
  assert.equal(sections.at(-1)?.id, "seccion-c3d4", "a position past the end lands at the end");
  // Registry sections are all still there, once each, in their order.
  assert.equal(sections.filter((section) => !section.custom).length, 15);
  assert.equal(sections[0].id, "caratula");
  assert.equal(sections[1].id, "datosGenerales");
});

test("a renamed registry section reads its stored name; one never renamed keeps the registry label", () => {
  const sections = buildCanonicalValuationSections([
    dbSection(1, "terreno", "ZONA", 2, { titleEdited: true }),
    dbSection(2, "consideraciones", "NOTAS VIEJAS", 4),
  ] as never);
  const terreno = sections.find((section) => section.id === "terreno")!;
  assert.equal(terreno.title, "ZONA");
  assert.equal(terreno.titleEdited, true);
  const consideraciones = sections.find((section) => section.id === "consideraciones")!;
  assert.equal(consideraciones.title, "CONSIDERACIONES", "an old stored name without the flag is not a rename");
  assert.equal(consideraciones.titleEdited, undefined);
});

/* ------------------------------------------------------------------ */
/*  Preview browsing                                                   */
/* ------------------------------------------------------------------ */

test("the preview browses the sections that print, skipping hidden ones, and stops at the ends", () => {
  const sections: Pick<AppSection, "id" | "enabled">[] = [
    { id: "caratula", enabled: true },
    { id: "datos", enabled: true },
    { id: "terreno", enabled: false },
    { id: "costos", enabled: true },
  ];
  assert.equal(adjacentPreviewSectionId(sections, "caratula", -1), null);
  assert.equal(adjacentPreviewSectionId(sections, "caratula", 1), "datos");
  assert.equal(adjacentPreviewSectionId(sections, "datos", 1), "costos", "the hidden section is skipped");
  assert.equal(adjacentPreviewSectionId(sections, "costos", -1), "datos");
  assert.equal(adjacentPreviewSectionId(sections, "costos", 1), null);
  assert.equal(adjacentPreviewSectionId(sections, "nope", 1), null);
  // Shown while hidden (the editor's active tab): it is still counted, and the neighbours are reachable.
  assert.equal(adjacentPreviewSectionId(sections, "terreno", 1), "costos");
  assert.deepEqual(previewSectionPosition(sections, "costos"), { index: 3, total: 3 });
  assert.deepEqual(previewSectionPosition(sections, "terreno"), { index: 3, total: 4 });
});

function dbSection(id: number, key: string, name: string, order: number, config: Record<string, unknown> = {}) {
  return {
    IdSeccionDocumento: id,
    SClave: key,
    SNombre: name,
    IOrden: order,
    BVisible: true,
    BObligatoria: false,
    JConfiguracion: config,
    nodos: [
      {
        IdNodoDocumento: id * 10,
        IdNodoPadre: null,
        DFechaEliminacion: null,
        IOrden: 0,
        SClave: `${key}-block`,
        STitulo: name,
        BVisible: true,
        BObligatorio: false,
        JConfiguracion: null,
        valores: [{ IdValorNodoDocumento: id * 100, SValorTexto: "dato", NValorNumerico: null, BValorBooleano: null, DValorFecha: null, JValorComplejo: null }],
        tablasDocumentos: [],
        nodosHijos: [],
      },
    ],
  };
}
