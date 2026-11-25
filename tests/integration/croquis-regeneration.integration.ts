/**
 * Legal matrix 1.5 bis (25 nov 2026): the croquis stored over a Google
 * image are drawn again over OpenStreetMap from the valuation's saved
 * croquis data (`pnpm maps:regenerate-croquis`). A dry run writes nothing;
 * the run replaces the picture under the same key (the document does not
 * change), skips concluded valuations unless asked, never touches an image
 * the appraiser uploaded, and does not redraw what is already OpenStreetMap.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import sharp from "sharp";

import { storeEditorImage } from "../../src/features/files/services/editor-image";
import { DEFAULT_CROQUIS_SETTINGS } from "../../src/features/maps/croquis";
import { withCroquisImage, withInsertedCroquis } from "../../src/features/maps/croquis-document";
import { regenerateCroquis } from "../../src/features/maps/server/croquis-regeneration.service";
import type { CroquisRenderInput } from "../../src/features/maps/server/croquis-image.service";
import { saveSubjectLocation } from "../../src/features/maps/server/subject-location.service";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { assertLocalDatabase, createValuationFixture, prisma } from "./support";

assertLocalDatabase();
after(() => prisma.$disconnect());

const SUBJECT = [20.63442, -103.40239] as const;

const jpegOf = (color: string) => sharp({ create: { width: 1280, height: 800, channels: 3, background: color } }).jpeg().toBuffer();

test("the old croquis are counted on a dry run, drawn again on the run, and concluded valuations wait for their flag", async () => {
  const fixture = await createValuationFixture();
  const user = { ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] };
  await saveSubjectLocation(fixture.publicId, user, {
    location: { point: SUBJECT, address: "Calle Inventada 10, Zapopan", source: "busqueda" },
    croquis: { ...DEFAULT_CROQUIS_SETTINGS, micro: { offset: [0.0002, 0], zoom: 18 } },
  });

  // As the generator stored them until today (over Google, «uso» CROQUIS without a base), and an image uploaded by hand.
  const google = await storeEditorImage(user, new File([new Uint8Array(await jpegOf("#a0c0e0"))], "croquis-microlocalizacion.jpg", { type: "image/jpeg" }), "CROQUIS");
  const uploaded = await storeEditorImage(user, new File([new Uint8Array(await jpegOf("#e0c0a0"))], "foto.jpg", { type: "image/jpeg" }));
  const sections = initialSectionsFor((await getValuationByPublicId(fixture.publicId, fixture.organizationId))!);
  const placed = withCroquisImage(sections, { kind: "micro", src: google.url, marker: { kind: "micro", labels: [{ name: "Calle Inventada", point: [SUBJECT[0], SUBJECT[1] + 0.0003], angle: 10 }] } }).sections;
  const ownBlock = { id: "bloque-croquis-a-mano", title: "Ubicación", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [] };
  const withBlock = placed.map((section) => (section.id === "terreno" ? { ...section, blocks: [...section.blocks, ownBlock] } : section));
  const both = withInsertedCroquis(withBlock, { sectionId: "terreno", blockId: ownBlock.id }, [{ kind: "macro", src: uploaded.url, marker: { kind: "macro" } }]).sections;
  await saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user, sections: buildSectionsPayload(both) });

  const before = await prisma.archivo.findFirstOrThrow({ where: { SClaveObjeto: google.key } });
  const rendered: CroquisRenderInput[] = [];
  const render = async (input: CroquisRenderInput) => {
    rendered.push(input);
    return jpegOf("#f2efe9");
  };
  const options = { organizationId: fixture.organizationId, render };

  // Dry run: counts, nothing drawn or written.
  const dry = await regenerateCroquis({ ...options, apply: false });
  assert.deepEqual(
    { valuations: dry.valuations, croquis: dry.croquis, regenerated: dry.regenerated, notGenerated: dry.notGenerated, concluded: dry.concluded, failed: dry.failed },
    { valuations: 1, croquis: 2, regenerated: 1, notGenerated: 1, concluded: 0, failed: 0 },
  );
  assert.equal(rendered.length, 0);
  assert.equal((await prisma.archivo.findFirstOrThrow({ where: { SClaveObjeto: google.key } })).SChecksum, before.SChecksum);

  // Concluded: left alone unless asked.
  await prisma.avaluo.update({ where: { UIdentificadorPublico: fixture.publicId }, data: { BBloqueado: true, DFechaBloqueo: new Date() } });
  const waiting = await regenerateCroquis({ ...options, apply: true });
  assert.equal(waiting.concluded, 1);
  assert.equal(waiting.regenerated, 0);
  assert.equal(rendered.length, 0);

  const run = await regenerateCroquis({ ...options, apply: true, includeConcluded: true });
  assert.equal(run.regenerated, 1);
  assert.equal(run.failed, 0);
  // Drawn from what the valuation keeps: the image's own kind and names, the frame of the settings, the subject's pin.
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].kind, "micro");
  assert.equal(rendered[0].zoom, 18);
  assert.deepEqual(rendered[0].subject, SUBJECT);
  assert.deepEqual(rendered[0].labels?.map((label) => label.name), ["Calle Inventada"]);
  // The same key with a new picture: the document keeps pointing to it.
  const after = await prisma.archivo.findFirstOrThrow({ where: { SClaveObjeto: google.key } });
  assert.notEqual(after.SChecksum, before.SChecksum);
  assert.equal((after.JMetadatos as Record<string, unknown>).base, "openstreetmap");
  assert.equal((after.JMetadatos as Record<string, unknown>).uso, "CROQUIS");
  // The image uploaded by hand is never touched.
  assert.deepEqual((await prisma.archivo.findFirstOrThrow({ where: { SClaveObjeto: uploaded.key } })).JMetadatos, { uso: "IMAGEN_EDITOR" });

  // Again: nothing left to draw.
  const again = await regenerateCroquis({ ...options, apply: true, includeConcluded: true });
  assert.equal(again.alreadyOpenStreetMap, 1);
  assert.equal(again.regenerated, 0);
  assert.equal(rendered.length, 1);
});
