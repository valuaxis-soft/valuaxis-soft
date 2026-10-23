/**
 * What the appraiser hides stays hidden: a section, a block or an apartado
 * hidden and saved is read back hidden, also after saving it again untouched,
 * and shows once he shows it again. Apartados used to come back visible: the
 * save sent them as visible and the read ignored what was stored.
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

const GENERALES = "CONSIDERACIONES GENERALES";

const consideraciones = (sections: AppSection[]) => sections.find((section) => section.id === "consideraciones")!;
const generales = (sections: AppSection[]) => consideraciones(sections).blocks[0].apartados.find((apartado) => apartado.title === GENERALES)!;

/** Hides the apartado, the second block of Construcciones and the Indirectos section. */
function hideAll(sections: AppSection[]): AppSection[] {
  return sections.map((section) => {
    if (section.id === "consideraciones") {
      return {
        ...section,
        blocks: section.blocks.map((block, index) => index !== 0 ? block : {
          ...block,
          apartados: block.apartados.map((apartado) => apartado.title === GENERALES ? { ...apartado, enabled: false } : apartado),
        }),
      };
    }
    if (section.id === "construccion") {
      return { ...section, blocks: section.blocks.map((block, index) => index === 1 ? { ...block, enabled: false } : block) };
    }
    if (section.id === "indirectos") return { ...section, enabled: false };
    return section;
  });
}

test("hidden sections, blocks and apartados are read back hidden, and shown again when the appraiser shows them", async () => {
  const fixture = await createValuationFixture();
  const initial = await load(fixture);
  assert.equal(generales(initial).enabled, true, "the template starts it visible");
  const construccionBlockId = initial.find((section) => section.id === "construccion")!.blocks[1].id;

  await save(fixture, hideAll(initial));
  const reloaded = await load(fixture);
  assert.equal(generales(reloaded).enabled, false, "the apartado stays hidden");
  assert.equal(consideraciones(reloaded).blocks[0].apartados.filter((apartado) => apartado.enabled).length, 2, "the other apartados still show");
  assert.equal(reloaded.find((section) => section.id === "construccion")!.blocks.find((block) => block.id === construccionBlockId)!.enabled, false);
  assert.equal(reloaded.find((section) => section.id === "indirectos")!.enabled, false);

  // Saved again as it was read (autosave, another edit elsewhere): still hidden.
  await save(fixture, reloaded);
  const again = await load(fixture);
  assert.equal(generales(again).enabled, false);
  assert.deepEqual(generales(again).concepts.map((concept) => concept.label), ["Criterio técnico", "Fundamento legal"], "its content is kept");

  // Shown again: it is read back visible.
  const shown = again.map((section) => section.id !== "consideraciones" ? section : {
    ...section,
    blocks: section.blocks.map((block, index) => index !== 0 ? block : {
      ...block,
      apartados: block.apartados.map((apartado) => apartado.title === GENERALES ? { ...apartado, enabled: true } : apartado),
    }),
  });
  await save(fixture, shown);
  assert.equal(generales(await load(fixture)).enabled, true);
});
