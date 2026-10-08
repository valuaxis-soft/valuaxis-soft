/**
 * The authorization matrix: what each role of an organization gets from each
 * API route on that organization's own data. Roles and their permissions come
 * from migrations 004 and 028:
 *   ADMINISTRADOR  everything, including team, firm data and factors
 *   VALUADOR       view, create, edit, conclude, reopen, export, share
 *   REVISOR        view, review, conclude, export (no edit, no sharing)
 *   CONSULTA       view and export only, and read the plan and billing
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import sharp from "sharp";
import {
  call,
  comparablePayload,
  comparablesCsv,
  conclusionPayload,
  costPayload,
  createActor,
  createValuation,
  createWorld,
  describeCall,
  emailPayload,
  firmPayload,
  foundComparablesPayload,
  incomePayload,
  marketPayload,
  prisma,
  reopenPayload,
  valuationCatalogIds,
  waitForServer,
  addRentMarket,
  type Actor,
  type Role,
  type World,
} from "./support";

const ROLES: Role[] = ["ADMINISTRADOR", "VALUADOR", "REVISOR", "CONSULTA"];

/**
 * The PDF is printed by Chromium (CHROMIUM_PATH). Without it the route answers
 * 503 after every authorization check has passed, which is what these tests
 * are about; with it, 200.
 */
const PDF_OK = [200, 503];

type Expected = number | number[];
type Case = {
  name: string;
  method: string;
  /** Path for the call; `valuation` is the valuation the call acts on. */
  path: (valuation: string) => string;
  body?: () => unknown;
  form?: () => FormData;
  expected: Record<Role, Expected>;
  /**
   * The call changes the valuation for good (delete, conclude, reopen): each
   * role gets its own valuation, prepared by `prepare` when given.
   */
  fresh?: boolean;
  prepare?: (valuation: string) => Promise<void>;
};

const all = (status: Expected): Record<Role, Expected> => ({ ADMINISTRADOR: status, VALUADOR: status, REVISOR: status, CONSULTA: status });
const editors = (ok: Expected): Record<Role, Expected> => ({ ADMINISTRADOR: ok, VALUADOR: ok, REVISOR: 403, CONSULTA: 403 });
const adminOnly = (ok: Expected): Record<Role, Expected> => ({ ADMINISTRADOR: ok, VALUADOR: 403, REVISOR: 403, CONSULTA: 403 });

let world: World;
let shared: string;
let catalogIds: Awaited<ReturnType<typeof valuationCatalogIds>>;
const actors = () => ({
  ADMINISTRADOR: world.a.admin,
  VALUADOR: world.a.valuador,
  REVISOR: world.a.revisor,
  CONSULTA: world.a.consulta,
}) satisfies Record<Role, Actor>;

before(async () => {
  await waitForServer();
  world = await createWorld();
  catalogIds = await valuationCatalogIds();
  shared = await createValuation(world.a.admin, "Avalúo compartido de la matriz");
  // A rent market, so the income approach has a unit rent to compute with
  // (see the skipped test in valuation-flow.e2e.ts for per-unit rents alone).
  await addRentMarket(world.a.admin, shared);
});
after(() => prisma.$disconnect());

async function concluded(valuation: string) {
  const response = await call(world.a.admin, "POST", `/api/avaluos/${valuation}/conclude`);
  assert.equal(response.status, 200, describeCall("conclude (setup)", response));
}

const valuationCases: Case[] = [
  { name: "list valuations", method: "GET", path: () => "/api/avaluos", expected: all(200) },
  {
    name: "create a valuation",
    method: "POST",
    path: () => "/api/avaluos",
    body: () => ({ title: "Creado desde la matriz", ...catalogIds }),
    expected: editors(201),
  },
  { name: "read a valuation", method: "GET", path: (id) => `/api/avaluos/${id}`, expected: all(200) },
  {
    name: "update a valuation's data",
    method: "PUT",
    path: (id) => `/api/avaluos/${id}`,
    body: () => ({ client: "Cliente actualizado", location: "Av. Siempre Viva 742", postalCode: "44100" }),
    expected: editors(200),
  },
  {
    name: "save the full valuation",
    method: "PUT",
    path: (id) => `/api/avaluos/${id}/full`,
    body: () => ({ client: "Cliente completo" }),
    expected: editors(200),
  },
  { name: "delete a valuation", method: "DELETE", path: (id) => `/api/avaluos/${id}`, expected: editors(200), fresh: true },
  { name: "export the summary PDF", method: "GET", path: (id) => `/api/avaluos/${id}/export`, expected: all(200) },
  { name: "conclude", method: "POST", path: (id) => `/api/avaluos/${id}/conclude`, fresh: true,
    expected: { ADMINISTRADOR: 200, VALUADOR: 200, REVISOR: 200, CONSULTA: 403 } },
  { name: "reopen", method: "POST", path: (id) => `/api/avaluos/${id}/reopen`, body: () => reopenPayload, fresh: true, prepare: concluded,
    expected: { ADMINISTRADOR: 200, VALUADOR: 200, REVISOR: 403, CONSULTA: 403 } },
];

