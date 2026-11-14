/**
 * AUD-14 (audit of 2 Nov 2026 and retest of 5 Nov): the trash of valuations,
 * their history and the review «Enviar a revisión → Aprobar / Regresar a
 * edición», with the roles of a firm (ADMINISTRADOR, VALUADOR, REVISOR).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import ExcelJS from "exceljs";
import { DELETE as purgeRoute } from "../../src/app/api/avaluos/[id]/definitivo/route";
import { POST as restoreRoute } from "../../src/app/api/avaluos/[id]/restaurar/route";
import { POST as reviewRoute } from "../../src/app/api/avaluos/[id]/revision/route";
import { DELETE as deleteRoute, PUT as metaRoute } from "../../src/app/api/avaluos/[id]/route";
import { PUT as fullRoute } from "../../src/app/api/avaluos/[id]/full/route";
import { initialMetaFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { valuationMetaPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import { GET as exportRoute } from "../../src/app/api/exportar/avaluos/route";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { listValuationPins } from "../../src/features/maps/base-map/base-map.service";
import {
  countValuationsByStatus,
  getValuationByPublicId,
} from "../../src/features/valuations/repositories/valuation.repository";
import {
  TRASH_RETENTION_DAYS,
  listValuationsPage,
  purgeExpiredTrash,
} from "../../src/features/valuations/repositories/valuation-list.repository";
import { auditValuation, auditValuationSave } from "../../src/features/valuations/services/valuation-audit";
import { getValuationHistory } from "../../src/features/valuations/services/valuation-history.service";
import { advanceStaleNewValuations, findStaleNewValuations } from "../../src/features/valuations/services/valuation-status-repair";
import { reopenValuation } from "../../src/features/valuations/services/valuation-workflow.service";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createValuationFixture, prisma, TestCookieJar, withCookies } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

/** A new person of the fixture's firm with `roleKey`, signed in (names invented). */
async function signInAs(fixture: Fixture, roleKey: "ADMINISTRADOR" | "VALUADOR" | "REVISOR" | "CONSULTA") {
  const suffix = randomUUID().slice(0, 8);
  const [role, userState] = await Promise.all([
    prisma.rol.findUniqueOrThrow({ where: { SClave: roleKey } }),
    prisma.estadoUsuario.findUniqueOrThrow({ where: { SClave: "ACTIVO" } }),
  ]);
  const user = await prisma.usuario.create({
    data: { IdEstadoUsuario: userState.IdEstadoUsuario, SNombre: `${roleKey.toLowerCase()} inventado`, SCorreo: `${roleKey.toLowerCase()}-${suffix}@example.test` },
  });
  await prisma.miembroOrganizacion.create({ data: { IdOrganizacion: fixture.organizationId, IdUsuario: user.IdUsuario, IdRol: role.IdRol } });
  const token = createSecureToken();
  await prisma.sesion.create({
    data: {
      IdUsuario: user.IdUsuario,
      IdOrganizacion: fixture.organizationId,
      STokenHash: hashToken(token),
      DFechaExpiracion: new Date(Date.now() + 60 * 60 * 1000),
      DFechaUltimaActividad: new Date(),
    },
  });
  const jar = new TestCookieJar();
  jar.set(AUTH_SESSION_COOKIE, token);
  return { jar, userId: user.IdUsuario };
}

const jsonRequest = (path: string, method: string, body?: unknown) => new Request(`http://localhost${path}`, {
  method,
  headers: { "content-type": "application/json", "x-real-ip": "203.0.113.20", "user-agent": "Pruebas" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

function context<T>(params: T) {
  return { params: Promise.resolve(params) } as never;
}

async function review(jar: TestCookieJar, id: string, action: string, note?: string) {
  const response = await withCookies(jar, () => reviewRoute(jsonRequest(`/api/avaluos/${id}/revision`, "POST", { action, note }), context({ id })));
  return { status: response.status, body: await response.json() as { data?: { status: string; approvedAt: string | null }; error?: string } };
}

async function statusOf(publicId: string) {
  const row = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: publicId }, select: { DFechaRevisionAprobada: true, estadoAvaluo: { select: { SClave: true } } } });
  return { status: row.estadoAvaluo.SClave, approvedAt: row.DFechaRevisionAprobada };
}

