/**
 * The AI routes against the local database, with a fake in place of the
 * provider (tests/support/fake-ai-gateway.ts): permissions, tenant isolation,
 * concluded valuations, size caps, limits and what is recorded of each call.
 * No test here reaches the real service, whatever the .env holds.
 */
import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { POST as postListing } from "../../src/app/api/avaluos/[id]/ia/anuncio/route";
import { POST as postDraft } from "../../src/app/api/avaluos/[id]/ia/redaccion/route";
import { overrideAiGateway } from "../../src/features/ai/ai-gateway-provider";
import { LISTING_TEXT_MAX } from "../../src/features/ai/listing-extraction";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { getMarketCalculation } from "../../src/features/valuations/calculation/market.service";
import { concludeValuation, saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { rateLimits } from "../../src/security/rate-limit/rate-limiter";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createFakeAiGateway } from "../support/fake-ai-gateway";
import { createValuationFixture, prisma, TestCookieJar, withCookies } from "./support";

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;
type Body = { error?: string; data?: Record<string, unknown> };

// Off unless a test puts a fake: the key of the .env is never used.
overrideAiGateway(null);
afterEach(() => overrideAiGateway(null));
after(async () => {
  overrideAiGateway(undefined);
  await prisma.$disconnect();
});

/** A member of the fixture's organization with `roleKey`, signed in. */
async function signIn(fixture: Fixture, roleKey: string) {
  const role = await prisma.rol.findUniqueOrThrow({ where: { SClave: roleKey } });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: fixture.organizationId, IdUsuario: fixture.user.id, IdRol: role.IdRol, DFechaModificacion: new Date() },
  });
  const token = createSecureToken();
  await prisma.sesion.create({
    data: {
      IdUsuario: fixture.user.id,
      IdOrganizacion: fixture.organizationId,
      STokenHash: hashToken(token),
      DFechaExpiracion: new Date(Date.now() + 60 * 60 * 1000),
      DFechaUltimaActividad: new Date(),
    },
  });
  const jar = new TestCookieJar();
  jar.set(AUTH_SESSION_COOKIE, token);
  return jar;
}

const ROUTES = { anuncio: postListing, redaccion: postDraft };

