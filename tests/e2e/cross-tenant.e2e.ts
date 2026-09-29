/**
 * Tenant isolation: organization B's administrator (every permission, in the
 * wrong organization) gets nothing from organization A's valuation, team or
 * invitations, and changes nothing. A missing and a foreign record look the
 * same (404), so ids of other organizations cannot be probed.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  addRentMarket,
  call,
  comparablePayload,
  comparablesCsv,
  conclusionPayload,
  costPayload,
  createValuation,
  createWorld,
  describeCall,
  emailPayload,
  incomePayload,
  marketPayload,
  prisma,
  reopenPayload,
  waitForServer,
  type World,
} from "./support";

let world: World;
let target: string;
let concludedTarget: string;

before(async () => {
  await waitForServer();
  world = await createWorld();
  target = await createValuation(world.a.admin, "Avalúo privado de A");
  await addRentMarket(world.a.admin, target);
  const cost = await call(world.a.admin, "PUT", `/api/avaluos/${target}/costos`, { json: costPayload });
  assert.equal(cost.status, 200, describeCall("cost (setup)", cost));
  concludedTarget = await createValuation(world.a.admin, "Avalúo concluido de A");
  const concluded = await call(world.a.admin, "POST", `/api/avaluos/${concludedTarget}/conclude`);
  assert.equal(concluded.status, 200, describeCall("conclude (setup)", concluded));
});
after(() => prisma.$disconnect());

/** What A sees of its valuation; compared before and after B's attempts. */
async function snapshot(id: string) {
  const [valuation, cost, market, income, conclusion] = await Promise.all([
    call(world.a.admin, "GET", `/api/avaluos/${id}`),
    call(world.a.admin, "GET", `/api/avaluos/${id}/costos`),
    call(world.a.admin, "GET", `/api/avaluos/${id}/mercado?tipo=TERRENO_VENTA`),
    call(world.a.admin, "GET", `/api/avaluos/${id}/ingresos`),
    call(world.a.admin, "GET", `/api/avaluos/${id}/conclusion`),
  ]);
  for (const response of [valuation, cost, market, income, conclusion]) assert.equal(response.status, 200);
  const row = await prisma.avaluo.findUniqueOrThrow({
    where: { UIdentificadorPublico: id },
    select: { STitulo: true, SNombreCliente: true, BActivo: true, DFechaEliminacion: true, BBloqueado: true, IdEstadoAvaluo: true },
  });
  return JSON.stringify({ valuation: valuation.data, cost: cost.data, market: market.data, income: income.data, conclusion: conclusion.data, row });
}

type Attempt = [method: string, path: (id: string) => string, options?: { json?: unknown; form?: () => FormData }];

const reads: Attempt[] = [
  ["GET", (id) => `/api/avaluos/${id}`],
  ["GET", (id) => `/api/avaluos/${id}/costos`],
  ["GET", (id) => `/api/avaluos/${id}/mercado?tipo=TERRENO_VENTA`],
  ["GET", (id) => `/api/avaluos/${id}/mercado?tipo=INMUEBLE_RENTA`],
  ["GET", (id) => `/api/avaluos/${id}/ingresos`],
  ["GET", (id) => `/api/avaluos/${id}/conclusion`],
  ["GET", (id) => `/api/avaluos/${id}/datos/imagenes`],
  // Copies of the valuation's content leaving the system.
  ["GET", (id) => `/api/avaluos/${id}/export`],
  ["POST", (id) => `/api/avaluos/${id}/dictamen/pdf`],
  ["POST", (id) => `/api/avaluos/${id}/dictamen/correo`, { json: emailPayload }],
];

const writes: Attempt[] = [
  ["DELETE", (id) => `/api/avaluos/${id}`],
  ["PUT", (id) => `/api/avaluos/${id}/costos`, { json: { ...costPayload, land: { ...costPayload.land, unitValue: 1 } } }],
  ["PUT", (id) => `/api/avaluos/${id}/mercado`, { json: { ...marketPayload, adoptedUnitValue: 1 } }],
  ["PUT", (id) => `/api/avaluos/${id}/ingresos`, { json: incomePayload }],
  ["PUT", (id) => `/api/avaluos/${id}/conclusion`, { json: { ...conclusionPayload, justification: "Escrito por B" } }],
  ["POST", (id) => `/api/avaluos/${id}/mercado/comparables?tipo=TERRENO_VENTA`, { json: comparablePayload }],
  ["POST", (id) => `/api/avaluos/${id}/mercado/comparables/importar?tipo=TERRENO_VENTA`, { form: comparablesCsv }],
  ["POST", (id) => `/api/avaluos/${id}/mercado/comparables/importar?tipo=TERRENO_VENTA&confirmar=1`, { form: comparablesCsv }],
  ["POST", (id) => `/api/avaluos/${id}/conclude`],
];

async function attempt([method, path, options]: Attempt, id: string) {
  const response = await call(world.b.admin, method, path(id), { json: options?.json, form: options?.form?.() });
  return { response, label: `org B admin ${method} ${path(id)}` };
}