test("a deleted valuation leaves every list, count, map and search; it cannot be opened; it is restored as it was", async () => {
  const fixture = await createValuationFixture();
  const admin = await signInAs(fixture, "ADMINISTRADOR");
  const folio = (await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } })).SFolio;
  const listed = async (query: Partial<Parameters<typeof listValuationsPage>[0]> = {}) =>
    (await listValuationsPage({ organizationId: fixture.organizationId, page: 1, pageSize: 50, ...query })).items.map((item) => item.id);

  // Located, so it shows on the map of the firm.
  const valuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const property = await prisma.propiedad.create({
    data: {
      IdOrganizacion: fixture.organizationId,
      IdTipoInmueble: valuation.IdTipoInmueble,
      SNombre: "Inmueble inventado",
      JCaracteristicas: { ubicacion: { point: [20.6767, -103.3475], address: "Av. Inventada 1", source: "pin", updatedAt: new Date().toISOString() } },
    },
  });
  await prisma.avaluo.update({ where: { IdAvaluo: valuation.IdAvaluo }, data: { IdPropiedadSujeto: property.IdPropiedad } });
  const onMap = async () => (await listValuationPins(fixture.organizationId)).some((pin) => pin.id === fixture.publicId);
  assert.equal(await onMap(), true);

  assert.deepEqual(await listed(), [fixture.publicId]);
  const deleted = await withCookies(admin.jar, () => deleteRoute(jsonRequest(`/api/avaluos/${fixture.publicId}`, "DELETE"), context({ id: fixture.publicId })));
  assert.equal(deleted.status, 200);

  assert.deepEqual(await listed(), [], "not in the list");
  assert.deepEqual(await listed({ q: folio }), [], "not in a search");
  assert.deepEqual(await listed({ archived: true }), [], "not in the archive");
  assert.deepEqual(await countValuationsByStatus(fixture.organizationId), {}, "not counted");
  assert.equal(await onMap(), false, "not on the map");
  assert.equal(await getValuationByPublicId(fixture.publicId, fixture.organizationId), null, "the editor cannot open it");
  assert.deepEqual(await listed({ trash: true }), [fixture.publicId], "it waits in the trash");
  assert.equal(await getValuationHistory(fixture.publicId, fixture.organizationId), null);

  const restored = await withCookies(admin.jar, () => restoreRoute(jsonRequest(`/api/avaluos/${fixture.publicId}/restaurar`, "POST"), context({ id: fixture.publicId })));
  assert.equal(restored.status, 200);
  assert.deepEqual(await listed(), [fixture.publicId], "back in the list");
  assert.deepEqual(await listed({ trash: true }), []);
  assert.ok(await getValuationByPublicId(fixture.publicId, fixture.organizationId));

  const history = await getValuationHistory(fixture.publicId, fixture.organizationId);
  assert.deepEqual(history?.events.slice(0, 2).map((event) => event.title), ["Lo restauró de la papelera", "Lo mandó a la papelera"]);
});

test("only the ADMINISTRADOR deletes for good, typing the folio; then nothing restores it", async () => {
  const fixture = await createValuationFixture();
  const admin = await signInAs(fixture, "ADMINISTRADOR");
  const appraiser = await signInAs(fixture, "VALUADOR");
  const folio = (await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } })).SFolio;
  await withCookies(appraiser.jar, () => deleteRoute(jsonRequest(`/api/avaluos/${fixture.publicId}`, "DELETE"), context({ id: fixture.publicId })));

  const purge = (jar: TestCookieJar, typed: string) =>
    withCookies(jar, () => purgeRoute(jsonRequest(`/api/avaluos/${fixture.publicId}/definitivo`, "DELETE", { folio: typed }), context({ id: fixture.publicId })));
  assert.equal((await purge(appraiser.jar, folio)).status, 403, "a VALUADOR cannot");
  assert.equal((await purge(admin.jar, "OTRO-FOLIO")).status, 409, "the folio must be typed");
  assert.equal((await purge(admin.jar, folio.toLowerCase())).status, 200);

  const list = await listValuationsPage({ organizationId: fixture.organizationId, page: 1, pageSize: 50, trash: true });
  assert.equal(list.total, 0, "out of the trash too");
  const restore = await withCookies(admin.jar, () => restoreRoute(jsonRequest(`/api/avaluos/${fixture.publicId}/restaurar`, "POST"), context({ id: fixture.publicId })));
  assert.equal(restore.status, 404, "no way back");
  const row = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  assert.ok(row.DFechaEliminacionDefinitiva, "the row stays for the credits and the audit");
});

