/**
 * V5.7-20: «No se pudo guardar el avalúo». Items with the same id in one
 * section (the croquis images, of fixed id, once their block was moved or
 * copied) shared one node of the document: an image with the id of its own
 * block made the node its own parent and the database refused the save, and
 * two blocks with the same image lost one of them on reopening.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import type { AppSection, Block, ImageContent } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { getCanonicalSectionKey } from "../../src/features/valuations/sections/section-registry";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;
const SECTION = "croquisComparables";

const image = (id: string, src: string): ImageContent => ({ id, title: "CROQUIS DE LOCALIZACIÓN", src, enabled: true });
const block = (id: string, images: ImageContent[]): Block =>
  ({ id, title: "CROQUIS Y FOTOGRAFÍAS DE COMPARABLES", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images });
const section = (blocks: Block[]): AppSection =>
  ({ id: SECTION, label: "", title: "CROQUIS Y FOTOGRAFÍAS DE COMPARABLES", sourceFile: "", enabled: true, required: false, blocks });

const save = (fixture: Fixture, sections: AppSection[]) =>
  saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections: buildSectionsPayload(sections) as never });

async function reload(fixture: Fixture) {
  const detail = await getValuationByPublicId(fixture.publicId, fixture.organizationId);
  const found = initialSectionsFor(detail).find((item) => getCanonicalSectionKey(item.id) === getCanonicalSectionKey(SECTION));
  assert.ok(found, "the croquis section reloads");
  return found;
}

test("an image with the id of its own block is saved instead of failing the whole valuation", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, [section([block("croquis-mapa-comparables", [image("croquis-mapa-comparables", "uploads/2026-11/mapa.jpg")])])]);
  const reloaded = await reload(fixture);
  const saved = reloaded.blocks.find((item) => item.id === "croquis-mapa-comparables");
  assert.ok(saved, "the block is kept with its id");
  assert.deepEqual(saved.images.map((item) => item.src.endsWith("mapa.jpg")), [true]);
});

test("the same croquis image in two blocks is kept in both, and saving again is stable", async () => {
  const fixture = await createValuationFixture();
  const sections = [section([
    block("bloque-croquis", [image("croquis-macrolocalizacion", "uploads/2026-11/macro-viejo.jpg")]),
    block("bloque-movido", [image("croquis-macrolocalizacion", "uploads/2026-11/macro-nuevo.jpg")]),
  ])];
  await save(fixture, sections);
  await save(fixture, sections);
  const reloaded = await reload(fixture);
  const sources = (id: string) => reloaded.blocks.find((item) => item.id === id)?.images.map((item) => item.src.split("/").at(-1));
  assert.deepEqual(sources("bloque-croquis"), ["macro-viejo.jpg"]);
  assert.deepEqual(sources("bloque-movido"), ["macro-nuevo.jpg"]);
  const ids = reloaded.blocks.flatMap((item) => item.images.map((entry) => entry.id));
  assert.equal(new Set(ids).size, ids.length, "each image reopens with an id of its own");

  // Saved again as reopened: nothing changes.
  await save(fixture, [reloaded]);
  const again = await reload(fixture);
  assert.deepEqual(again.blocks.flatMap((item) => item.images.map((entry) => entry.id)), ids);
});
