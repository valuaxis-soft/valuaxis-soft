import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { AuthUser } from "../../src/features/auth/model";
import { adjustCredits } from "../../src/features/billing/credits.service";
import { getDashboardSummary } from "../../src/features/dashboard/services/dashboard-summary.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

/** Makes the fixture's user a member of its organization with `roleKey`. */
async function joinWithRole(fixture: Fixture, roleKey: string): Promise<AuthUser> {
  const role = await prisma.rol.findUniqueOrThrow({ where: { SClave: roleKey } });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: fixture.organizationId, IdUsuario: fixture.user.id, IdRol: role.IdRol, DFechaModificacion: new Date() },
  });
  return { ...fixture.user, role: roleKey };
}

/** Another valuation of the fixture's organization, in `statusKey`, modified at `modifiedAt`. */
async function addValuation(fixture: Fixture, statusKey: string, options: { deleted?: boolean; modifiedAt?: Date; client?: string } = {}) {
  const template = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const status = await prisma.estadoAvaluo.findUniqueOrThrow({ where: { SClave: statusKey } });
  const row = await prisma.avaluo.create({
    data: {
      IdOrganizacion: fixture.organizationId,
      IdUsuarioCreador: template.IdUsuarioCreador,
      IdEstadoAvaluo: status.IdEstadoAvaluo,
      IdTipoAvaluo: template.IdTipoAvaluo,
      IdTipoInmueble: template.IdTipoInmueble,
      IdTipoOperacion: template.IdTipoOperacion,
      SFolio: `${template.SFolio}-${statusKey}-${Math.random().toString(36).slice(2, 7)}`,
      STitulo: `Avalúo ${statusKey}`,
      SNombreCliente: options.client ?? null,
      BActivo: !options.deleted,
      DFechaEliminacion: options.deleted ? new Date() : null,
      DFechaModificacion: options.modifiedAt ?? new Date(),
    },
  });
  return row.UIdentificadorPublico;
}

test("the dashboard counts only the organization's live valuations, per status in catalog order", async () => {
  const fixture = await createValuationFixture();
  const user = await joinWithRole(fixture, "ADMINISTRADOR");
  await addValuation(fixture, "EN_EDICION");
  await addValuation(fixture, "TERMINADO");
  await addValuation(fixture, "TERMINADO");
  await addValuation(fixture, "EN_EDICION", { deleted: true });

  // Another firm with plenty of valuations must not leak into the counts.
  const other = await createValuationFixture();
  for (const status of ["EN_EDICION", "TERMINADO", "EN_REVISION"]) await addValuation(other, status);

  const summary = await getDashboardSummary(user);
  const catalog = await prisma.estadoAvaluo.findMany({ where: { BActivo: true }, orderBy: [{ IOrden: "asc" }, { IdEstadoAvaluo: "asc" }] });

  assert.deepEqual(Object.keys(summary.valuations.byStatus), catalog.map((status) => status.SClave.toLowerCase()), "every status, in catalog order");
  assert.equal(summary.valuations.byStatus.nuevo, 1);
  assert.equal(summary.valuations.byStatus.en_edicion, 1, "the deleted one is not counted");
  assert.equal(summary.valuations.byStatus.terminado, 2);
  assert.equal(summary.valuations.byStatus.en_revision, 0, "the other firm's review is not counted");
  assert.equal(summary.valuations.total, 4);
  assert.equal(summary.valuations.active, 2, "concluded valuations are not active");
  assert.equal(summary.limits.activeValuations, 2);
  assert.deepEqual(summary.organization, { id: fixture.organizationId, name: fixture.user.organizationName });
  assert.deepEqual(summary.user, { id: user.id, name: user.name, email: user.email, role: "ADMINISTRADOR" });
});