test(`the trash keeps a valuation ${TRASH_RETENTION_DAYS} days; after them it is deleted for good`, async () => {
  const fixture = await createValuationFixture();
  const old = new Date(Date.now() - (TRASH_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
  await prisma.avaluo.updateMany({ where: { UIdentificadorPublico: fixture.publicId }, data: { BActivo: false, DFechaEliminacion: old } });
  const trash = await listValuationsPage({ organizationId: fixture.organizationId, page: 1, pageSize: 50, trash: true });
  assert.equal(trash.total, 0);
  assert.ok((await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } })).DFechaEliminacionDefinitiva, "opening the trash purged it");
  assert.equal(await purgeExpiredTrash(fixture.organizationId), 0, "already purged");
});

test("review: the VALUADOR sends it, the REVISOR approves or returns it with a reason; each one only what its role allows", async () => {
  const fixture = await createValuationFixture();
  const appraiser = await signInAs(fixture, "VALUADOR");
  const reviewer = await signInAs(fixture, "REVISOR");
  const consulta = await signInAs(fixture, "CONSULTA");

  assert.equal((await review(consulta.jar, fixture.publicId, "enviar")).status, 403, "CONSULTA neither sends nor reviews");
  assert.equal((await review(reviewer.jar, fixture.publicId, "enviar")).status, 403, "the REVISOR does not send (no AVALUO_EDITAR)");
  assert.equal((await review(appraiser.jar, fixture.publicId, "aprobar")).status, 403, "the VALUADOR does not approve (no AVALUO_REVISAR)");

  const sent = await review(appraiser.jar, fixture.publicId, "enviar", "Revisar la homologación");
  assert.equal(sent.status, 200);
  assert.deepEqual(await statusOf(fixture.publicId), { status: "EN_REVISION", approvedAt: null });

  assert.equal((await review(reviewer.jar, fixture.publicId, "regresar")).status, 400, "returning needs a reason");
  const returned = await review(reviewer.jar, fixture.publicId, "regresar", "Falta la fotografía de la fachada");
  assert.equal(returned.body.data?.status, "en_edicion");
  assert.equal((await statusOf(fixture.publicId)).status, "EN_EDICION");

  await review(appraiser.jar, fixture.publicId, "enviar");
  const approved = await review(reviewer.jar, fixture.publicId, "aprobar", "Revisado");
  assert.equal(approved.status, 200);
  const after = await statusOf(fixture.publicId);
  assert.equal(after.status, "EN_REVISION");
  assert.ok(after.approvedAt, "approved: ready to conclude");
  assert.equal((await review(reviewer.jar, fixture.publicId, "aprobar")).status, 200, "approving twice changes nothing");

  const history = await getValuationHistory(fixture.publicId, fixture.organizationId);
  const review_events = history?.events.filter((event) => ["submit", "approve", "return"].includes(event.kind)).map((event) => [event.title, event.detail, event.actor]);
  assert.deepEqual(review_events, [
    ["Aprobó la revisión: listo para concluir", "Nota: Revisado", "revisor inventado"],
    ["Lo envió a revisión", null, "valuador inventado"],
    ["Lo regresó a edición", "Motivo: Falta la fotografía de la fachada", "revisor inventado"],
    ["Lo envió a revisión", "Nota: Revisar la homologación", "valuador inventado"],
  ]);
});