const calculationCases: Case[] = [
  { name: "read the cost approach", method: "GET", path: (id) => `/api/avaluos/${id}/costos`, expected: all(200) },
  { name: "save the cost approach", method: "PUT", path: (id) => `/api/avaluos/${id}/costos`, body: () => costPayload, expected: editors(200) },
  { name: "read the market approach", method: "GET", path: (id) => `/api/avaluos/${id}/mercado?tipo=TERRENO_VENTA`, expected: all(200) },
  { name: "save the market approach", method: "PUT", path: (id) => `/api/avaluos/${id}/mercado`, body: () => marketPayload, expected: editors(200) },
  { name: "add a comparable", method: "POST", path: (id) => `/api/avaluos/${id}/mercado/comparables?tipo=TERRENO_VENTA`,
    body: () => comparablePayload, expected: editors(201) },
  { name: "preview a comparable import", method: "POST", path: (id) => `/api/avaluos/${id}/mercado/comparables/importar?tipo=TERRENO_VENTA`,
    form: comparablesCsv, expected: editors(200) },
  { name: "confirm a comparable import", method: "POST", path: (id) => `/api/avaluos/${id}/mercado/comparables/importar?tipo=TERRENO_VENTA&confirmar=1`,
    form: comparablesCsv, expected: editors(201) },
  { name: "search comparables", method: "GET", path: (id) => `/api/avaluos/${id}/mercado/comparables/buscar?tipo=TERRENO_VENTA&q=calle`, expected: all(200) },
  { name: "add found comparables", method: "POST", path: (id) => `/api/avaluos/${id}/mercado/comparables/buscar?tipo=TERRENO_VENTA`,
    body: () => foundComparablesPayload, expected: editors(201) },
  { name: "download the comparables template", method: "GET", path: () => "/api/comparables/plantilla?tipo=TERRENO_VENTA", expected: all(200) },
  { name: "read the income approach", method: "GET", path: (id) => `/api/avaluos/${id}/ingresos`, expected: all(200) },
  { name: "save the income approach", method: "PUT", path: (id) => `/api/avaluos/${id}/ingresos`, body: () => incomePayload, expected: editors(200) },
  { name: "read the conclusion", method: "GET", path: (id) => `/api/avaluos/${id}/conclusion`, expected: all(200) },
  { name: "save the conclusion", method: "PUT", path: (id) => `/api/avaluos/${id}/conclusion`, body: () => conclusionPayload, expected: editors(200) },
];

const dictamenCases: Case[] = [
  // Downloading is exporting: every role may.
  { name: "generate the dictamen PDF", method: "POST", path: (id) => `/api/avaluos/${id}/dictamen/pdf`, expected: all(PDF_OK) },
  // Sending to third parties is sharing: CONSULTA and REVISOR cannot.
  { name: "email the dictamen", method: "POST", path: (id) => `/api/avaluos/${id}/dictamen/correo`, body: () => emailPayload,
    expected: { ADMINISTRADOR: PDF_OK, VALUADOR: PDF_OK, REVISOR: 403, CONSULTA: 403 } },
];

const firmCases: Case[] = [
  { name: "read the firm data", method: "GET", path: () => "/api/organizacion/despacho", expected: adminOnly(200) },
  { name: "save the firm data", method: "PUT", path: () => "/api/organizacion/despacho", body: () => firmPayload, expected: adminOnly(200) },
  { name: "read the factor catalog", method: "GET", path: () => "/api/organizacion/despacho/factores", expected: all(200) },
  { name: "reset the factor catalog", method: "DELETE", path: () => "/api/organizacion/despacho/factores", expected: adminOnly(200) },
  // Without a logo every member gets 404; the upload itself is covered below.
  { name: "read the logo", method: "GET", path: () => "/api/organizacion/despacho/logo", expected: all([302, 404]) },
  { name: "load a stored image", method: "GET", path: () => "/api/archivos/imagen?key=uploads/2026-10/sin-registro.jpg", expected: all(302) },
  { name: "ask for a malformed image key", method: "GET", path: () => "/api/archivos/imagen?key=../secretos", expected: all(404) },
  { name: "remove the logo", method: "DELETE", path: () => "/api/organizacion/despacho/logo", expected: adminOnly(204) },
];

