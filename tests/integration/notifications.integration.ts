/**
 * In-app notifications (migration 060): who receives each event, that a
 * person only sees their own in the open firm (plus their personal ones),
 * marking read, the preferences of «Mi cuenta» and the 90 days.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { updateNotificationPreferences } from "../../src/features/account/user-preferences.service";
import {
  notifyAccreditationResolved,
  notifyLowCredits,
  notifyMemberJoined,
  notifyValuationEvent,
} from "../../src/features/notifications/notification-events";
import { listNotifications, markNotificationsRead, notify } from "../../src/features/notifications/notifications.service";
import { createAuthUserFixture, prisma } from "./support";

after(async () => {
  await prisma.$disconnect();
});

/** A team with an administrator, an appraiser and a reviewer (invented people), and a valuation the administrator assigned to the appraiser. */
async function createTeam() {
  const suffix = randomUUID().slice(0, 8);
  const [admin, appraiser, reviewer] = await Promise.all([
    createAuthUserFixture({ label: "notif-admin" }),
    createAuthUserFixture({ label: "notif-valuador" }),
    createAuthUserFixture({ label: "notif-revisor" }),
  ]);
  const [orgState, valuationState, appraisalType, propertyType, operationType, roles] = await Promise.all([
    prisma.estadoOrganizacion.findUniqueOrThrow({ where: { SClave: "ACTIVA" } }),
    prisma.estadoAvaluo.findUniqueOrThrow({ where: { SClave: "NUEVO" } }),
    prisma.tipoAvaluo.findFirstOrThrow({ where: { BActivo: true } }),
    prisma.tipoInmueble.findFirstOrThrow({ where: { BActivo: true } }),
    prisma.tipoOperacion.findFirstOrThrow({ where: { BActivo: true } }),
    prisma.rol.findMany({ where: { SClave: { in: ["ADMINISTRADOR", "VALUADOR", "REVISOR"] } } }),
  ]);
  const roleId = (key: string) => roles.find((role) => role.SClave === key)!.IdRol;
  const team = await prisma.organizacion.create({
    data: { IdEstadoOrganizacion: orgState.IdEstadoOrganizacion, SNombre: `Despacho ${suffix}`, SSlug: `notif-${suffix}`, STipoAmbito: "TEAM" },
  });
  await prisma.miembroOrganizacion.createMany({
    data: [
      { IdOrganizacion: team.IdOrganizacion, IdUsuario: admin.userId, IdRol: roleId("ADMINISTRADOR") },
      { IdOrganizacion: team.IdOrganizacion, IdUsuario: appraiser.userId, IdRol: roleId("VALUADOR") },
      { IdOrganizacion: team.IdOrganizacion, IdUsuario: reviewer.userId, IdRol: roleId("REVISOR") },
    ],
  });
  const valuation = await prisma.avaluo.create({
    data: {
      IdOrganizacion: team.IdOrganizacion,
      IdUsuarioCreador: admin.userId,
      IdUsuarioResponsable: appraiser.userId,
      IdEstadoAvaluo: valuationState.IdEstadoAvaluo,
      IdTipoAvaluo: appraisalType.IdTipoAvaluo,
      IdTipoInmueble: propertyType.IdTipoInmueble,
      IdTipoOperacion: operationType.IdTipoOperacion,
      SFolio: `NOT-${suffix}`,
      STitulo: "Casa de prueba",
      DFechaModificacion: new Date(),
    },
  });
  const viewer = (user: { userId: number }) => ({ id: user.userId, organizationId: team.IdOrganizacion });
  const actor = (user: { userId: number }, name: string) => ({ id: user.userId, name, organizationId: team.IdOrganizacion });
  return { team, admin, appraiser, reviewer, valuation, viewer, actor };
}

test("an assigned or concluded valuation reaches the responsible appraiser in the app, never the one who acted", async () => {
  const { admin, appraiser, reviewer, valuation, viewer, actor } = await createTeam();

  assert.equal(await notifyValuationEvent("asignado", valuation.UIdentificadorPublico, actor(admin, "Ana Admin")), 1);
  const list = await listNotifications(viewer(appraiser), { limit: 50 });
  assert.equal(list.unreadCount, 1);
  assert.equal(list.items[0].type, "AVALUO_ASIGNADO");
  assert.equal(list.items[0].title, `Te asignaron el avalúo ${valuation.SFolio}`);
  assert.equal(list.items[0].link, `/workspace?id=${valuation.UIdentificadorPublico}`);
  assert.equal((await listNotifications(viewer(admin), { limit: 50 })).items.length, 0, "the administrator did it");

  // Concluded by the appraiser: the creator (the administrator) hears, the appraiser does not.
  assert.equal(await notifyValuationEvent("concluido", valuation.UIdentificadorPublico, actor(appraiser, "Beto Valuador")), 1);
  assert.equal((await listNotifications(viewer(admin), { limit: 50 })).items[0].type, "AVALUO_CONCLUIDO");
  assert.equal((await listNotifications(viewer(appraiser), { limit: 50 })).items.length, 1);
  assert.equal((await listNotifications(viewer(reviewer), { limit: 50 })).items.length, 0);
});

