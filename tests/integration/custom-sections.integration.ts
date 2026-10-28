/**
 * A section the appraiser adds is saved under its own key, read back at its
 * position with its content, and stays gone once he deletes it. A renamed
 * registry tab keeps its name across saves.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createCustomSection } from "../../src/features/valuations/components/workspace/model/content-factories";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { removeCustomSection, renameSection } from "../../src/features/valuations/services/section-edit-operations";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const load = async (fixture: Fixture) => initialSectionsFor((await getValuationByPublicId(fixture.publicId, fixture.organizationId))!);

const save = (fixture: Fixture, sections: ReturnType<typeof initialSectionsFor>) =>
  saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections: buildSectionsPayload(sections) });

test("a custom section is saved with its content and position, renamed, and removed for good", async () => {
  const fixture = await createValuationFixture();
  const custom = createCustomSection();
  const added = [...(await load(fixture)), custom];
  // Captured like any other section: a concept in its block.
  const captured = added.map((section) => section.id !== custom.id ? section : {
    ...section,
    blocks: section.blocks.map((block) => ({ ...block, concepts: [{ ...block.concepts[0], label: "Plano", value: "Planta baja" }] })),
  });
  await save(fixture, renameSection(captured, custom.id, "Planos"));

  const reloaded = await load(fixture);
  const stored = reloaded.at(-1)!;
  assert.equal(stored.id, custom.id);
  assert.equal(stored.title, "Planos");
  assert.equal(stored.custom, true);
  // Saved as a chapter: it keeps its numeral after the map of comparables, an annex.
  assert.equal(stored.documentRole, "chapter");
  assert.equal(stored.label, "XV", "numbered after the fourteen registry chapters");
  assert.equal(stored.blocks[0].title, "Planos", "the banner follows the tab");
  assert.deepEqual(stored.blocks[0].concepts.map((concept) => [concept.label, concept.value]), [["Plano", "Planta baja"]]);
  assert.equal(reloaded.filter((section) => section.custom).length, 1);

  // Moved to the second place and saved: it is read back there.
  const moved = [reloaded[0], stored, ...reloaded.slice(1, -1)];
  await save(fixture, moved);
  const afterMove = await load(fixture);
  assert.equal(afterMove[1].id, custom.id);
  assert.equal(afterMove[1].label, "II");
  assert.equal(afterMove.length, 16);

  // Removed from the editor: not read back, and no section is lost.
  await save(fixture, removeCustomSection(afterMove, custom.id));
  const afterRemove = await load(fixture);
  assert.equal(afterRemove.length, 15);
  assert.equal(afterRemove.some((section) => section.id === custom.id), false);
  const row = await prisma.seccionDocumento.findFirst({ where: { SClave: custom.id } });
  assert.equal(row?.BVisible, false, "kept in the database, hidden and marked removed");
});

test("a renamed registry tab keeps its name across saves; a tab never renamed follows the registry", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, renameSection(await load(fixture), "terreno", "Zona"));
  const reloaded = await load(fixture);
  const terreno = reloaded.find((section) => section.id === "terreno")!;
  assert.equal(terreno.title, "Zona");
  assert.equal(terreno.titleEdited, true);
  assert.equal(reloaded.find((section) => section.id === "consideraciones")!.title, "CONSIDERACIONES");

  // Saved again untouched: still "Zona".
  await save(fixture, reloaded);
  assert.equal((await load(fixture)).find((section) => section.id === "terreno")!.title, "Zona");
});
