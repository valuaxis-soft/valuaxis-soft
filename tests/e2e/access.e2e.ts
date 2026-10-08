/**
 * Requests without a session, with malformed ids and from other sites: the
 * proxy and the route guards stop them before any data is touched.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { call, createActor, createValuation, createWorld, describeCall, prisma, waitForServer, type World } from "./support";

let world: World;
let valuationId: string;

before(async () => {
  await waitForServer();
  world = await createWorld();
  valuationId = await createValuation(world.a.admin);
});
after(() => prisma.$disconnect());

describe("without a session", () => {
  for (const page of ["/dashboard", "/avaluos", "/workspace", "/organizacion/equipo", "/organizacion/despacho", "/organizacion/facturacion"]) {
    test(`private page ${page} redirects to the login`, async () => {
      const response = await call(null, "GET", page);
      assert.equal(response.status, 307, describeCall(`GET ${page}`, response));
      const location = new URL(response.headers.get("location") ?? "", "http://x");
      assert.equal(location.pathname, "/iniciar-sesion");
      assert.equal(location.searchParams.get("reason"), "required");
      assert.equal(location.searchParams.get("redirectTo"), page);
    });
  }

  test("a valuation's dictamen page redirects to the login", async () => {
    const response = await call(null, "GET", `/avaluos/${valuationId}/dictamen`);
    assert.equal(response.status, 307);
    assert.match(response.headers.get("location") ?? "", /\/iniciar-sesion\?/);
  });

  test("the login page is public", async () => {
    const response = await call(null, "GET", "/iniciar-sesion");
    assert.equal(response.status, 200);
  });

  const privateApis: [string, string][] = [
    ["GET", "/api/auth/session"],
    ["GET", "/api/auth/organizations"],
    ["GET", "/api/avaluos"],
    ["POST", "/api/avaluos"],
    ["GET", "/api/avaluos/{id}"],
    ["PUT", "/api/avaluos/{id}"],
    ["DELETE", "/api/avaluos/{id}"],
    ["PUT", "/api/avaluos/{id}/full"],
    ["GET", "/api/avaluos/{id}/costos"],
    ["PUT", "/api/avaluos/{id}/costos"],
    ["GET", "/api/avaluos/{id}/mercado?tipo=TERRENO_VENTA"],
    ["GET", "/api/avaluos/{id}/ingresos"],
    ["GET", "/api/avaluos/{id}/conclusion"],
    ["POST", "/api/avaluos/{id}/conclude"],
    ["POST", "/api/avaluos/{id}/reopen"],
    ["GET", "/api/avaluos/{id}/export"],
    ["POST", "/api/avaluos/{id}/dictamen/pdf"],
    ["POST", "/api/avaluos/{id}/dictamen/correo"],
    ["POST", "/api/avaluos/{id}/mercado/comparables?tipo=TERRENO_VENTA"],
    ["POST", "/api/avaluos/{id}/mercado/comparables/importar?tipo=TERRENO_VENTA"],
    ["GET", "/api/avaluos/{id}/mercado/comparables/buscar?tipo=TERRENO_VENTA&q=arandas"],
    ["POST", "/api/avaluos/{id}/mercado/comparables/buscar?tipo=TERRENO_VENTA"],
    ["GET", "/api/avaluos/{id}/datos/imagenes"],
    ["GET", "/api/comparables/plantilla?tipo=TERRENO_VENTA"],
    ["GET", "/api/organizacion/equipo"],
    ["POST", "/api/organizacion/equipo/invitaciones"],
    ["GET", "/api/organizacion/invitaciones"],
    ["GET", "/api/organizacion/despacho"],
    ["PUT", "/api/organizacion/despacho"],
    ["GET", "/api/organizacion/despacho/logo"],
    ["GET", "/api/archivos/imagen?key=uploads/2026-10/x.jpg"],
    ["GET", "/api/organizacion/despacho/factores"],
    ["PUT", "/api/organizacion/despacho/factores"],
    ["POST", "/api/uploads"],
    ["GET", "/api/organizacion/facturacion"],
    ["POST", "/api/organizacion/facturacion/checkout"],
    ["POST", "/api/organizacion/facturacion/portal"],
  ];
  for (const [method, template] of privateApis) {
    test(`${method} ${template} answers 401`, async () => {
      const path = template.replace("{id}", valuationId);
      const response = await call(null, method, path, method === "GET" ? {} : { json: {} });
      assert.equal(response.status, 401, describeCall(`${method} ${path}`, response));
    });
  }

  test("an unknown or revoked session token is the same as no session", async () => {
    const response = await call({ ...world.a.admin, token: "not-a-real-session-token-000000000000" }, "GET", "/api/avaluos");
    assert.equal(response.status, 401);

    const revoked = await createActor(world.a.organizationId, "ADMINISTRADOR");
    await prisma.sesion.updateMany({ where: { IdUsuario: revoked.userId }, data: { BRevocada: true, DFechaRevocacion: new Date() } });
    assert.equal((await call(revoked, "GET", "/api/avaluos")).status, 401);
  });

  test("an expired session is rejected", async () => {
    const expired = await createActor(world.a.organizationId, "ADMINISTRADOR");
    await prisma.sesion.updateMany({
      where: { IdUsuario: expired.userId },
      data: { DFechaCreacion: new Date(Date.now() - 2 * 60 * 60 * 1000), DFechaExpiracion: new Date(Date.now() - 1000) },
    });
    assert.equal((await call(expired, "GET", "/api/avaluos")).status, 401);
  });
});

describe("Stripe webhook", () => {
  // Stripe's servers call it: no session and no Origin of ours. Only the signature opens it;
  // a server without STRIPE_WEBHOOK_SECRET answers 503 to everything.
  const path = "/api/stripe/webhook";
  const event = { id: "evt_e2e", type: "customer.subscription.deleted", data: { object: { id: "sub_e2e", metadata: { app: "valuaxis" } } } };

  test("without a signature it is rejected", async () => {
    const response = await call(null, "POST", path, { json: event, origin: null });
    assert.ok([400, 503].includes(response.status), describeCall(`POST ${path}`, response));
  });

  test("with a signature that does not verify it is rejected, with or without a session", async () => {
    const stale = Math.floor(Date.now() / 1000);
    for (const signature of ["not-a-signature", `t=${stale},v1=${"0".repeat(64)}`]) {
      for (const actor of [null, world.a.admin]) {
        const response = await call(actor, "POST", path, { json: event, origin: "https://evil.example", headers: { "stripe-signature": signature } });
        assert.ok([400, 503].includes(response.status), describeCall(`POST ${path} (${signature.slice(0, 12)})`, response));
      }
    }
  });

  test("the exemption from the same-origin check is that one path and method only", async () => {
    for (const [method, target] of [["PUT", path], ["DELETE", path], ["POST", `${path}/otro`], ["POST", "/api/organizacion/facturacion/checkout"]]) {
      const response = await call(world.a.admin, method, target, { json: {}, origin: "https://evil.example" });
      assert.equal(response.status, 403, describeCall(`${method} ${target} from another origin`, response));
    }
    assert.equal((await call(null, "GET", path)).status, 405);
  });
});

describe("valuation ids", () => {
  for (const id of ["123", "not-a-uuid", "00000000-0000-0000-0000-00000000000Z", "'%20OR%201=1"]) {
    test(`non-UUID id "${id}" is 404 before reaching the handler`, async () => {
      for (const path of [`/api/avaluos/${id}`, `/api/avaluos/${id}/costos`, `/api/avaluos/${id}/dictamen/pdf`]) {
        const method = path.endsWith("/pdf") ? "POST" : "GET";
        // Also without a session: the proxy answers before the guard.
        for (const actor of [null, world.a.admin]) {
          const response = await call(actor, method, path);
          assert.equal(response.status, 404, describeCall(`${method} ${path}`, response));
        }
      }
    });
  }

  test("a well-formed id that does not exist is 404", async () => {
    const id = randomUUID();
    for (const path of [`/api/avaluos/${id}`, `/api/avaluos/${id}/costos`, `/api/avaluos/${id}/conclusion`]) {
      const response = await call(world.a.admin, "GET", path);
      assert.equal(response.status, 404, describeCall(`GET ${path}`, response));
    }
  });
});

describe("cross-site requests (CSRF)", () => {
  test("a state-changing call from another origin is refused even with a valid session", async () => {
    const response = await call(world.a.admin, "PUT", `/api/avaluos/${valuationId}`, {
      json: { client: "Atacante" },
      origin: "https://evil.example",
    });
    assert.equal(response.status, 403, describeCall("PUT from evil origin", response));
  });

  test("a cross-site fetch without Origin but with Sec-Fetch-Site: cross-site is refused", async () => {
    const response = await call(world.a.admin, "DELETE", `/api/avaluos/${valuationId}`, {
      origin: null,
      headers: { "sec-fetch-site": "cross-site" },
    });
    assert.equal(response.status, 403);
    const stillThere = await call(world.a.admin, "GET", `/api/avaluos/${valuationId}`);
    assert.equal(stillThere.status, 200);
  });

  test("reads from another origin are allowed (GET is safe) but still need a session", async () => {
    const response = await call(null, "GET", "/api/avaluos", { headers: { origin: "https://evil.example" } });
    assert.equal(response.status, 401);
  });
});