test("the history lists the real events and the versions with their reopening reason", async () => {
  const fixture = await createValuationFixture();
  const request = new Request("http://localhost/api", { headers: { "x-real-ip": "203.0.113.30" } });

  await auditValuation({ action: "CREATE", user: fixture.user, valuationPublicId: fixture.publicId, request });
  // Two saves within minutes are one «Guardó cambios».
  assert.ok(await auditValuationSave({ user: fixture.user, valuationPublicId: fixture.publicId, request }));
  assert.equal(await auditValuationSave({ user: fixture.user, valuationPublicId: fixture.publicId, request }), null);
  await auditValuation({ action: "EXPORT", user: fixture.user, valuationPublicId: fixture.publicId, request, metadata: { format: "pdf", final: false } });
  await auditValuation({ action: "ARCHIVE", user: fixture.user, valuationPublicId: fixture.publicId, request, metadata: { archived: true } });

  // Concluded (V1) and reopened: V2 starts with its reason.
  const valuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const finished = await prisma.estadoAvaluo.findUniqueOrThrow({ where: { SClave: "TERMINADO" } });
  await prisma.versionAvaluo.update({ where: { IdVersionAvaluo: valuation.IdVersionTrabajo! }, data: { DFechaFinalizacion: new Date(), IdUsuarioFinalizador: fixture.user.id } });
  await prisma.avaluo.update({
    where: { IdAvaluo: valuation.IdAvaluo },
    data: { IdEstadoAvaluo: finished.IdEstadoAvaluo, IdVersionFinal: valuation.IdVersionTrabajo, IdVersionTrabajo: null, BBloqueado: true, DFechaBloqueo: new Date(), DFechaRevisionAprobada: new Date() },
  });
  await reopenValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, reason: "El cliente corrigió la superficie", acceptedText: "Acepto" });

  const history = await getValuationHistory(fixture.publicId, fixture.organizationId);
  assert.ok(history);
  const titles = history.events.map((event) => event.title);
  for (const title of ["Creó el avalúo", "Guardó cambios", "Descargó el dictamen en PDF", "Lo archivó", "Lo reabrió: empieza la versión V2"]) {
    assert.ok(titles.includes(title), `${title} is in the history`);
  }
  assert.equal(titles.filter((title) => title === "Guardó cambios").length, 1);
  assert.equal(history.events.find((event) => event.kind === "reopen")?.detail, "Motivo: El cliente corrigió la superficie");
  assert.deepEqual(history.versions.map((version) => [version.number, version.current]), [[2, true], [1, false]]);
  assert.equal(history.versions[0].reopenReason, "El cliente corrigió la superficie");
  assert.ok(history.versions[1].concludedAt);
  assert.equal(history.reviewApprovedAt, null, "a reopened valuation is reviewed again");
});

test("valuations that stayed «Nuevo» with a capture move to «En edición»; a fresh one stays", async () => {
  const captured = await createValuationFixture();
  const fresh = await createValuationFixture();
  const created = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.$executeRaw`UPDATE devpware_avaluos SET "DFechaCreacion" = ${created}, "DFechaModificacion" = ${new Date()} WHERE "UIdentificadorPublico" = ${captured.publicId}::uuid`;

  const stale = await findStaleNewValuations({ organizationId: captured.organizationId });
  assert.deepEqual(stale.map((valuation) => valuation.publicId), [captured.publicId]);
  assert.deepEqual(await findStaleNewValuations({ organizationId: fresh.organizationId }), [], "just created from its template: still «Nuevo»");

  assert.equal(await advanceStaleNewValuations(stale), 1);
  assert.equal((await statusOf(captured.publicId)).status, "EN_EDICION");
  assert.equal(await advanceStaleNewValuations(stale), 0, "running it again changes nothing");
  const history = await getValuationHistory(captured.publicId, captured.organizationId);
  assert.match(history?.events[0]?.title ?? "", /corrección/);
});

