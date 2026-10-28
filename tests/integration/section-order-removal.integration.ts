/**
 * The order of the sections and their deletion persist (observations of 27
 * Oct 2026). Conclusión moved between Ingresos and Fotografías came back
 * where the registry has it: the read put registry sections in its order,
 * whatever was saved. A deleted section stays deleted across saves, also
 * after another edit is saved, and a registry section deleted is restored.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createCustomSection } from "../../src/features/valuations/components/workspace/model/content-factories";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import type { AppSection } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import {
  listedSections,
  removeSection,
  restoreSection,
  withListedOrder,
} from "../../src/features/valuations/services/section-edit-operations";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const load = async (fixture: Fixture) => initialSectionsFor((await getValuationByPublicId(fixture.publicId, fixture.organizationId))!);

const save = (fixture: Fixture, sections: AppSection[]) =>
  saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections: buildSectionsPayload(sections) });

const ids = (sections: AppSection[]) => sections.map((section) => section.id);

/** Moves a section of the tab strip right before another, as dropping its tab there does. */
function moveBefore(sections: AppSection[], sectionId: string, beforeId: string) {
  const listed = listedSections(sections);
  const moving = listed.find((section) => section.id === sectionId)!;
  const rest = listed.filter((section) => section.id !== sectionId);
  rest.splice(rest.findIndex((section) => section.id === beforeId), 0, moving);
  return withListedOrder(sections, rest);
}

test("Conclusión moved between Ingresos and Fotografías is read back there, also after saving again", async () => {
  const fixture = await createValuationFixture();
  const initial = await load(fixture);
  assert.ok(ids(initial).indexOf("conclusiones") > ids(initial).indexOf("fotosSujeto"), "the registry puts it near the end");

  await save(fixture, moveBefore(initial, "conclusiones", "fotosSujeto"));
  const reloaded = await load(fixture);
  const order = ids(reloaded);
  assert.equal(order.indexOf("conclusiones"), order.indexOf("ingresos") + 1, "right after Ingresos");
  assert.equal(order.indexOf("fotosSujeto"), order.indexOf("conclusiones") + 1, "right before Fotografías");
  assert.equal(reloaded.length, initial.length, "no section lost or doubled");
  // Numbered in its new place.
  const labelOf = (id: string) => reloaded.find((section) => section.id === id)!.label;
  assert.equal(labelOf("caratula"), "I");
  assert.notEqual(labelOf("conclusiones"), initial.find((section) => section.id === "conclusiones")!.label);

  // Saved again as it was read (an autosave of another edit): the order stays.
  await save(fixture, reloaded);
  assert.deepEqual(ids(await load(fixture)), order);
});

test("a section added by the appraiser and a registry section moved keep their places together", async () => {
  const fixture = await createValuationFixture();
  const custom = createCustomSection();
  const initial = await load(fixture);
  // His section second, and Costos right after the carátula.
  const withCustom = [initial[0], custom, ...initial.slice(1)];
  await save(fixture, moveBefore(withCustom, "costos", custom.id));
  const order = ids(await load(fixture));
  assert.deepEqual(order.slice(0, 3), ["caratula", "costos", custom.id]);
  assert.equal(order.length, initial.length + 1);
});

test("a deleted section stays deleted after saving it and after saving another edit; a registry one is restored", async () => {
  const fixture = await createValuationFixture();
  const custom = createCustomSection();
  await save(fixture, [...(await load(fixture)), custom]);

  // The appraiser's section and Fotografías are deleted and saved.
  const loaded = await load(fixture);
  await save(fixture, removeSection(removeSection(loaded, custom.id), "fotosSujeto"));
  const afterRemove = await load(fixture);
  assert.equal(afterRemove.some((section) => section.id === custom.id), false, "his section is gone");
  const fotos = afterRemove.find((section) => section.id === "fotosSujeto")!;
  assert.equal(fotos.removed, true, "the registry section is read back deleted");
  assert.equal(fotos.enabled, false, "and does not print");
  assert.equal(listedSections(afterRemove).some((section) => section.id === "fotosSujeto"), false, "out of the tab strip");
  const row = await prisma.seccionDocumento.findFirst({ where: { SClave: "fotosSujeto", versionAvaluo: { avaluo: { UIdentificadorPublico: fixture.publicId } } } });
  assert.equal(row?.BVisible, false);

  // Another edit is saved (the autosave): both stay deleted.
  const edited = afterRemove.map((section) => section.id === "terreno" ? { ...section, title: "ZONA", titleEdited: true } : section);
  await save(fixture, edited);
  const again = await load(fixture);
  assert.equal(again.some((section) => section.id === custom.id), false);
  assert.equal(again.find((section) => section.id === "fotosSujeto")!.removed, true);

  // Restored from the list of sections: back in its place, shown.
  await save(fixture, restoreSection(again, "fotosSujeto"));
  const restored = (await load(fixture)).find((section) => section.id === "fotosSujeto")!;
  assert.equal(restored.removed, undefined);
  assert.equal(restored.enabled, true);
});

test("a required section is never deleted, even if a deleted one was stored", async () => {
  const fixture = await createValuationFixture();
  const loaded = await load(fixture);
  assert.equal(removeSection(loaded, "conclusiones"), loaded);
  // A payload that says otherwise (an older client, a hand-made request) is read back without it.
  const forced = loaded.map((section) => section.id === "conclusiones" ? { ...section, enabled: false, removed: true } : section);
  await save(fixture, forced);
  const conclusion = (await load(fixture)).find((section) => section.id === "conclusiones")!;
  assert.equal(conclusion.removed, undefined);
});
