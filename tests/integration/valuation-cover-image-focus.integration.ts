import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import {
  concludeValuation,
  reopenValuation,
  saveValuationSections,
  type CaratulaPayload,
} from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const sections = [{ id: "costos", label: "ENF. COSTOS", title: "ENF. COSTOS", blocks: [{ id: "bloque", title: "Bloque", concepts: [{ id: "concepto", label: "Campo", value: "1" }] }] }];
const signer = { name: "Arq. Ana Ruiz", cedula: "7654321", role: "" };

const save = (fixture: Fixture, caratula: CaratulaPayload) =>
  saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections, caratula });

const focus = async (fixture: Fixture) => (await getValuationByPublicId(fixture.publicId, fixture.organizationId))!.caratula!.enfoqueImagenPrincipal;

async function caratulaRow(fixture: Fixture) {
  const { IdVersionTrabajo } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  return prisma.caratulaAvaluo.findUniqueOrThrow({ where: { IdVersionAvaluo: IdVersionTrabajo! } });
}

test("the cover image focus is saved with the carátula and read back; a carátula never framed is centered", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, { folio: "VLO-1" });
  assert.deepEqual(await focus(fixture), { x: 50, y: 50 });
  assert.equal((await caratulaRow(fixture)).IEnfoqueImagenX, null);

  await save(fixture, { folio: "VLO-1", enfoqueImagenPrincipal: { x: 20, y: 85 } });
  assert.deepEqual(await focus(fixture), { x: 20, y: 85 });

  // A save that does not send the focus leaves it as it was.
  await save(fixture, { folio: "VLO-2" });
  assert.deepEqual(await focus(fixture), { x: 20, y: 85 });

  // Out of range or unreadable values never reach the database as such.
  await save(fixture, { enfoqueImagenPrincipal: { x: -30, y: 140.4 } });
  assert.deepEqual(await focus(fixture), { x: 0, y: 100 });
  await save(fixture, { enfoqueImagenPrincipal: "arriba" });
  assert.deepEqual(await focus(fixture), { x: 50, y: 50 });
});

test("the database rejects a focus outside 0 to 100", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, { folio: "VLO-1" });
  const { IdCaratulaAvaluo } = await caratulaRow(fixture);
  for (const data of [{ IEnfoqueImagenX: -1 }, { IEnfoqueImagenX: 101 }, { IEnfoqueImagenY: 101 }]) {
    await assert.rejects(prisma.caratulaAvaluo.update({ where: { IdCaratulaAvaluo }, data }));
  }
});

test("a reopened valuation starts with the focus of the concluded version, which keeps its own", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, { fechaAvaluo: "2026-09-28", mesesVigencia: 6, firmas: [signer], enfoqueImagenPrincipal: { x: 35, y: 10 } });
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user });
  const concluded = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  await reopenValuation({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: fixture.user,
    reason: "Mover la imagen",
    acceptedText: "Acepto reabrir el avalúo",
  });
  assert.deepEqual(await focus(fixture), { x: 35, y: 10 });

  await save(fixture, { fechaAvaluo: "2026-09-28", mesesVigencia: 6, firmas: [signer], enfoqueImagenPrincipal: { x: 80, y: 60 } });
  assert.deepEqual(await focus(fixture), { x: 80, y: 60 });

  const { IdVersionTrabajo } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const versions = await prisma.caratulaAvaluo.findMany({
    where: { versionAvaluo: { IdAvaluo: concluded.IdAvaluo }, IdVersionAvaluo: { not: IdVersionTrabajo! } },
    select: { IEnfoqueImagenX: true, IEnfoqueImagenY: true },
  });
  assert.deepEqual(versions, [{ IEnfoqueImagenX: 35, IEnfoqueImagenY: 10 }]);
});