test("recent valuations are the five last modified of the organization, never another firm's", async () => {
  const fixture = await createValuationFixture();
  const user = await joinWithRole(fixture, "VALUADOR");
  const base = Date.now() - 60 * 60 * 1000;
  const ids: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    ids.push(await addValuation(fixture, "EN_EDICION", { modifiedAt: new Date(base + index * 1000), client: `Cliente ${index}` }));
  }
  await prisma.avaluo.update({ where: { UIdentificadorPublico: fixture.publicId }, data: { DFechaModificacion: new Date(base - 1000) } });
  const other = await createValuationFixture();
  const foreign = await addValuation(other, "EN_EDICION", { modifiedAt: new Date() });

  const summary = await getDashboardSummary(user);
  assert.equal(summary.valuations.total, 7);
  assert.deepEqual(summary.valuations.recent.map((item) => item.id), ids.slice(1).reverse(), "newest first, five of them");
  assert.ok(!summary.valuations.recent.some((item) => item.id === foreign));
  assert.equal(summary.valuations.recent[0].client, "Cliente 5");
  assert.equal(summary.valuations.recent[0].status, "en_edicion");
});

test("actions follow the member's role in the organization", async () => {
  const admin = await getDashboardSummary(await joinWithRole(await createValuationFixture(), "ADMINISTRADOR"));
  assert.deepEqual(admin.actions, { canCreateValuation: true, canExport: true });

  const reviewer = await getDashboardSummary(await joinWithRole(await createValuationFixture(), "REVISOR"));
  assert.deepEqual(reviewer.actions, { canCreateValuation: false, canExport: true });

  const readOnly = await getDashboardSummary(await joinWithRole(await createValuationFixture(), "CONSULTA"));
  assert.deepEqual(readOnly.actions, { canCreateValuation: false, canExport: true });
});

test("a user who is not a member gets no actions and no subscription, even if the session names the organization", async () => {
  const fixture = await createValuationFixture();
  // The fixture's user never joined: permissions in the session object are not trusted.
  const summary = await getDashboardSummary({ ...fixture.user, permissions: ["AVALUO_CREAR", "AVALUO_EXPORTAR"] });
  assert.deepEqual(summary.actions, { canCreateValuation: false, canExport: false });
  assert.deepEqual(summary.subscription, { plan: null, status: null, enabledFeatures: [] });
});

test("a removed member loses the actions", async () => {
  const fixture = await createValuationFixture();
  const user = await joinWithRole(fixture, "ADMINISTRADOR");
  await prisma.miembroOrganizacion.updateMany({ where: { IdOrganizacion: fixture.organizationId, IdUsuario: user.id }, data: { BActivo: false } });
  const summary = await getDashboardSummary(user);
  assert.deepEqual(summary.actions, { canCreateValuation: false, canExport: false });
});

test("an organization without valuations shows zero everywhere", async () => {
  const fixture = await createValuationFixture();
  await prisma.avaluo.update({ where: { UIdentificadorPublico: fixture.publicId }, data: { BActivo: false, DFechaEliminacion: new Date() } });
  const summary = await getDashboardSummary(await joinWithRole(fixture, "ADMINISTRADOR"));
  assert.equal(summary.valuations.total, 0);
  assert.equal(summary.valuations.active, 0);
  assert.deepEqual(summary.valuations.recent, []);
  assert.ok(Object.values(summary.valuations.byStatus).every((count) => count === 0));
});

test("a cancelled valuation is not counted as active", async () => {
  const fixture = await createValuationFixture();
  const user = await joinWithRole(fixture, "ADMINISTRADOR");
  await addValuation(fixture, "CANCELADO");
  const summary = await getDashboardSummary(user);
  assert.equal(summary.valuations.total, 2);
  assert.equal(summary.valuations.byStatus.cancelado, 1);
  assert.equal(summary.valuations.active, 1, "only the NUEVO one is active");
});

