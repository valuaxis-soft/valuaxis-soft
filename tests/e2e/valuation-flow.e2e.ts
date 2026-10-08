/**
 * Smoke test of the main flow through the real server: a valuador creates a
 * valuation, captures the approaches, reads them back, concludes, cannot edit
 * the concluded valuation, reopens it and edits again.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  addRentMarket,
  call,
  comparablesCsv,
  conclusionPayload,
  costPayload,
  createValuation,
  createWorld,
  describeCall,
  emailPayload,
  incomePayload,
  prisma,
  reopenPayload,
  shortListingPayload,
  thinDraftPayload,
  waitForServer,
  type World,
} from "./support";

let world: World;

before(async () => {
  await waitForServer();
  world = await createWorld();
});
after(() => prisma.$disconnect());

test("create → capture → read back → conclude → locked → reopen → edit", async () => {
  const actor = world.a.valuador;
  const ok = (label: string, response: Awaited<ReturnType<typeof call>>, status = 200) =>
    assert.equal(response.status, status, describeCall(label, response));

  // Create: the valuation belongs to the valuador's organization and gets a folio.
  const id = await createValuation(actor, "Casa habitación E2E");
  const created = await call(actor, "GET", `/api/avaluos/${id}`);
  ok("GET valuation", created);
  assert.equal(created.data.id, id);
  assert.equal(created.data.client, "Cliente E2E");
  assert.ok(created.data.folio, "the valuation has a folio");
  const list = await call(actor, "GET", "/api/avaluos");
  ok("GET list", list);
  assert.ok(JSON.stringify(list.data).includes(id), "the new valuation is in the list");

  // General data.
  ok("PUT valuation", await call(actor, "PUT", `/api/avaluos/${id}`, { json: { client: "Cliente E2E", location: "Av. Juárez 100", postalCode: "44100" } }));
  const row = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: id }, select: { SNombreCliente: true, IdOrganizacion: true } });
  assert.equal(row.SNombreCliente, "Cliente E2E");
  assert.equal(row.IdOrganizacion, world.a.organizationId);

  // Cost approach: saved and read back as captured.
  const savedCost = await call(actor, "PUT", `/api/avaluos/${id}/costos`, { json: costPayload });
  ok("PUT costos", savedCost);
  const cost = await call(actor, "GET", `/api/avaluos/${id}/costos`);
  ok("GET costos", cost);
  assert.equal(cost.data.configured, true);
  assert.equal(cost.data.locked, false);
  assert.equal(cost.data.land.subjectArea, 200);
  assert.equal(cost.data.land.unitValue, 1500);

  // Market: comparables imported from a CSV, after a preview.
  const preview = await call(actor, "POST", `/api/avaluos/${id}/mercado/comparables/importar?tipo=TERRENO_VENTA`, { form: comparablesCsv() });
  ok("import preview", preview);
  assert.equal(preview.data.preview.valid, 2);
  const imported = await call(actor, "POST", `/api/avaluos/${id}/mercado/comparables/importar?tipo=TERRENO_VENTA&confirmar=1`, { form: comparablesCsv() });
  ok("import confirm", imported, 201);
  const market = await call(actor, "GET", `/api/avaluos/${id}/mercado?tipo=TERRENO_VENTA`);
  ok("GET mercado", market);
  assert.deepEqual(market.data.comparables.map((row: { location: string }) => row.location), ["Calle Uno 1", "Calle Dos 2"]);

  // Income from a rent market.
  await addRentMarket(actor, id);
  ok("PUT ingresos", await call(actor, "PUT", `/api/avaluos/${id}/ingresos`, { json: incomePayload }));
  const income = await call(actor, "GET", `/api/avaluos/${id}/ingresos`);
  ok("GET ingresos", income);
  assert.equal(income.data.method, "tabla");

  // Conclusion on the cost approach: the concluded value is the cost value.
  ok("PUT conclusion", await call(actor, "PUT", `/api/avaluos/${id}/conclusion`, { json: conclusionPayload }));
  const conclusion = await call(actor, "GET", `/api/avaluos/${id}/conclusion`);
  ok("GET conclusion", conclusion);
  assert.deepEqual(conclusion.data.method, { kind: "single", approach: "costos" });
  assert.ok(conclusion.data.values.costos > 0, `cost value ${conclusion.data.values.costos}`);
  assert.equal(conclusion.data.values.ingresos !== null, true);

  // Export: the summary PDF is generated without a browser.
  const exported = await call(actor, "GET", `/api/avaluos/${id}/export`);
  ok("GET export", exported);
  assert.equal(exported.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(exported.body as ArrayBuffer).subarray(0, 5).toString(), "%PDF-");

  // Conclude: the valuation is locked, edits are refused with 409.
  ok("conclude", await call(actor, "POST", `/api/avaluos/${id}/conclude`));
  const locked = await call(actor, "GET", `/api/avaluos/${id}/costos`);
  assert.equal(locked.data.locked, true);
  const editLocked = await call(actor, "PUT", `/api/avaluos/${id}/costos`, { json: costPayload });
  assert.equal(editLocked.status, 409, describeCall("PUT costos on a concluded valuation", editLocked));
  const importLocked = await call(actor, "POST", `/api/avaluos/${id}/mercado/comparables/importar?tipo=TERRENO_VENTA`, { form: comparablesCsv() });
  assert.equal(importLocked.status, 409, describeCall("import on a concluded valuation", importLocked));
  // The AI assistance is for a valuation being edited: refused before anything is sent out.
  for (const [route, json] of [["anuncio", shortListingPayload], ["redaccion", thinDraftPayload]] as const) {
    const assisted = await call(actor, "POST", `/api/avaluos/${id}/ia/${route}`, { json });
    assert.equal(assisted.status, 409, describeCall(`ia/${route} on a concluded valuation`, assisted));
  }

  // Reopen needs a reason; then the valuation is editable again.
  const noReason = await call(actor, "POST", `/api/avaluos/${id}/reopen`, { json: { reason: "", acceptedText: "Acepto" } });
  assert.equal(noReason.status, 400);
  ok("reopen", await call(actor, "POST", `/api/avaluos/${id}/reopen`, { json: reopenPayload }));
  ok("PUT costos after reopening", await call(actor, "PUT", `/api/avaluos/${id}/costos`, {
    json: { ...costPayload, land: { ...costPayload.land, unitValue: 1800 } },
  }));
  const reopened = await call(actor, "GET", `/api/avaluos/${id}/costos`);
  assert.equal(reopened.data.locked, false);
  assert.equal(reopened.data.land.unitValue, 1800);

  // Delete: gone for everyone in the organization.
  ok("DELETE", await call(actor, "DELETE", `/api/avaluos/${id}`));
  assert.equal((await call(world.a.admin, "GET", `/api/avaluos/${id}`)).status, 404);
});

test("dictamen PDF and email pass authorization and reach the PDF renderer", async () => {
  const actor = world.a.valuador;
  const id = await createValuation(actor, "Dictamen E2E");
  // 200 when Chromium is installed (CHROMIUM_PATH); 503 when it is not.
  const pdf = await call(actor, "POST", `/api/avaluos/${id}/dictamen/pdf`);
  assert.ok([200, 503].includes(pdf.status), describeCall("POST dictamen/pdf", pdf));
  if (pdf.status === 200) assert.equal(pdf.headers.get("content-type"), "application/pdf");

  const invalid = await call(actor, "POST", `/api/avaluos/${id}/dictamen/correo`, { json: { ...emailPayload, to: ["no-es-correo"] } });
  assert.equal(invalid.status, 400);
  const email = await call(actor, "POST", `/api/avaluos/${id}/dictamen/correo`, { json: emailPayload });
  assert.ok([200, 503].includes(email.status), describeCall("POST dictamen/correo", email));
});

test("new valuations take the firm's folio prefix", async () => {
  const firm = await call(world.a.admin, "PUT", "/api/organizacion/despacho", { json: { validityMonths: 6, folioPrefix: "E2EF" } });
  assert.equal(firm.status, 200, describeCall("PUT despacho", firm));
  const id = await createValuation(world.a.valuador, "Folio E2E");
  const row = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: id }, select: { SFolio: true } });
  assert.match(row.SFolio, /^E2EF/);
});

test("saving the income approach with a unit rent on every rentable unit and no rent market", async () => {
  const id = await createValuation(world.a.valuador, "Ingresos sin mercado de rentas");
  const saved = await call(world.a.valuador, "PUT", `/api/avaluos/${id}/ingresos`, { json: incomePayload });
  assert.equal(saved.status, 200, describeCall("PUT ingresos", saved));
});