test("the review hook: sent to review reaches whoever reviews; approved or returned reaches the responsible", async () => {
  const { admin, appraiser, reviewer, valuation, viewer, actor } = await createTeam();
  // Administrators and reviewers have AVALUO_REVISAR; the appraiser who sent it does not hear about it.
  assert.equal(await notifyValuationEvent("enviado_revision", valuation.UIdentificadorPublico, actor(appraiser, "Beto")), 2);
  assert.equal((await listNotifications(viewer(reviewer), { limit: 50 })).items[0].type, "AVALUO_EN_REVISION");
  assert.equal((await listNotifications(viewer(admin), { limit: 50 })).items[0].type, "AVALUO_EN_REVISION");

  await notifyValuationEvent("regresado", valuation.UIdentificadorPublico, actor(reviewer, "Rita"), { reason: "Falta el croquis" });
  const [returned] = (await listNotifications(viewer(appraiser), { limit: 50 })).items;
  assert.equal(returned.type, "AVALUO_REGRESADO");
  assert.equal(returned.body, "Rita regresó «Casa de prueba»: Falta el croquis");
});

test("a person sees only their own notices of the open firm, plus their personal ones", async () => {
  const { team, admin, appraiser, valuation, viewer, actor } = await createTeam();
  await notifyValuationEvent("asignado", valuation.UIdentificadorPublico, actor(admin, "Ana"));
  await notifyAccreditationResolved(appraiser.userId, "approve");

  // In the team: the assignment and the accreditation.
  assert.deepEqual((await listNotifications(viewer(appraiser), { limit: 50 })).items.map((item) => item.type).sort(), ["ACREDITACION_APROBADA", "AVALUO_ASIGNADO"]);
  // In their personal space: only the accreditation.
  const personal = await listNotifications({ id: appraiser.userId, organizationId: appraiser.organizationId }, { limit: 50 });
  assert.deepEqual(personal.items.map((item) => item.type), ["ACREDITACION_APROBADA"]);
  // An event of another firm cannot reach the team: the valuation is looked up in the actor's firm.
  assert.equal(await notifyValuationEvent("asignado", valuation.UIdentificadorPublico, { id: admin.userId, name: "Ana", organizationId: admin.organizationId }), 0);
  // A firm's notice to someone who is not a member is not written.
  assert.equal(await notify({ type: "MIEMBRO_NUEVO", organizationId: team.IdOrganizacion, recipientIds: [-1], title: "x" }), 0);
});

test("marking read: one, then all; nobody marks someone else's", async () => {
  const { admin, appraiser, valuation, viewer, actor } = await createTeam();
  await notifyValuationEvent("asignado", valuation.UIdentificadorPublico, actor(admin, "Ana"));
  await notifyValuationEvent("reabierto", valuation.UIdentificadorPublico, actor(admin, "Ana"), { reason: "Ajuste" });
  const { items } = await listNotifications(viewer(appraiser), { limit: 50 });
  assert.equal(items.length, 2);

  // The administrator sends the appraiser's id: nothing changes.
  await markNotificationsRead(viewer(admin), { ids: [items[0].id] });
  assert.equal((await listNotifications(viewer(appraiser), { limit: 50 })).unreadCount, 2);

  assert.equal(await markNotificationsRead(viewer(appraiser), { ids: [items[0].id] }), 1);
  const after = await listNotifications(viewer(appraiser), { limit: 50 });
  assert.equal(after.items.find((item) => item.id === items[0].id)?.read, true);
  assert.equal(await markNotificationsRead(viewer(appraiser), { all: true }), 0);
});

