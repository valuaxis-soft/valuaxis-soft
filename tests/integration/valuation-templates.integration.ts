/**
 * The firm's templates against the local database: saved from a valuation,
 * listed, renamed and removed through their routes, private to the firm; a
 * new valuation started from one; a Block imported from one; and Blocks moved
 * to another section saved and read back in their new place.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage, type WorkUnitStore } from "next/dist/server/app-render/work-unit-async-storage.external";
import { POST as postValuation } from "../../src/app/api/avaluos/route";
import { GET as listTemplates, POST as postTemplate } from "../../src/app/api/plantillas/route";
import { DELETE as deleteTemplate, GET as getTemplate, PATCH as patchTemplate } from "../../src/app/api/plantillas/[id]/route";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { createCustomSection } from "../../src/features/valuations/components/workspace/model/content-factories";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import type { AppSection, Block } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { importableBlocks, type DocumentTemplateContent } from "../../src/features/valuations/services/document-template";
import { moveBlockToSection, pasteBlock } from "../../src/features/valuations/services/structure-transfer";
import type { ValuationTemplateSummary } from "../../src/features/valuations/services/valuation-template.service";
import { getValuationCreationCatalogs } from "../../src/features/valuations/services/valuation-catalogs.service";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createValuationFixture, prisma, TestCookieJar, withCookies } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

/** The fixture's user as a member with `roleKey`, signed in. */
async function signIn(fixture: Fixture, roleKey = "ADMINISTRADOR") {
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

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

/**
 * Creating a valuation revalidates the dashboard and schedules a notice with
 * `after`: both need the stores of a request in an action, not only cookies.
 */
function inAction<T>(jar: TestCookieJar, fn: () => Promise<T>): Promise<T> {
  return withCookies(jar, () => {
    const workStore = { route: "/integration-test", incrementalCache: {}, afterContext: { after: () => undefined } } as unknown as WorkStore;
    const unitStore = { type: "request", phase: "action", cookies: jar, userspaceMutableCookies: jar } as unknown as WorkUnitStore;
    return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(unitStore, fn));
  });
}

async function call(jar: TestCookieJar, handler: Handler, method: string, path: string, body?: unknown, id = "") {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.30", "user-agent": "Pruebas" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const run = () => handler(request, { params: Promise.resolve({ id }) });
  const response = await (handler === (postValuation as Handler) ? inAction(jar, run) : withCookies(jar, run));
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as { data?: unknown; error?: string } | null };
}

const load = async (publicId: string, organizationId: number) => initialSectionsFor((await getValuationByPublicId(publicId, organizationId))!);
const save = (fixture: Fixture, sections: AppSection[], publicId = fixture.publicId) =>
  saveValuationSections({ publicId, organizationId: fixture.organizationId, user: fixture.user, sections: buildSectionsPayload(sections) });

/** A custom section with a captured concept, and a block the calculation would write in the market section. */
async function captureDocument(fixture: Fixture) {
  const custom = createCustomSection();
  const sections = [...(await load(fixture.publicId, fixture.organizationId)), custom].map((section): AppSection => {
    if (section.id === custom.id) {
      return {
        ...section,
        title: "PLANOS",
        blocks: section.blocks.map((block) => ({ ...block, title: "PLANOS", concepts: [{ ...block.concepts[0], label: "Plano", value: "Planta baja", type: "text" }] })),
      };
    }
    if (section.id === "mercadoVenta") {
      const generated: Block = {
        id: "motor-mercado-terreno_venta-1",
        title: "COMPARABLES",
        sectionLabel: "",
        enabled: true,
        required: false,
        concepts: [{ id: "motor-c", label: "Valor unitario", value: "8,500.00", enabled: true }],
        apartados: [],
        tables: [],
        images: [],
      };
      return { ...section, blocks: [...section.blocks, generated] };
    }
    return section;
  });
  await save(fixture, sections);
  return custom.id;
}