test("attention lists the firm's open valuations to conclude, without comparables or idle a month, never another firm's", async () => {
  const fixture = await createValuationFixture();
  const user = await joinWithRole(fixture, "ADMINISTRADOR");
  const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  const inReview = await addValuation(fixture, "EN_REVISION");
  const editing = await addValuation(fixture, "EN_EDICION");
  const staleNew = await addValuation(fixture, "NUEVO", { modifiedAt: longAgo });
  const finished = await addValuation(fixture, "TERMINADO", { modifiedAt: longAgo });
  const archived = await addValuation(fixture, "EN_REVISION");
  await prisma.avaluo.update({ where: { UIdentificadorPublico: archived }, data: { DFechaArchivo: new Date() } });
  // DFechaModificacion is @updatedAt: the backdate goes through raw SQL so Prisma does not overwrite it.
  await prisma.$executeRaw`UPDATE devpware_avaluos SET "DFechaModificacion" = ${longAgo} WHERE "UIdentificadorPublico" = ${staleNew}::uuid`;
  const other = await createValuationFixture();
  const foreign = await addValuation(other, "EN_REVISION");

  const summary = await getDashboardSummary(user);
  const byId = new Map(summary.attention.map((item) => [item.id, item.reasons]));
  assert.deepEqual(byId.get(inReview), ["to-conclude", "no-comparables"]);
  assert.deepEqual(byId.get(editing), ["no-comparables"]);
  assert.deepEqual(byId.get(staleNew), ["stale-draft"]);
  assert.ok(!byId.has(fixture.publicId), "a fresh NUEVO one waits for nothing");
  assert.ok(!byId.has(finished), "closed work never needs attention");
  assert.ok(!byId.has(archived), "archived ones are out of the way");
  assert.ok(!byId.has(foreign), "another firm's valuations never show");
  assert.equal(summary.attention[0].id, inReview, "the ones to conclude come first");
});

test("recent activity shows the firm's status changes and nothing to a non-member", async () => {
  const fixture = await createValuationFixture();
  const user = await joinWithRole(fixture, "CONSULTA");
  const valuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const [nuevo, edicion] = await Promise.all([
    prisma.estadoAvaluo.findUniqueOrThrow({ where: { SClave: "NUEVO" } }),
    prisma.estadoAvaluo.findUniqueOrThrow({ where: { SClave: "EN_EDICION" } }),
  ]);
  await prisma.estadoAvaluoHistorial.create({
    data: { IdAvaluo: valuation.IdAvaluo, IdUsuario: user.id, IdEstadoAnterior: nuevo.IdEstadoAvaluo, IdEstadoNuevo: edicion.IdEstadoAvaluo },
  });
  const other = await createValuationFixture();
  const otherValuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: other.publicId } });
  await prisma.estadoAvaluoHistorial.create({
    data: { IdAvaluo: otherValuation.IdAvaluo, IdUsuario: other.user.id, IdEstadoAnterior: nuevo.IdEstadoAvaluo, IdEstadoNuevo: edicion.IdEstadoAvaluo },
  });

  const summary = await getDashboardSummary(user);
  assert.equal(summary.activity.length, 1, "only this firm's change");
  assert.equal(summary.activity[0].valuationId, fixture.publicId);
  assert.equal(summary.activity[0].from, "nuevo");
  assert.equal(summary.activity[0].to, "en_edicion");
  assert.equal(summary.credits, null, "Consulta does not see the billing");

  const outsider = await getDashboardSummary({ ...other.user, permissions: ["AVALUO_VER"] });
  assert.deepEqual(outsider.activity, [], "not a member: the session permissions are not trusted");
  assert.deepEqual(outsider.attention, []);
});

test("credits show only while the firm pays per valuation, to who sees the billing", async () => {
  const fixture = await createValuationFixture();
  const admin = await joinWithRole(fixture, "ADMINISTRADOR");
  assert.equal((await getDashboardSummary(admin)).credits, null, "charge off: no balance card");

  await prisma.organizacion.update({ where: { IdOrganizacion: fixture.organizationId }, data: { BCobroPorAvaluo: true } });
  await adjustCredits({ organizationId: fixture.organizationId, credits: 5, reason: "Prueba" });
  assert.deepEqual((await getDashboardSummary(admin)).credits, { balance: 5 });
});