test("a group turned off in «Mi cuenta» stops arriving; the others still do", async () => {
  const { admin, appraiser, valuation, viewer, actor } = await createTeam();
  const saved = await updateNotificationPreferences(appraiser.userId, { estados: false });
  assert.equal(saved.estados, false);
  assert.equal(saved.asignaciones, true);
  // The autosave stored beside it is kept.
  await prisma.usuario.update({ where: { IdUsuario: appraiser.userId }, data: { JPreferencias: { autosaveSeconds: 60, notifications: { estados: false } } } });
  await updateNotificationPreferences(appraiser.userId, { equipo: false });
  const row = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: appraiser.userId }, select: { JPreferencias: true } });
  assert.deepEqual(row.JPreferencias, { autosaveSeconds: 60, notifications: { estados: false, equipo: false } });

  assert.equal(await notifyValuationEvent("concluido", valuation.UIdentificadorPublico, actor(admin, "Ana")), 0);
  assert.equal(await notifyValuationEvent("asignado", valuation.UIdentificadorPublico, actor(admin, "Ana")), 1);
  assert.deepEqual((await listNotifications(viewer(appraiser), { limit: 50 })).items.map((item) => item.type), ["AVALUO_ASIGNADO"]);
});

test("someone removed from the team stops receiving its notices", async () => {
  const { team, admin, appraiser, valuation, viewer, actor } = await createTeam();
  await prisma.miembroOrganizacion.updateMany({ where: { IdOrganizacion: team.IdOrganizacion, IdUsuario: appraiser.userId }, data: { BActivo: false } });
  assert.equal(await notifyValuationEvent("asignado", valuation.UIdentificadorPublico, actor(admin, "Ana")), 0);
  assert.equal((await listNotifications(viewer(appraiser), { limit: 50 })).items.length, 0);
});

test("a new member: the administrators hear about it, not the member", async () => {
  const { team, admin, appraiser, reviewer, viewer } = await createTeam();
  assert.equal(await notifyMemberJoined(team.IdOrganizacion, reviewer.userId), 1);
  const [joined] = (await listNotifications(viewer(admin), { limit: 50 })).items;
  assert.equal(joined.type, "MIEMBRO_NUEVO");
  assert.equal(joined.title, "notif-revisor Prueba se unió al despacho");
  assert.equal(joined.body, "Aceptó la invitación y entró como Revisor.");
  assert.equal(joined.link, "/organizacion/equipo");
  assert.equal((await listNotifications(viewer(appraiser), { limit: 50 })).items.length, 0);
});

test("low credits: only with the pay per appraisal on and 3 or fewer left; the latest balance replaces the unread one", async () => {
  const { team, admin, appraiser, viewer } = await createTeam();
  await prisma.movimientoCreditos.create({ data: { IdOrganizacion: team.IdOrganizacion, STipo: "AJUSTE", ICreditos: 2, SDescripcion: "Prueba" } });
  assert.equal(await notifyLowCredits(team.IdOrganizacion), 0, "pay per appraisal off");

  await prisma.organizacion.update({ where: { IdOrganizacion: team.IdOrganizacion }, data: { BCobroPorAvaluo: true } });
  assert.equal(await notifyLowCredits(team.IdOrganizacion), 1, "only the administrator sees the billing");
  await prisma.movimientoCreditos.create({ data: { IdOrganizacion: team.IdOrganizacion, STipo: "AJUSTE", ICreditos: -1, SDescripcion: "Prueba" } });
  await notifyLowCredits(team.IdOrganizacion);
  const { items } = await listNotifications(viewer(admin), { limit: 50 });
  assert.deepEqual(items.map((item) => item.title), ["Queda 1 avalúo disponible"]);
  assert.equal(items[0].link, "/organizacion/facturacion");
  assert.equal((await listNotifications(viewer(appraiser), { limit: 50 })).items.length, 0);

  await prisma.movimientoCreditos.create({ data: { IdOrganizacion: team.IdOrganizacion, STipo: "AJUSTE", ICreditos: 10, SDescripcion: "Prueba" } });
  assert.equal(await notifyLowCredits(team.IdOrganizacion), 0, "11 left is plenty");
});

test("notices older than 90 days are not shown and are deleted with the next one", async () => {
  const { team, admin, appraiser, valuation, viewer, actor } = await createTeam();
  const old = await prisma.notificacion.create({
    data: {
      IdUsuario: appraiser.userId,
      IdOrganizacion: team.IdOrganizacion,
      STipo: "AVALUO_CONCLUIDO",
      STitulo: "Viejo",
      DFechaCreacion: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
    },
  });
  assert.equal((await listNotifications(viewer(appraiser), { limit: 50 })).items.length, 0);
  await notifyValuationEvent("asignado", valuation.UIdentificadorPublico, actor(admin, "Ana"));
  assert.equal(await prisma.notificacion.findUnique({ where: { IdNotificacion: old.IdNotificacion } }), null);
});