const teamCases: Case[] = [
  { name: "read the team", method: "GET", path: () => "/api/organizacion/equipo", expected: adminOnly(200) },
  { name: "rename the team", method: "PATCH", path: () => "/api/organizacion/equipo", body: () => ({ name: `Equipo E2E ${world.suffix}` }), expected: adminOnly(200) },
  { name: "invite a member", method: "POST", path: () => "/api/organizacion/equipo/invitaciones",
    body: () => ({ email: `invitado-${randomUUID().slice(0, 8)}@example.test`, role: "VALUADOR" }), expected: adminOnly(201) },
  { name: "my pending invitations", method: "GET", path: () => "/api/organizacion/invitaciones", expected: all(200) },
];

/**
 * Stripe is optional: with it the administrator's calls reach the business
 * rule (no such plan: 404; nothing to manage yet: 409), without it they say
 * payments are not enabled (503). Neither creates anything in Stripe.
 */
const billingCases: Case[] = [
  { name: "read the plan and billing", method: "GET", path: () => "/api/organizacion/facturacion",
    expected: { ADMINISTRADOR: 200, VALUADOR: 403, REVISOR: 403, CONSULTA: 200 } },
  { name: "start the checkout of a plan that does not exist", method: "POST", path: () => "/api/organizacion/facturacion/checkout",
    body: () => ({ priceId: randomUUID() }), expected: adminOnly([404, 503]) },
  { name: "start a checkout without a valid plan id", method: "POST", path: () => "/api/organizacion/facturacion/checkout",
    body: () => ({ priceId: "no-es-un-id" }), expected: adminOnly(400) },
  { name: "open the payment portal without a paid subscription", method: "POST", path: () => "/api/organizacion/facturacion/portal",
    expected: adminOnly([409, 503]) },
];

async function runCase(item: Case, role: Role) {
  const actor = actors()[role];
  let valuation = shared;
  if (item.fresh) {
    valuation = await createValuation(world.a.admin, `${item.name} (${role})`);
    await item.prepare?.(valuation);
  }
  const path = item.path(valuation);
  const response = await call(actor, item.method, path, { json: item.body?.(), form: item.form?.() });
  const expected = [item.expected[role]].flat();
  assert.ok(expected.includes(response.status), `${role}: ${describeCall(`${item.method} ${path}`, response)}, expected ${expected.join(" or ")}`);
  return response;
}

function matrix(title: string, cases: Case[]) {
  describe(title, () => {
    for (const item of cases) {
      for (const role of ROLES) {
        test(`${item.name} — ${role} → ${[item.expected[role]].flat().join("/")}`, async () => {
          await runCase(item, role);
        });
      }
    }
  });
}

matrix("valuations", valuationCases);
matrix("calculations", calculationCases);
matrix("dictamen", dictamenCases);
matrix("firm data", firmCases);
matrix("team", teamCases);
matrix("plan and billing", billingCases);

describe("plan and billing page", () => {
  test("administrators and CONSULTA open it; the other roles are sent to the dashboard", async () => {
    const expected: Record<Role, number> = { ADMINISTRADOR: 200, VALUADOR: 307, REVISOR: 307, CONSULTA: 200 };
    for (const role of ROLES) {
      const response = await call(actors()[role], "GET", "/organizacion/facturacion");
      assert.equal(response.status, expected[role], `${role}: ${describeCall("GET /organizacion/facturacion", response)}`);
      if (expected[role] === 307) assert.equal(new URL(response.headers.get("location") ?? "", "http://x").pathname, "/dashboard");
    }
  });
});

