/**
 * Video 7.1 (0:29–2:18): a block whose title the appraiser erased printed
 * «NO SE PROPORCIONÓ», and once saved it came back as «CAMPO SIN TÍTULO».
 * An empty title is saved empty and read back empty; «Imprimir título: no»
 * of a block and of a subbloque is kept; a title saved as the filler before
 * the fix reads as empty. A date of the body linked to the header (video
 * 7.3) keeps its link.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import type { AppSection } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const load = async (fixture: Fixture) => initialSectionsFor((await getValuationByPublicId(fixture.publicId, fixture.organizationId))!);

const save = (fixture: Fixture, sections: AppSection[]) =>
  saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections: buildSectionsPayload(sections) });

const consideraciones = (sections: AppSection[]) => sections.find((section) => section.id === "consideraciones")!;

test("an empty block title is kept empty, and «Imprimir título» of a block and a subbloque is kept", async () => {
  const fixture = await createValuationFixture();
  const initial = await load(fixture);
  const block = consideraciones(initial).blocks[0];
  assert.ok(block.apartados.length >= 2, "the template brings subbloques to work with");
  const [first, second] = block.apartados;

  const edited = initial.map((section) => section.id !== "consideraciones" ? section : {
    ...section,
    blocks: section.blocks.map((item, index) => index !== 0 ? item : {
      ...item,
      title: "",
      apartados: item.apartados.map((apartado) => apartado.id === first.id
        ? { ...apartado, titleHidden: true }
        : apartado.id === second.id ? { ...apartado, title: "" } : apartado),
    }),
  });
  await save(fixture, edited);
  const reloaded = consideraciones(await load(fixture)).blocks[0];
  assert.equal(reloaded.title, "", "not «Campo sin título»");
  assert.equal(reloaded.apartados.find((apartado) => apartado.id === first.id)!.titleHidden, true);
  assert.equal(reloaded.apartados.find((apartado) => apartado.id === first.id)!.title, first.title, "the title stays in the editor");
  assert.equal(reloaded.apartados.find((apartado) => apartado.id === second.id)!.title, "");

  // The block's title written again, but not printed.
  const hidden = (await load(fixture)).map((section) => section.id !== "consideraciones" ? section : {
    ...section,
    blocks: section.blocks.map((item, index) => index !== 0 ? item : { ...item, title: "DATOS DEL BIEN", titleHidden: true }),
  });
  await save(fixture, hidden);
  const again = consideraciones(await load(fixture)).blocks[0];
  assert.equal(again.title, "DATOS DEL BIEN");
  assert.equal(again.titleHidden, true);
});

test("a block title saved as «Campo sin título» before the fix reads back empty", async () => {
  const fixture = await createValuationFixture();
  const initial = await load(fixture);
  await save(fixture, initial);
  const blockId = consideraciones(initial).blocks[0].id;
  const updated = await prisma.nodoDocumento.updateMany({
    where: { SClave: blockId, DFechaEliminacion: null, seccionDocumento: { versionAvaluo: { avaluo: { UIdentificadorPublico: fixture.publicId } } } },
    data: { STitulo: "Campo sin título" },
  });
  assert.ok(updated.count >= 1);
  assert.equal(consideraciones(await load(fixture)).blocks[0].title, "");
});

test("a date of the body linked to the header keeps its link", async () => {
  const fixture = await createValuationFixture();
  const initial = await load(fixture);
  const edited = initial.map((section) => section.id !== "consideraciones" ? section : {
    ...section,
    blocks: section.blocks.map((item, index) => index !== 0 ? item : {
      ...item,
      concepts: [...item.concepts, { id: "fecha-avaluo-cuerpo", label: "Fecha del avalúo", value: "2026-11-20", enabled: true, type: "date" as const, headerDate: "valuation" as const }],
    }),
  });
  await save(fixture, edited);
  const concept = consideraciones(await load(fixture)).blocks[0].concepts.find((item) => item.id === "fecha-avaluo-cuerpo")!;
  assert.equal(concept.value, "2026-11-20");
  assert.equal(concept.headerDate, "valuation");
});