test("«Exportar a Excel» carries the visible columns in their order and the filters of the list, never the trash in the list", async () => {
  const fixture = await createValuationFixture();
  const admin = await signInAs(fixture, "ADMINISTRADOR");
  const base = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  await prisma.avaluo.update({ where: { IdAvaluo: base.IdAvaluo }, data: { SNombreCliente: "Cliente Inventado Uno" } });
  const second = await prisma.avaluo.create({
    data: {
      IdOrganizacion: base.IdOrganizacion, IdUsuarioCreador: base.IdUsuarioCreador, IdEstadoAvaluo: base.IdEstadoAvaluo, IdTipoAvaluo: base.IdTipoAvaluo,
      IdTipoInmueble: base.IdTipoInmueble, IdTipoOperacion: base.IdTipoOperacion, SFolio: `${base.SFolio}-B`, STitulo: "Bodega inventada", SNombreCliente: "Cliente Inventado Dos",
    },
  });
  const trashed = await prisma.avaluo.create({
    data: {
      IdOrganizacion: base.IdOrganizacion, IdUsuarioCreador: base.IdUsuarioCreador, IdEstadoAvaluo: base.IdEstadoAvaluo, IdTipoAvaluo: base.IdTipoAvaluo,
      IdTipoInmueble: base.IdTipoInmueble, IdTipoOperacion: base.IdTipoOperacion, SFolio: `${base.SFolio}-X`, STitulo: "Eliminado inventado",
      BActivo: false, DFechaEliminacion: new Date(),
    },
  });

  const download = async (query: string) => {
    const response = await withCookies(admin.jar, () => exportRoute(new Request(`http://localhost/api/exportar/avaluos?${query}`)));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition") ?? "", /Avaluos-Valuaxis-.*\.xlsx/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
    const sheet = workbook.worksheets[0];
    const rows: string[][] = [];
    sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1).map((value) => String(value ?? ""))));
    return rows;
  };

  const all = await download("orden=folio&dir=asc&columnas=cliente,folio,estado");
  assert.deepEqual(all[0], ["Cliente", "Folio", "Estado"], "the visible columns, in their order");
  assert.deepEqual(all.slice(1).map((row) => row[1]), [base.SFolio, second.SFolio], "sorted like the list, without the trash");
  assert.equal(all[1][2], "Nuevo");

  const filtered = await download(`q=${encodeURIComponent("Dos")}&columnas=folio`);
  assert.deepEqual(filtered.slice(1), [[second.SFolio]], "with the search of the list");

  const trash = await download("papelera=1&columnas=folio");
  assert.deepEqual(trash.slice(1), [[trashed.SFolio]], "the trash exports from the trash");
});

test("saving from the editor never writes the address over the title, nor drops the client; only an edited title changes", async () => {
  const fixture = await createValuationFixture();
  const appraiser = await signInAs(fixture, "VALUADOR");
  await prisma.avaluo.update({ where: { UIdentificadorPublico: fixture.publicId }, data: { STitulo: "Casa del Cliente Inventado", SNombreCliente: "Cliente Inventado" } });

  // What the editor sends: its meta as it hydrated it, with the address the appraiser typed.
  const detail = await getValuationByPublicId(fixture.publicId, fixture.organizationId);
  const meta = { ...initialMetaFor(detail), location: "Av. Inventada 99, Zapopan, Jal." };
  const save = (body: unknown) =>
    withCookies(appraiser.jar, () => fullRoute(jsonRequest(`/api/avaluos/${fixture.publicId}/full`, "PUT", body), context({ id: fixture.publicId })), { request: true });
  const first = await save({ ...valuationMetaPayload(meta), sections: [] });
  assert.equal(first.status, 200, JSON.stringify(await first.clone().json()));
  let row = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  assert.equal(row.STitulo, "Casa del Cliente Inventado", "the title is not replaced by the address");
  assert.equal(row.SNombreCliente, "Cliente Inventado");

  // A save that does not carry the client keeps it.
  const { client: _client, ...withoutClient } = valuationMetaPayload(meta);
  assert.equal((await save({ ...withoutClient, sections: [] })).status, 200);
  row = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  assert.equal(row.SNombreCliente, "Cliente Inventado");

  // PUT /api/avaluos/[id] accepts the title the appraiser edits, and only then it changes.
  const update = await withCookies(appraiser.jar, () =>
    metaRoute(jsonRequest(`/api/avaluos/${fixture.publicId}`, "PUT", { title: "Casa Jardín Inventada", location: "Otra dirección inventada" }), context({ id: fixture.publicId })), { request: true });
  assert.equal(update.status, 200);
  row = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  assert.equal(row.STitulo, "Casa Jardín Inventada");
  assert.equal(row.SNombreCliente, "Cliente Inventado");
});