describe("team members and invitations by id", () => {
  test("only the administrator changes a role, removes a member, resends or cancels an invitation", async () => {
    const member = await createActor(world.a.organizationId, "CONSULTA");
    const membership = await prisma.miembroOrganizacion.findFirstOrThrow({
      where: { IdUsuario: member.userId, IdOrganizacion: world.a.organizationId },
    });
    const memberPath = `/api/organizacion/equipo/miembros/${membership.IdMiembroOrganizacion}`;
    const invite = await call(world.a.admin, "POST", "/api/organizacion/equipo/invitaciones", {
      json: { email: `reenviar-${randomUUID().slice(0, 8)}@example.test`, role: "CONSULTA" },
    });
    assert.equal(invite.status, 201, describeCall("invite (setup)", invite));
    const invitationId = await prisma.invitacionOrganizacion.findFirstOrThrow({
      where: { IdOrganizacion: world.a.organizationId, DFechaRevocacion: null, DFechaAceptacion: null },
      orderBy: { IdInvitacionOrganizacion: "desc" },
      select: { UIdentificadorPublico: true },
    }).then((row) => row.UIdentificadorPublico);
    const invitationPath = `/api/organizacion/equipo/invitaciones/${invitationId}`;

    for (const actor of [world.a.valuador, world.a.revisor, world.a.consulta]) {
      for (const [method, path, json] of [
        ["PATCH", memberPath, { role: "ADMINISTRADOR" }],
        ["DELETE", memberPath, undefined],
        ["POST", invitationPath, undefined],
        ["DELETE", invitationPath, undefined],
      ] as const) {
        const response = await call(actor, method, path, { json });
        assert.equal(response.status, 403, `${actor.role}: ${describeCall(`${method} ${path}`, response)}`);
      }
    }
    const unchanged = await prisma.miembroOrganizacion.findUniqueOrThrow({
      where: { IdMiembroOrganizacion: membership.IdMiembroOrganizacion },
      include: { rol: true },
    });
    assert.equal(unchanged.rol.SClave, "CONSULTA");
    assert.equal(unchanged.BActivo, true);

    const admin = world.a.admin;
    assert.equal((await call(admin, "PATCH", memberPath, { json: { role: "REVISOR" } })).status, 204);
    assert.equal((await call(admin, "POST", invitationPath)).status, 200);
    // Resending replaces the link; the newest pending invitation is the one to cancel.
    const resent = await prisma.invitacionOrganizacion.findFirstOrThrow({
      where: { IdOrganizacion: world.a.organizationId, DFechaRevocacion: null, DFechaAceptacion: null },
      orderBy: { IdInvitacionOrganizacion: "desc" },
      select: { UIdentificadorPublico: true },
    });
    assert.equal((await call(admin, "DELETE", `/api/organizacion/equipo/invitaciones/${resent.UIdentificadorPublico}`)).status, 204);
    assert.equal((await call(admin, "DELETE", memberPath)).status, 204);
    // The removed member's session no longer opens the organization.
    assert.equal((await call(member, "GET", "/api/avaluos")).status, 401);
  });

  test("malformed member and invitation ids are 404 for the administrator", async () => {
    assert.equal((await call(world.a.admin, "PATCH", "/api/organizacion/equipo/miembros/abc", { json: { role: "VALUADOR" } })).status, 404);
    assert.equal((await call(world.a.admin, "DELETE", "/api/organizacion/equipo/invitaciones/not-a-uuid")).status, 404);
  });
});

describe("firm logo upload", () => {
  test("only the administrator uploads the logo; every member can then load it", async () => {
    const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#1e3a8a" } }).png().toBuffer();
    const form = () => {
      const data = new FormData();
      data.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "logo.png");
      return data;
    };
    for (const actor of [world.a.valuador, world.a.revisor, world.a.consulta]) {
      const response = await call(actor, "POST", "/api/organizacion/despacho/logo", { form: form() });
      assert.equal(response.status, 403, `${actor.role}: ${describeCall("POST logo", response)}`);
    }
    const uploaded = await call(world.a.admin, "POST", "/api/organizacion/despacho/logo", { form: form() });
    assert.equal(uploaded.status, 201, describeCall("POST logo (admin)", uploaded));
    for (const actor of Object.values(actors())) {
      const response = await call(actor, "GET", "/api/organizacion/despacho/logo");
      assert.equal(response.status, 302, `${actor.role}: ${describeCall("GET logo", response)}`);
    }
    assert.equal((await call(world.a.admin, "DELETE", "/api/organizacion/despacho/logo")).status, 204);
  });
});

describe("factor catalog", () => {
  test("only the administrator saves it", async () => {
    const current = await call(world.a.admin, "GET", "/api/organizacion/despacho/factores");
    assert.equal(current.status, 200);
    const catalog = current.data.catalog ?? current.data;
    for (const actor of [world.a.valuador, world.a.revisor, world.a.consulta]) {
      const response = await call(actor, "PUT", "/api/organizacion/despacho/factores", { json: catalog });
      assert.equal(response.status, 403, `${actor.role}: ${describeCall("PUT factores", response)}`);
    }
    const saved = await call(world.a.admin, "PUT", "/api/organizacion/despacho/factores", { json: catalog });
    assert.equal(saved.status, 200, describeCall("PUT factores (admin)", saved));
  });
});

describe("generic uploads", () => {
  test("uploading editor images needs edit permission", async () => {
    for (const actor of [world.a.revisor, world.a.consulta]) {
      const response = await call(actor, "POST", "/api/uploads", { form: new FormData() });
      assert.equal(response.status, 403, `${actor.role}: ${describeCall("POST /api/uploads", response)}`);
    }
    for (const actor of [world.a.admin, world.a.valuador]) {
      // Allowed through the guard; the empty form is then a bad request.
      const response = await call(actor, "POST", "/api/uploads", { form: new FormData() });
      assert.equal(response.status, 400, `${actor.role}: ${describeCall("POST /api/uploads", response)}`);
    }
  });
});