test("a template is saved from the firm's valuation, listed, renamed and removed; its name is unique in the firm", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const customId = await captureDocument(fixture);

  const created = await call(jar, postTemplate, "POST", "/api/plantillas", { name: "Casa habitación", valuationId: fixture.publicId });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const summary = created.body!.data as ValuationTemplateSummary;
  assert.equal(summary.name, "Casa habitación");
  assert.equal(summary.includeData, false);

  const listed = await call(jar, listTemplates as Handler, "GET", "/api/plantillas");
  assert.deepEqual((listed.body!.data as ValuationTemplateSummary[]).map((item) => item.id), [summary.id]);

  const read = await call(jar, getTemplate, "GET", `/api/plantillas/${summary.id}`, undefined, summary.id);
  const content = (read.body!.data as { content: DocumentTemplateContent }).content;
  const custom = content.sections.find((section) => section.id === customId)!;
  assert.equal(custom.title, "PLANOS");
  assert.deepEqual(custom.blocks[0].concepts.map((concept) => [concept.label, concept.value]), [["Plano", ""]], "values are not kept by default");
  const market = content.sections.find((section) => section.id === "mercadoVenta")!;
  assert.equal(market.blocks.some((block) => block.id.startsWith("motor-")), false, "the calculation's blocks are not kept");

  const duplicate = await call(jar, postTemplate, "POST", "/api/plantillas", { name: "  casa HABITACIÓN ", valuationId: fixture.publicId });
  assert.equal(duplicate.status, 409);

  const renamed = await call(jar, patchTemplate, "PATCH", `/api/plantillas/${summary.id}`, { name: "Casa sola" }, summary.id);
  assert.equal((renamed.body!.data as ValuationTemplateSummary).name, "Casa sola");

  const removed = await call(jar, deleteTemplate, "DELETE", `/api/plantillas/${summary.id}`, undefined, summary.id);
  assert.equal(removed.status, 204);
  assert.equal((await call(jar, getTemplate, "GET", `/api/plantillas/${summary.id}`, undefined, summary.id)).status, 404);
  assert.deepEqual((await call(jar, listTemplates as Handler, "GET", "/api/plantillas")).body!.data, []);
});

test("another firm's templates and valuations are not found, the roles that do not edit are refused, and without a session nothing", async () => {
  const fixture = await createValuationFixture();
  const other = await createValuationFixture();
  const jar = await signIn(fixture);
  const otherJar = await signIn(other);
  await captureDocument(fixture);
  const created = await call(jar, postTemplate, "POST", "/api/plantillas", { name: "Privada", valuationId: fixture.publicId });
  const id = (created.body!.data as ValuationTemplateSummary).id;

  assert.equal((await call(otherJar, getTemplate, "GET", `/api/plantillas/${id}`, undefined, id)).status, 404);
  assert.equal((await call(otherJar, patchTemplate, "PATCH", `/api/plantillas/${id}`, { name: "Robada" }, id)).status, 404);
  assert.equal((await call(otherJar, deleteTemplate, "DELETE", `/api/plantillas/${id}`, undefined, id)).status, 404);
  assert.deepEqual((await call(otherJar, listTemplates as Handler, "GET", "/api/plantillas")).body!.data, []);
  assert.equal((await call(otherJar, postTemplate, "POST", "/api/plantillas", { name: "Ajena", valuationId: fixture.publicId })).status, 404, "another firm's valuation");
  assert.equal((await call(jar, getTemplate, "GET", "/api/plantillas/no-es-uuid", undefined, "no-es-uuid")).status, 404);
  assert.ok(!(await getValuationCreationCatalogs(other.organizationId)).templates.some((template) => template.label === "Privada"));

  const reviewer = await createValuationFixture();
  const reviewerJar = await signIn(reviewer, "REVISOR");
  assert.equal((await call(reviewerJar, listTemplates as Handler, "GET", "/api/plantillas")).status, 403);
  assert.equal((await call(reviewerJar, postTemplate, "POST", "/api/plantillas", { name: "X", valuationId: reviewer.publicId })).status, 403);

  const anonymous = new TestCookieJar();
  assert.equal((await call(anonymous, listTemplates as Handler, "GET", "/api/plantillas")).status, 401);
  assert.equal((await call(anonymous, getTemplate, "GET", `/api/plantillas/${id}`, undefined, id)).status, 401);
});