describe("organization B cannot reach organization A's valuation", () => {
  test("the list of B does not include A's valuations", async () => {
    const list = await call(world.b.admin, "GET", "/api/avaluos");
    assert.equal(list.status, 200);
    const ids = JSON.stringify(list.data);
    assert.ok(!ids.includes(target) && !ids.includes(concludedTarget), "A's valuation leaked into B's list");
  });

  for (const item of reads) {
    test(`read: ${item[0]} ${item[1](":id")} → 404`, async () => {
      const { response, label } = await attempt(item, target);
      assert.equal(response.status, 404, describeCall(label, response));
    });
  }

  for (const item of writes) {
    test(`write: ${item[0]} ${item[1](":id")} → 404 and nothing changes`, async () => {
      const before = await snapshot(target);
      const { response, label } = await attempt(item, target);
      assert.equal(response.status, 404, describeCall(label, response));
      assert.equal(await snapshot(target), before, `${label} changed A's valuation`);
    });
  }

  test("write: reopen A's concluded valuation → 404 and it stays concluded", async () => {
    const response = await call(world.b.admin, "POST", `/api/avaluos/${concludedTarget}/reopen`, { json: reopenPayload });
    assert.equal(response.status, 404, describeCall("org B admin POST reopen", response));
    const row = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: concludedTarget }, select: { BBloqueado: true } });
    assert.equal(row.BBloqueado, true);
  });

  // PUT /api/avaluos/:id and PUT /:id/full go through saveValuation, which
  // scopes by organization but reports "not found" as a 400. The request is
  // still refused and nothing changes; only the status differs from the rest.
  for (const path of [(id: string) => `/api/avaluos/${id}`, (id: string) => `/api/avaluos/${id}/full`]) {
    test(`write: PUT ${path(":id")} is refused (never 2xx) and nothing changes`, async () => {
      const before = await snapshot(target);
      const response = await call(world.b.admin, "PUT", path(target), { json: { client: "Escrito por B", location: "Calle de B" } });
      assert.ok(response.status >= 400 && response.status < 500, describeCall(`org B admin PUT ${path(target)}`, response));
      assert.equal(await snapshot(target), before);
    });

    test(`write: PUT ${path(":id")} answers 404 like the other routes`, async () => {
      const response = await call(world.b.admin, "PUT", path(target), { json: { client: "Escrito por B" } });
      assert.equal(response.status, 404, describeCall(`org B admin PUT ${path(target)}`, response));
    });
  }
});

describe("organization B cannot reach organization A's team", () => {
  test("B's team lists only B", async () => {
    const team = await call(world.b.admin, "GET", "/api/organizacion/equipo");
    assert.equal(team.status, 200);
    const text = JSON.stringify(team.data);
    assert.ok(!text.includes(world.a.valuador.email) && !text.includes(world.a.admin.email), "A's members leaked into B's team");
  });

  test("B cannot change the role of, or remove, a member of A", async () => {
    const membership = await prisma.miembroOrganizacion.findFirstOrThrow({
      where: { IdUsuario: world.a.consulta.userId, IdOrganizacion: world.a.organizationId },
      include: { rol: true },
    });
    const path = `/api/organizacion/equipo/miembros/${membership.IdMiembroOrganizacion}`;
    const patch = await call(world.b.admin, "PATCH", path, { json: { role: "ADMINISTRADOR" } });
    assert.equal(patch.status, 404, describeCall(`org B admin PATCH ${path}`, patch));
    const remove = await call(world.b.admin, "DELETE", path);
    assert.equal(remove.status, 404, describeCall(`org B admin DELETE ${path}`, remove));
    const after = await prisma.miembroOrganizacion.findUniqueOrThrow({
      where: { IdMiembroOrganizacion: membership.IdMiembroOrganizacion },
      include: { rol: true },
    });
    assert.equal(after.rol.SClave, "CONSULTA");
    assert.equal(after.BActivo, true);
  });

  test("B cannot resend or cancel an invitation of A", async () => {
    const invite = await call(world.a.admin, "POST", "/api/organizacion/equipo/invitaciones", {
      json: { email: `aislamiento-${world.suffix}@example.test`, role: "VALUADOR" },
    });
    assert.equal(invite.status, 201, describeCall("invite (setup)", invite));
    const invitation = await prisma.invitacionOrganizacion.findFirstOrThrow({
      where: { IdOrganizacion: world.a.organizationId, DFechaRevocacion: null },
      orderBy: { IdInvitacionOrganizacion: "desc" },
    });
    const path = `/api/organizacion/equipo/invitaciones/${invitation.UIdentificadorPublico}`;
    for (const method of ["POST", "DELETE"]) {
      const response = await call(world.b.admin, method, path);
      assert.equal(response.status, 404, describeCall(`org B admin ${method} ${path}`, response));
    }
    const unchanged = await prisma.invitacionOrganizacion.findUniqueOrThrow({
      where: { IdInvitacionOrganizacion: invitation.IdInvitacionOrganizacion },
    });
    assert.equal(unchanged.DFechaRevocacion, null);
    assert.equal(unchanged.STokenHash, invitation.STokenHash);
  });

  test("B cannot switch its session into A", async () => {
    const response = await call(world.b.admin, "PATCH", "/api/auth/organizations", { json: { IdOrganizacion: world.a.organizationId } });
    assert.ok([403, 404].includes(response.status), describeCall("org B admin PATCH /api/auth/organizations → A", response));
    const session = await prisma.sesion.findFirstOrThrow({ where: { IdUsuario: world.b.admin.userId } });
    assert.equal(session.IdOrganizacion, world.b.organizationId);
    // And A's valuation is still out of reach.
    assert.equal((await call(world.b.admin, "GET", `/api/avaluos/${target}`)).status, 404);
  });

  test("B's firm data and factor catalog are B's own", async () => {
    await call(world.a.admin, "PUT", "/api/organizacion/despacho", { json: { validityMonths: 3, folioPrefix: "AAA", legalName: `Despacho A ${world.suffix}` } });
    const firm = await call(world.b.admin, "GET", "/api/organizacion/despacho");
    assert.equal(firm.status, 200);
    assert.notEqual(firm.data.legalName, `Despacho A ${world.suffix}`);
    assert.notEqual(firm.data.folioPrefix, "AAA");
  });
});
