import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Prisma } from "@prisma/client";
import { firmSettingsSchema } from "../../src/features/firm/firm-schemas";
import { getFirmSettings, getValuationDefaults, saveFirmSettings } from "../../src/features/firm/firm.service";
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

const ana = { name: "Arq. Ana Ruiz", cedula: "7654321", role: "Perito valuador" };
const beto = { name: "Ing. Beto Díaz", cedula: "1234567", role: "" };
const sections = [{ id: "costos", label: "ENF. COSTOS", title: "ENF. COSTOS", blocks: [{ id: "bloque", title: "Bloque", concepts: [{ id: "concepto", label: "Campo", value: "1" }] }] }];

const save = (fixture: Fixture, caratula: CaratulaPayload) =>
  saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections, caratula });

const read = async (fixture: Fixture) => (await getValuationByPublicId(fixture.publicId, fixture.organizationId))!.caratula!;

async function caratulaRow(fixture: Fixture) {
  const { IdVersionTrabajo } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  return prisma.caratulaAvaluo.findUniqueOrThrow({ where: { IdVersionAvaluo: IdVersionTrabajo! } });
}

const rejects400 = (promise: Promise<unknown>, message: RegExp) =>
  assert.rejects(promise, (error: Error & { status?: number }) => error.status === 400 && message.test(error.message));

/* ------------------------------------------------------------------ */
/*  Save and read                                                      */
/* ------------------------------------------------------------------ */

test("signatures and validity months are saved, trimmed, in order, and read back", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, { fechaAvaluo: "2026-08-31", mesesVigencia: 6, firmas: [{ name: "  Arq. Ana Ruiz ", cedula: " 7654321 ", role: "Perito valuador" }, { name: "Ing. Beto Díaz", cedula: "1234567" }] });

  const caratula = await read(fixture);
  assert.deepEqual(caratula.firmas, [ana, beto]);
  assert.equal(caratula.mesesVigencia, 6);
  assert.equal(caratula.fechaVigencia, "2027-02-28", "the valuation date plus the months, clamped to the month's end");

  const row = await caratulaRow(fixture);
  assert.equal(row.SNombreValuador, "Arq. Ana Ruiz", "the single-signer columns follow the first signature");
  assert.equal(row.SRegistroValuador, "7654321");

  // Reordered, one removed, another validity: the list is replaced.
  await save(fixture, { fechaAvaluo: "2026-08-31", mesesVigencia: 1, firmas: [beto] });
  const next = await read(fixture);
  assert.deepEqual(next.firmas, [beto]);
  assert.equal(next.mesesVigencia, 1);
  assert.equal(next.fechaVigencia, "2026-09-30");

  await save(fixture, { fechaAvaluo: "2026-08-31", mesesVigencia: 12, firmas: [] });
  assert.deepEqual((await read(fixture)).firmas, []);
  assert.equal((await caratulaRow(fixture)).SNombreValuador, null);
});

test("one signature or twenty are stored; a save without the list leaves it as it was", async () => {
  const fixture = await createValuationFixture();
  const twenty = Array.from({ length: 20 }, (_, index) => ({ name: `Perito ${index + 1}`, cedula: `C-${index + 1}`, role: "" }));
  await save(fixture, { mesesVigencia: 8, firmas: twenty });
  assert.deepEqual((await read(fixture)).firmas, twenty);

  await save(fixture, { solicitante: "Cliente", mesesVigencia: 8 });
  const caratula = await read(fixture);
  assert.equal(caratula.firmas.length, 20);
  assert.equal(caratula.fechaVigencia, "", "months without a valuation date reach no date yet");
});

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

test("incomplete signatures, more than twenty, or a validity outside 1 to 12 whole months are rejected and nothing is saved", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, { fechaAvaluo: "2026-09-28", mesesVigencia: 6, firmas: [ana] });

  await rejects400(save(fixture, { mesesVigencia: 6, firmas: [{ name: "", cedula: "1" }] }), /Firma 1: Escribe el nombre/);
  await rejects400(save(fixture, { mesesVigencia: 6, firmas: Array.from({ length: 21 }, () => ana) }), /máximo 20 firmas/);
  await rejects400(save(fixture, { mesesVigencia: 6, firmas: "Ana" }), /Las firmas no son válidas/);
  for (const months of [0, 13, 24, 6.5]) {
    await rejects400(save(fixture, { fechaAvaluo: "2026-09-28", mesesVigencia: months, firmas: [beto] }), /de 1 a 12 meses completos/);
  }

  const caratula = await read(fixture);
  assert.deepEqual(caratula.firmas, [ana]);
  assert.equal(caratula.mesesVigencia, 6);
  assert.equal(caratula.fechaVigencia, "2027-03-28");
});

test("the database rejects validity months outside 1 to 12 and signatures that are not a list", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, { mesesVigencia: 6, firmas: [ana] });
  const { IdCaratulaAvaluo } = await caratulaRow(fixture);
  for (const data of [{ IMesesVigencia: 0 }, { IMesesVigencia: 13 }, { JFirmas: { name: "Ana" } }]) {
    await assert.rejects(prisma.caratulaAvaluo.update({ where: { IdCaratulaAvaluo }, data }));
  }
  await assert.rejects(prisma.organizacion.update({ where: { IdOrganizacion: fixture.organizationId }, data: { JFirmas: "Ana" } }));
});

/* ------------------------------------------------------------------ */
/*  Data from before signatures were a list                            */
/* ------------------------------------------------------------------ */

