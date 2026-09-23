import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import {
  countValuationsByStatus,
  listValuationStatuses,
  listValuationsPage,
} from "../../src/features/valuations/repositories/valuation.repository";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

let orgA: Fixture;
let orgB: Fixture;
const marker = randomUUID().slice(0, 6);

/** Adds valuations to the fixture's organization reusing its creator and catalogs. */
async function addValuation(
  fixture: Fixture,
  data: { folio: string; title: string; client?: string; status?: string; modifiedAt: Date },
) {
  const base = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const status = await prisma.estadoAvaluo.findUniqueOrThrow({ where: { SClave: data.status ?? "NUEVO" } });
  const created = await prisma.avaluo.create({
    data: {
      IdOrganizacion: base.IdOrganizacion,
      IdUsuarioCreador: base.IdUsuarioCreador,
      IdEstadoAvaluo: status.IdEstadoAvaluo,
      IdTipoAvaluo: base.IdTipoAvaluo,
      IdTipoInmueble: base.IdTipoInmueble,
      IdTipoOperacion: base.IdTipoOperacion,
      SFolio: data.folio,
      STitulo: data.title,
      SNombreCliente: data.client ?? null,
      DFechaModificacion: data.modifiedAt,
    },
  });
  // @updatedAt overrides the value on create; pin it so the order is deterministic.
  await prisma.$executeRaw`UPDATE devpware_avaluos SET "DFechaModificacion" = ${data.modifiedAt} WHERE "IdAvaluo" = ${created.IdAvaluo}`;
  return created;
}

before(async () => {
  orgA = await createValuationFixture();
  orgB = await createValuationFixture();

  const start = Date.UTC(2026, 0, 1);
  for (let index = 1; index <= 24; index += 1) {
    await addValuation(orgA, {
      folio: `A-${marker}-${String(index).padStart(2, "0")}`,
      title: index % 2 === 0 ? `Casa Jardín ${marker}` : `Departamento ${marker}`,
      client: index === 7 ? `Banco Occidente ${marker}` : `Particular ${index}`,
      status: index <= 3 ? "TERMINADO" : "NUEVO",
      modifiedAt: new Date(start + index * 60_000),
    });
  }
  // Same searchable text in another organization: must never leak into org A.
  await addValuation(orgB, {
    folio: `A-${marker}-99`,
    title: `Casa Jardín ${marker}`,
    client: `Banco Occidente ${marker}`,
    modifiedAt: new Date(start + 99 * 60_000),
  });

  // A soft-deleted valuation is excluded.
  const deleted = await addValuation(orgA, {
    folio: `A-${marker}-DEL`,
    title: `Casa Jardín ${marker}`,
    modifiedAt: new Date(start),
  });
  await prisma.avaluo.update({
    where: { IdAvaluo: deleted.IdAvaluo },
    data: { BActivo: false, DFechaEliminacion: new Date() },
  });
});

test("paginates with skip/take and returns the full count", async () => {
  const first = await listValuationsPage({ organizationId: orgA.organizationId, page: 1, pageSize: 10 });
  const third = await listValuationsPage({ organizationId: orgA.organizationId, page: 3, pageSize: 10 });

  // 24 added + the fixture's own valuation.
  assert.equal(first.total, 25);
  assert.equal(first.items.length, 10);
  assert.equal(third.total, 25);
  assert.equal(third.items.length, 5);

  // Most recently modified first: the fixture's own valuation was modified "now".
  assert.equal(first.items[0].id, orgA.publicId);
  assert.equal(first.items[1].folio, `A-${marker}-24`);
  assert.equal(first.items[9].folio, `A-${marker}-16`);
  assert.equal(third.items[4].folio, `A-${marker}-01`);

  const second = await listValuationsPage({ organizationId: orgA.organizationId, page: 2, pageSize: 10 });
  const seen = new Set([...first.items, ...second.items, ...third.items].map((item) => item.id));
  assert.equal(seen.size, 25, "pages do not overlap");

  const beyond = await listValuationsPage({ organizationId: orgA.organizationId, page: 9, pageSize: 10 });
  assert.equal(beyond.items.length, 0);
  assert.equal(beyond.total, 25);
});

test("searches folio, title and client case-insensitively", async () => {
  const byTitle = await listValuationsPage({
    organizationId: orgA.organizationId,
    page: 1,
    pageSize: 50,
    q: `casa jardín ${marker}`.toUpperCase(),
  });
  assert.equal(byTitle.total, 12);
  assert.ok(byTitle.items.every((item) => item.title.startsWith("Casa Jardín")));

  const byFolio = await listValuationsPage({
    organizationId: orgA.organizationId,
    page: 1,
    pageSize: 50,
    q: `a-${marker}-0`,
  });
  assert.equal(byFolio.total, 9);

  const byClient = await listValuationsPage({
    organizationId: orgA.organizationId,
    page: 1,
    pageSize: 50,
    q: `occidente ${marker}`,
  });
  assert.deepEqual(byClient.items.map((item) => item.folio), [`A-${marker}-07`]);
});

test("filters by status key", async () => {
  const finished = await listValuationsPage({
    organizationId: orgA.organizationId,
    page: 1,
    pageSize: 50,
    status: "terminado",
  });
  assert.equal(finished.total, 3);
  assert.ok(finished.items.every((item) => item.status === "terminado"));

  const combined = await listValuationsPage({
    organizationId: orgA.organizationId,
    page: 1,
    pageSize: 50,
    status: "TERMINADO",
    q: `casa jardín ${marker}`,
  });
  assert.deepEqual(combined.items.map((item) => item.folio), [`A-${marker}-02`]);
});

test("never returns another organization's valuations", async () => {
  const everything = await listValuationsPage({
    organizationId: orgA.organizationId,
    page: 1,
    pageSize: 100,
    q: marker,
  });
  assert.ok(everything.items.every((item) => item.folio !== `A-${marker}-99`));
  assert.ok(everything.items.every((item) => item.id !== orgB.publicId));
  assert.ok(everything.items.every((item) => !item.folio.endsWith("-DEL")));

  const orgBPage = await listValuationsPage({ organizationId: orgB.organizationId, page: 1, pageSize: 100 });
  assert.equal(orgBPage.total, 2);
  assert.ok(orgBPage.items.every((item) => !item.folio.startsWith(`A-${marker}-0`)));
});

test("counts by status per organization and exposes the catalog", async () => {
  assert.deepEqual(await countValuationsByStatus(orgA.organizationId), { nuevo: 22, terminado: 3 });
  assert.deepEqual(await countValuationsByStatus(orgB.organizationId), { nuevo: 2 });

  const statuses = await listValuationStatuses();
  const keys = statuses.map((status) => status.key);
  for (const key of ["nuevo", "en_edicion", "en_revision", "terminado", "reabierto", "cancelado"]) {
    assert.ok(keys.includes(key), `catalog has ${key}`);
  }
});