async function post(jar: TestCookieJar, publicId: string, route: keyof typeof ROUTES, body: unknown) {
  const request = new Request(`http://localhost/api/avaluos/${publicId}/ia/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.20", "user-agent": "Pruebas" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const context = { params: Promise.resolve({ id: publicId }) };
  const response = await withCookies(jar, () => ROUTES[route](request, context));
  return { status: response.status, headers: response.headers, body: (await response.json()) as Body };
}

const LISTING = `Terreno en venta en Arandas, Jalisco. Superficie de 300 m2 con 10 m de frente.
Precio: $1,260,000. Informes con Marta Ruiz al 348 765 4321, marta@inmobiliaria.example.`;
const LISTING_ANSWER = {
  operation: "venta" as const, operationEvidence: "Terreno en venta", price: "$1,260,000", landArea: "300 m2", frontage: "10 m de frente",
  municipality: "Arandas", state: "Jalisco", contactName: "Marta Ruiz", contactPhone: "348 765 4321",
};
const DRAFT = {
  field: "Descripción del terreno",
  facts: [{ label: "Topografía", value: "Plana" }, { label: "Superficie", value: "300.00 m²" }, { label: "Forma", value: "Regular" }],
};
const GOOD_DRAFT = "El terreno presenta topografía plana y forma regular, con una superficie de 300.00 m².";

async function conclude(fixture: Fixture) {
  // Concluding needs the document structure, created on the first save.
  await saveValuationSections({
    publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user,
    sections: [{ id: "terreno", label: "III", title: "INFO TERRENO", blocks: [] }],
  });
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user });
}

const usageOf = (fixture: Fixture, action: string) =>
  prisma.auditoria.findMany({ where: { SIdentificadorEntidad: fixture.publicId, SAccion: action }, orderBy: { IdAuditoria: "asc" } });

test("without the AI key both routes say the assistance is not enabled, and nothing else changes", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");
  for (const [route, body] of [["anuncio", { text: LISTING }], ["redaccion", DRAFT]] as const) {
    const response = await post(jar, fixture.publicId, route, body);
    assert.equal(response.status, 503, route);
    assert.equal(response.body.error, "La asistencia con IA no está habilitada en esta instalación.");
  }
  assert.deepEqual(await usageOf(fixture, "AI_LISTING_EXTRACT"), []);
});

test("only who can edit the valuation may use the assistance", async () => {
  const fake = createFakeAiGateway({ extraction: LISTING_ANSWER, drafts: [GOOD_DRAFT] });
  for (const roleKey of ["CONSULTA", "REVISOR"]) {
    overrideAiGateway(fake.gateway);
    const fixture = await createValuationFixture();
    const jar = await signIn(fixture, roleKey);
    for (const [route, body] of [["anuncio", { text: LISTING }], ["redaccion", DRAFT]] as const) {
      const response = await post(jar, fixture.publicId, route, body);
      assert.equal(response.status, 403, `${roleKey} ${route}`);
      assert.equal(response.body.error, "Permiso insuficiente");
    }
  }
  const anonymous = await post(new TestCookieJar(), (await createValuationFixture()).publicId, "anuncio", { text: LISTING });
  assert.equal(anonymous.status, 401);
  assert.equal(fake.prompts.length, 0, "the provider was never called");
});

test("another organization's valuation is not found, and a concluded one is not assisted", async () => {
  const fake = createFakeAiGateway({ extraction: LISTING_ANSWER, drafts: [GOOD_DRAFT] });
  overrideAiGateway(fake.gateway);
  const victim = await createValuationFixture();
  const intruder = await createValuationFixture();
  const intruderJar = await signIn(intruder, "ADMINISTRADOR");
  for (const [route, body] of [["anuncio", { text: LISTING }], ["redaccion", DRAFT]] as const) {
    const response = await post(intruderJar, victim.publicId, route, body);
    assert.equal(response.status, 404, route);
    assert.equal(response.body.error, "Avalúo no encontrado");
  }

  const owner = await signIn(victim, "ADMINISTRADOR");
  await conclude(victim);
  for (const [route, body] of [["anuncio", { text: LISTING }], ["redaccion", DRAFT]] as const) {
    const response = await post(owner, victim.publicId, route, body);
    assert.equal(response.status, 409, route);
    assert.equal(response.body.error, "El avalúo está concluido; reábrelo para editarlo.");
  }
  assert.equal(fake.prompts.length, 0, "the provider was never called");
});

test("the size caps answer before the provider is called", async () => {
  const fake = createFakeAiGateway({ extraction: LISTING_ANSWER, drafts: [GOOD_DRAFT] });
  overrideAiGateway(fake.gateway);
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");

  const long = await post(jar, fixture.publicId, "anuncio", { text: "a".repeat(LISTING_TEXT_MAX + 1) });
  assert.equal(long.status, 400);
  assert.match(long.body.error ?? "", /El anuncio es demasiado largo: pega hasta 12,000 caracteres/);
  const huge = await post(jar, fixture.publicId, "anuncio", { text: "a".repeat(70_000) });
  assert.equal(huge.status, 413);
  const short = await post(jar, fixture.publicId, "anuncio", { text: "Terreno en venta" });
  assert.equal(short.status, 422);
  assert.match(short.body.error ?? "", /muy corto para ser un anuncio/);
  const badLink = await post(jar, fixture.publicId, "anuncio", { text: LISTING, url: "ftp://portal.example/1" });
  assert.equal(badLink.status, 400);

  const manyFacts = await post(jar, fixture.publicId, "redaccion", { ...DRAFT, facts: Array.from({ length: 61 }, (_, index) => ({ label: `Dato ${index}`, value: "x" })) });
  assert.equal(manyFacts.status, 400);
  const longFact = await post(jar, fixture.publicId, "redaccion", { ...DRAFT, facts: [{ label: "Nota", value: "x".repeat(2001) }] });
  assert.equal(longFact.status, 400);
  // Too little captured data is said in words, without calling the model.
  const few = await post(jar, fixture.publicId, "redaccion", { ...DRAFT, facts: [{ label: "Topografía", value: "Plana" }, { label: "Forma", value: " " }] });
  assert.equal(few.status, 422);
  assert.match(few.body.error ?? "", /Hay muy pocos datos capturados en este apartado/);

  assert.equal(fake.prompts.length, 0, "the provider was never called");
});

test("a pasted listing comes back as a proposal with its evidence; nothing is saved and only the usage is recorded", async () => {
  const fake = createFakeAiGateway({ extraction: { ...LISTING_ANSWER, topography: "plana", contactName: "Marta Ruiz" } });
  overrideAiGateway(fake.gateway);
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");

  const response = await post(jar, fixture.publicId, "anuncio", { text: LISTING, url: "https://portal.example/terreno/77" });
  assert.equal(response.status, 200, response.body.error);
  const proposal = response.body.data ?? {};
  assert.deepEqual(proposal.price, { amount: 1_260_000, currency: null, per: null, evidence: "$1,260,000" });
  assert.deepEqual(proposal.landArea, { value: 300, unit: "m2", squareMeters: 300, evidence: "300 m2" });
  assert.deepEqual(proposal.frontage, { value: 10, evidence: "10 m de frente" });
  assert.deepEqual(proposal.url, { value: "https://portal.example/terreno/77", evidence: "https://portal.example/terreno/77" });
  assert.equal(proposal.topography, null, "not written in the listing");
  assert.deepEqual(proposal.discarded, ["topography"]);
  // Only what the comparable form already stores of the advertiser: name and phone, never the email.
  assert.ok(!JSON.stringify(proposal).includes("marta@"));

  // The valuation has no new comparable: the proposal is a draft.
  const market = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.deepEqual(market.comparables, []);

  const [usage, ...more] = await usageOf(fixture, "AI_LISTING_EXTRACT");
  assert.deepEqual(more, []);
  assert.equal(usage.IdUsuario, fixture.user.id);
  assert.equal(usage.IdOrganizacion, fixture.organizationId);
  assert.equal(usage.SDireccionIP, "203.0.113.20");
  assert.deepEqual(usage.JMetadatos, {
    model: "fake-extraction", calls: 1, inputTokens: 900, outputTokens: 150, cacheReadTokens: 0, cacheWriteTokens: 0,
    characters: LISTING.length, proposed: 8, discarded: 1,
  });
  // Neither the pasted text nor the answer is stored anywhere in the record.
  const stored = JSON.stringify([usage.JMetadatos, usage.SAccion, usage.SEntidad, usage.SResultado, usage.SAgenteUsuario]);
  for (const secret of ["Arandas", "1,260,000", "Marta", "348 765"]) assert.ok(!stored.includes(secret), secret);
});

test("a draft is written from the data sent, checked, retried once and never saved", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");

  const fake = createFakeAiGateway({ drafts: ["Terreno plano de 300.00 m² con 12 m de frente.", GOOD_DRAFT] });
  overrideAiGateway(fake.gateway);
  const response = await post(jar, fixture.publicId, "redaccion", DRAFT);
  assert.equal(response.status, 200, response.body.error);
  assert.deepEqual(response.body.data, { text: GOOD_DRAFT });
  assert.equal(fake.prompts.length, 2);
  // Only the field and its data travel.
  assert.equal(fake.prompts[0].prompt.user, "Campo a redactar: Descripción del terreno\n<datos>\n- Topografía: Plana\n- Superficie: 300.00 m²\n- Forma: Regular\n</datos>");

  // Two drafts that invent figures: an error, no draft.
  const stubborn = createFakeAiGateway({ drafts: ["Terreno de 500 m².", "Terreno de 600 m²."] });
  overrideAiGateway(stubborn.gateway);
  const rejected = await post(jar, fixture.publicId, "redaccion", DRAFT);
  assert.equal(rejected.status, 422);
  assert.match(rejected.body.error ?? "", /No se pudo redactar un borrador que use solo los datos capturados/);

  const usage = await usageOf(fixture, "AI_DRAFT_WRITE");
  assert.deepEqual(usage.map((row) => row.SResultado), ["EXITOSO", "RECHAZADO"]);
  assert.deepEqual(usage[0].JMetadatos, {
    model: "fake-drafting", calls: 2, inputTokens: 1800, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0,
    facts: 3, tables: 0, tableCells: 0, attempts: 2, characters: GOOD_DRAFT.length,
  });
  assert.ok(!JSON.stringify(usage.map((row) => row.JMetadatos)).includes("Plana"), "the data is not stored");
});

test("a draft carries the apartado's title and its tables, and its numbers are checked against the cells too", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");
  const body = {
    field: "Descripción de las colindancias",
    context: "MEDIDAS Y COLINDANCIAS",
    facts: [{ label: "Forma", value: "Regular" }],
    tables: [{ title: "Colindancias", columns: ["Orientación", "Distancia", "Colindante"], rows: [["Norte", "12.50 m", "Calle Juárez"], ["Sur", "12.50 m", "Lote 7"], ["", "", ""]] }],
  };
  const good = "El predio es de forma regular; colinda al norte en 12.50 m con la calle Juárez y al sur en 12.50 m con el lote 7.";

  // A sum of the column is a figure nobody captured: discarded, asked again.
  const fake = createFakeAiGateway({ drafts: ["Predio regular con 25.00 m de colindancias en total.", good] });
  overrideAiGateway(fake.gateway);
  const response = await post(jar, fixture.publicId, "redaccion", body);
  assert.equal(response.status, 200, response.body.error);
  assert.deepEqual(response.body.data, { text: good });
  assert.equal(fake.prompts[0].prompt.user, [
    "Campo a redactar: Descripción de las colindancias",
    "Apartado: MEDIDAS Y COLINDANCIAS",
    "<datos>",
    "- Forma: Regular",
    "Tabla: Colindancias",
    "Columnas: Orientación | Distancia | Colindante",
    "- Norte | 12.50 m | Calle Juárez",
    "- Sur | 12.50 m | Lote 7",
    "</datos>",
  ].join("\n"));
  assert.match(fake.prompts[1].prompt.user, /incluía cifras que no están en los datos \(25\)/);

  // The record counts the tables and their cells, and stores none of them.
  const [usage] = await usageOf(fixture, "AI_DRAFT_WRITE");
  assert.deepEqual(usage.JMetadatos, {
    model: "fake-drafting", calls: 2, inputTokens: 1800, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0,
    facts: 1, tables: 1, tableCells: 9, attempts: 2, characters: good.length,
  });
  for (const secret of ["Juárez", "12.50", "COLINDANCIAS", "Colindancias"]) assert.ok(!JSON.stringify([usage.JMetadatos, usage.SAccion, usage.SEntidad, usage.SResultado]).includes(secret), secret);

  // A table alone is data enough; more cells than the cap, or more tables, are not accepted, and the model is not called.
  const alone = createFakeAiGateway({ drafts: [good] });
  overrideAiGateway(alone.gateway);
  assert.equal((await post(jar, fixture.publicId, "redaccion", { ...body, facts: [] })).status, 200);
  const wide = { title: "Grande", columns: Array.from({ length: 10 }, (_, index) => `C${index}`), rows: Array.from({ length: 40 }, () => Array.from({ length: 10 }, () => "x")) };
  const tooManyCells = await post(jar, fixture.publicId, "redaccion", { ...body, tables: [wide] });
  assert.equal(tooManyCells.status, 400);
  assert.match(JSON.stringify(tooManyCells.body), /Se redacta con hasta 400 celdas de tablas/);
  assert.equal((await post(jar, fixture.publicId, "redaccion", { ...body, tables: Array.from({ length: 7 }, () => body.tables[0]) })).status, 400);
  assert.equal((await post(jar, fixture.publicId, "redaccion", { ...body, tables: [{ ...body.tables[0], rows: [["x".repeat(201), "", ""]] }] })).status, 400);
  assert.equal(alone.prompts.length, 1);
});

test("provider failures are told in words, and the limit per user answers 429 with Retry-After", async (t) => {
  t.mock.method(console, "warn", () => {});
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");

  for (const [failure, status, words] of [["no_credit", 503, /no tiene saldo/], ["rate_limit", 429, /demasiadas solicitudes/], ["overloaded", 503, /saturado/]] as const) {
    overrideAiGateway(createFakeAiGateway({ failure }).gateway);
    const response = await post(jar, fixture.publicId, "anuncio", { text: LISTING });
    assert.equal(response.status, status, failure);
    assert.match(response.body.error ?? "", words);
  }

  const fake = createFakeAiGateway({ extraction: LISTING_ANSWER });
  overrideAiGateway(fake.gateway);
  rateLimits.aiByUser.reset(`ai:user:${fixture.user.id}`);
  for (let call = 1; call <= 20; call += 1) {
    assert.equal((await post(jar, fixture.publicId, "anuncio", { text: LISTING })).status, 200, `call ${call}`);
  }
  const limited = await post(jar, fixture.publicId, "anuncio", { text: LISTING });
  assert.equal(limited.status, 429);
  assert.match(limited.body.error ?? "", /límite de solicitudes de IA/);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(fake.prompts.length, 20, "the call over the limit never reached the provider");
});