test("a valuation with the old single signer shows it as the first signature, and its date as months", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, { valuador: "Ing. Álvaro Gutiérrez", registroValuador: "CED-12345", fechaAvaluo: "2026-09-28", fechaVigencia: "2027-03-28" });
  const row = await caratulaRow(fixture);
  assert.equal(row.JFirmas, null);
  assert.equal(row.IMesesVigencia, null);

  const caratula = await read(fixture);
  assert.deepEqual(caratula.firmas, [{ name: "Ing. Álvaro Gutiérrez", cedula: "CED-12345", role: "" }]);
  assert.equal(caratula.mesesVigencia, 6);
  assert.equal(caratula.fechaVigencia, "2027-03-28");

  // Adding a second signature from the editor keeps the old one first.
  await save(fixture, { fechaAvaluo: caratula.fechaAvaluo, mesesVigencia: caratula.mesesVigencia, firmas: [...caratula.firmas, ana] });
  assert.deepEqual((await read(fixture)).firmas, [{ name: "Ing. Álvaro Gutiérrez", cedula: "CED-12345", role: "" }, ana]);
});

test("an old validity that is not whole months keeps its date until the appraiser chooses the months", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, { valuador: "Sin cédula", fechaAvaluo: "2026-09-28", fechaVigencia: "2028-03-15" });
  const caratula = await read(fixture);
  assert.equal(caratula.mesesVigencia, null);
  assert.equal(caratula.fechaVigencia, "2028-03-15");
  assert.deepEqual(caratula.firmas, [{ name: "Sin cédula", cedula: "", role: "" }]);

  // The editor sends the list back as it read it: it is saved, but it cannot be concluded without the cédula.
  await save(fixture, { fechaAvaluo: "2026-09-28", fechaVigencia: "2028-03-15", firmas: caratula.firmas });
  await assert.rejects(
    concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user }),
    (error: unknown) => error instanceof Error && /Para concluir, completa las firmas.*Firma 1: Escribe la cédula profesional/.test(error.message),
  );
  await save(fixture, { fechaAvaluo: "2026-09-28", mesesVigencia: 12, firmas: [{ name: "Sin cédula", cedula: "99" }] });
  assert.equal((await read(fixture)).fechaVigencia, "2027-09-28");
});

/* ------------------------------------------------------------------ */
/*  Datos del despacho                                                 */
/* ------------------------------------------------------------------ */

test("the firm's signatures and validity seed new valuations; an incomplete old appraiser is not seeded", async () => {
  const fixture = await createValuationFixture();
  const defaults = () => prisma.$transaction((tx) => getValuationDefaults(tx, fixture.organizationId, new Date("2026-09-28T18:00:00Z")));

  await saveFirmSettings(fixture.user, firmSettingsSchema.parse({ validityMonths: 8, folioPrefix: "VDA", signers: [ana, beto] }));
  assert.deepEqual((await getFirmSettings(fixture.organizationId)).signers, [ana, beto]);
  assert.deepEqual(await defaults(), { folioPrefix: "VDA", signers: [ana, beto], valuationDate: "2026-09-28", validityMonths: 8 });
  const organization = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: fixture.organizationId } });
  assert.equal(organization.SNombrePerito, "Arq. Ana Ruiz");
  assert.equal(organization.SRegistroPerito, "7654321");

  // A firm saved before signatures were a list, whose appraiser has no registration.
  await prisma.organizacion.update({
    where: { IdOrganizacion: fixture.organizationId },
    data: { JFirmas: Prisma.DbNull, SNombrePerito: "Ing. Álvaro Gutiérrez", SRegistroPerito: null },
  });
  assert.deepEqual((await getFirmSettings(fixture.organizationId)).signers, [{ name: "Ing. Álvaro Gutiérrez", cedula: "", role: "" }]);
  assert.deepEqual((await defaults()).signers, []);

  assert.equal(firmSettingsSchema.safeParse({ validityMonths: 13, folioPrefix: "VDA" }).success, false);
});

/* ------------------------------------------------------------------ */
/*  Versions                                                           */
/* ------------------------------------------------------------------ */

test("a concluded version keeps its signatures and validity after reopening and editing", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, { fechaAvaluo: "2026-09-28", mesesVigencia: 6, firmas: [ana, beto] });
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user });
  const concluded = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  await reopenValuation({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: fixture.user,
    reason: "Agregar una firma",
    acceptedText: "Acepto reabrir el avalúo",
  });

  // The new working version starts with the same signatures.
  const reopened = await read(fixture);
  assert.deepEqual(reopened.firmas, [ana, beto]);
  assert.equal(reopened.mesesVigencia, 6);

  const carla = { name: "Lic. Carla Soto", cedula: "5550001", role: "Revisora" };
  await save(fixture, { fechaAvaluo: "2026-09-28", mesesVigencia: 12, firmas: [carla, ana] });
  const edited = await read(fixture);
  assert.deepEqual(edited.firmas, [carla, ana]);
  assert.equal(edited.fechaVigencia, "2027-09-28");

  const final = await prisma.caratulaAvaluo.findUniqueOrThrow({ where: { IdVersionAvaluo: concluded.IdVersionFinal! } });
  assert.notEqual(final.IdVersionAvaluo, (await caratulaRow(fixture)).IdVersionAvaluo);
  assert.deepEqual(final.JFirmas, [ana, beto]);
  assert.equal(final.IMesesVigencia, 6);
  assert.equal(final.DFechaVigencia?.toISOString().slice(0, 10), "2027-03-28");
});