test("a new valuation starts from the firm's template, with the data when the template kept it", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const customId = await captureDocument(fixture);
  const withData = await call(jar, postTemplate, "POST", "/api/plantillas", { name: "Con datos", valuationId: fixture.publicId, includeData: true });
  assert.equal(withData.status, 201);

  const catalogs = await getValuationCreationCatalogs(fixture.organizationId);
  const option = catalogs.templates.find((template) => template.label === "Con datos")!;
  assert.equal(option.document, true);
  assert.equal(option.system, false);
  // The template serves another appraisal type than the one it was saved from.
  const otherType = catalogs.appraisalTypes.find((type) => type.id !== option.appraisalTypeId) ?? catalogs.appraisalTypes[0];
  const created = await call(jar, postValuation as Handler, "POST", "/api/avaluos", {
    title: "Desde plantilla",
    clientName: "Cliente nuevo",
    appraisalTypeId: otherType.id,
    propertyTypeId: catalogs.propertyTypes[0].id,
    operationTypeId: catalogs.operationTypes[0].id,
    templateId: option.id,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const publicId = (created.body!.data as { publicId: string }).publicId;

  const sections = await load(publicId, fixture.organizationId);
  const custom = sections.find((section) => section.id === customId);
  assert.ok(custom, "the firm's own section comes with the template");
  assert.deepEqual(custom.blocks[0].concepts.map((concept) => [concept.label, concept.value]), [["Plano", "Planta baja"]]);
  assert.equal(sections.find((section) => section.id === "mercadoVenta")!.blocks.some((block) => block.id.startsWith("motor-")), false);
  const row = await prisma.avaluo.findFirstOrThrow({ where: { UIdentificadorPublico: publicId }, select: { IdPlantillaAvaluo: true, IdOrganizacion: true } });
  assert.equal(row.IdPlantillaAvaluo, option.id);
  assert.equal(row.IdOrganizacion, fixture.organizationId);

  // Another firm cannot start from it.
  const other = await createValuationFixture();
  const otherJar = await signIn(other);
  const refused = await call(otherJar, postValuation as Handler, "POST", "/api/avaluos", {
    title: "Ajeno",
    appraisalTypeId: otherType.id,
    propertyTypeId: catalogs.propertyTypes[0].id,
    operationTypeId: catalogs.operationTypes[0].id,
    templateId: option.id,
  });
  assert.equal(refused.status, 400);
  assert.equal((refused.body as { code?: string }).code, "TEMPLATE_MISSING");
});

test("a block imported from a template is saved as a copy of its own, and a block moved to another section is read back there", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const customId = await captureDocument(fixture);
  const created = await call(jar, postTemplate, "POST", "/api/plantillas", { name: "Para importar", valuationId: fixture.publicId });
  const id = (created.body!.data as ValuationTemplateSummary).id;
  const content = ((await call(jar, getTemplate, "GET", `/api/plantillas/${id}`, undefined, id)).body!.data as { content: DocumentTemplateContent }).content;
  const imported = importableBlocks(content.sections).find((item) => item.sectionId === customId)!.block;

  // Into the same valuation: the copy takes new ids, so it does not collide with the block it came from.
  const before = await load(fixture.publicId, fixture.organizationId);
  const pasted = pasteBlock(before, customId, imported, { includeData: false, includeImages: false });
  assert.equal(pasted.changed, true);
  await save(fixture, pasted.sections);
  const reloaded = await load(fixture.publicId, fixture.organizationId);
  const blocks = reloaded.find((section) => section.id === customId)!.blocks;
  assert.equal(blocks.length, 2);
  assert.notEqual(blocks[1].id, blocks[0].id);
  assert.notEqual(blocks[1].concepts[0].id, blocks[0].concepts[0].id);
  assert.deepEqual(blocks.map((block) => block.concepts[0].value), ["Planta baja", ""]);

  // The imported block goes to Consideraciones, and back: each save reads it where it is.
  const moved = moveBlockToSection(reloaded, customId, blocks[1].id, "consideraciones");
  assert.equal(moved.changed, true);
  await save(fixture, moved.sections);
  const afterMove = await load(fixture.publicId, fixture.organizationId);
  assert.deepEqual(afterMove.find((section) => section.id === customId)!.blocks.map((block) => block.id), [blocks[0].id]);
  assert.equal(afterMove.find((section) => section.id === "consideraciones")!.blocks.at(-1)!.id, blocks[1].id);
  const back = moveBlockToSection(afterMove, "consideraciones", blocks[1].id, customId);
  await save(fixture, back.sections);
  const afterBack = await load(fixture.publicId, fixture.organizationId);
  assert.deepEqual(afterBack.find((section) => section.id === customId)!.blocks.map((block) => block.id), [blocks[0].id, blocks[1].id]);
  assert.equal(afterBack.find((section) => section.id === "consideraciones")!.blocks.some((block) => block.id === blocks[1].id), false);
  assert.equal(afterBack.find((section) => section.id === customId)!.blocks[1].concepts[0].label, "Plano");
});
