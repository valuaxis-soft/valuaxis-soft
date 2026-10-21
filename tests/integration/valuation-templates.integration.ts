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

test("saving under a taken name is refused unless replaced: a new version, read by new valuations and by the import", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const customId = await captureDocument(fixture);
  const first = await call(jar, postTemplate, "POST", "/api/plantillas", {
    name: "Departamento",
    description: "Para departamentos en condominio",
    valuationId: fixture.publicId,
  });
  assert.equal(first.status, 201);
  const original = first.body!.data as ValuationTemplateSummary;
  assert.equal(original.version, 1);
  assert.equal(original.description, "Para departamentos en condominio");
  assert.equal(original.createdBy, "Perito");
  assert.equal(original.versionBy, "Perito");

  // The document changes: the concept now carries another label.
  const sections = (await load(fixture.publicId, fixture.organizationId)).map((section): AppSection => section.id === customId
    ? { ...section, blocks: section.blocks.map((block) => ({ ...block, concepts: [{ ...block.concepts[0], label: "Plano nuevo" }] })) }
    : section);
  await save(fixture, sections);

  const refused = await call(jar, postTemplate, "POST", "/api/plantillas", { name: "DEPARTAMENTO", valuationId: fixture.publicId, includeData: true });
  assert.equal(refused.status, 409, "without asking to replace, the name is still taken");
  const replaced = await call(jar, postTemplate, "POST", "/api/plantillas", {
    name: "departamento",
    valuationId: fixture.publicId,
    includeData: true,
    replace: true,
  });
  assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
  const second = replaced.body!.data as ValuationTemplateSummary;
  assert.equal(second.id, original.id, "the same template");
  assert.equal(second.name, "Departamento", "the name stays as it was");
  assert.equal(second.version, 2);
  assert.equal(second.includeData, true);
  assert.equal(second.description, "Para departamentos en condominio", "a replacement without a description keeps it");
  assert.equal(second.createdBy, "Perito");

  const listed = (await call(jar, listTemplates as Handler, "GET", "/api/plantillas")).body!.data as ValuationTemplateSummary[];
  assert.deepEqual(listed.map((item) => [item.name, item.version]), [["Departamento", 2]], "one template, not two");
  const versions = await prisma.versionPlantilla.findMany({
    where: { plantillaAvaluo: { UIdentificadorPublico: original.id } },
    orderBy: { INumeroVersion: "asc" },
    select: { INumeroVersion: true, BActiva: true },
  });
  assert.deepEqual(versions.map((version) => [version.INumeroVersion, version.BActiva]), [[1, false], [2, true]]);

  // "Importar bloque" and a new valuation read the latest version.
  const read = await call(jar, getTemplate, "GET", `/api/plantillas/${original.id}`, undefined, original.id);
  const content = (read.body!.data as { content: DocumentTemplateContent }).content;
  assert.deepEqual(content.sections.find((section) => section.id === customId)!.blocks[0].concepts.map((concept) => [concept.label, concept.value]), [["Plano nuevo", "Planta baja"]]);
  const catalogs = await getValuationCreationCatalogs(fixture.organizationId);
  const option = catalogs.templates.find((template) => template.publicId === original.id)!;
  assert.equal(option.description, "Para departamentos en condominio");
  const created = await call(jar, postValuation as Handler, "POST", "/api/avaluos", {
    title: "Desde la versión 2",
    clientName: "Cliente",
    appraisalTypeId: catalogs.appraisalTypes[0].id,
    propertyTypeId: catalogs.propertyTypes[0].id,
    operationTypeId: catalogs.operationTypes[0].id,
    templateId: option.id,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const fromTemplate = await load((created.body!.data as { publicId: string }).publicId, fixture.organizationId);
  assert.equal(fromTemplate.find((section) => section.id === customId)!.blocks[0].concepts[0].label, "Plano nuevo");

  // A replacement with a description changes it; an empty one in the rename clears it.
  const third = await call(jar, postTemplate, "POST", "/api/plantillas", { name: "Departamento", description: "Otra", valuationId: fixture.publicId, replace: true });
  assert.equal((third.body!.data as ValuationTemplateSummary).description, "Otra");
  assert.equal((third.body!.data as ValuationTemplateSummary).version, 3);
  const cleared = await call(jar, patchTemplate, "PATCH", `/api/plantillas/${original.id}`, { name: "Departamento", description: "" }, original.id);
  assert.equal((cleared.body!.data as ValuationTemplateSummary).description, null);

  // `replace` with a free name simply creates the template.
  const fresh = await call(jar, postTemplate, "POST", "/api/plantillas", { name: "Bodega", valuationId: fixture.publicId, replace: true });
  assert.equal(fresh.status, 201);
  assert.equal((fresh.body!.data as ValuationTemplateSummary).version, 1);
});

test("a rename keeps the name unique ignoring case and accents, and a removed template leaves its valuations as they were", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const customId = await captureDocument(fixture);
  const a = (await call(jar, postTemplate, "POST", "/api/plantillas", { name: "Casa habitación", valuationId: fixture.publicId, includeData: true })).body!.data as ValuationTemplateSummary;
  const b = (await call(jar, postTemplate, "POST", "/api/plantillas", { name: "Terreno", valuationId: fixture.publicId })).body!.data as ValuationTemplateSummary;

  assert.equal((await call(jar, patchTemplate, "PATCH", `/api/plantillas/${b.id}`, { name: "CASA  HABITACION" }, b.id)).status, 409);
  const same = await call(jar, patchTemplate, "PATCH", `/api/plantillas/${a.id}`, { name: "Casa Habitacion", description: "Con datos de ejemplo" }, a.id);
  assert.equal(same.status, 200, "its own name, written another way, is not taken");
  assert.equal((same.body!.data as ValuationTemplateSummary).description, "Con datos de ejemplo");
  assert.equal((await call(jar, patchTemplate, "PATCH", `/api/plantillas/${b.id}`, { name: " " }, b.id)).status, 400);

  const catalogs = await getValuationCreationCatalogs(fixture.organizationId);
  const option = catalogs.templates.find((template) => template.publicId === a.id)!;
  const created = await call(jar, postValuation as Handler, "POST", "/api/avaluos", {
    title: "Antes de eliminar",
    clientName: "Cliente",
    appraisalTypeId: catalogs.appraisalTypes[0].id,
    propertyTypeId: catalogs.propertyTypes[0].id,
    operationTypeId: catalogs.operationTypes[0].id,
    templateId: option.id,
  });
  const publicId = (created.body!.data as { publicId: string }).publicId;
  const before = await load(publicId, fixture.organizationId);

  assert.equal((await call(jar, deleteTemplate, "DELETE", `/api/plantillas/${a.id}`, undefined, a.id)).status, 204);
  assert.equal((await call(jar, deleteTemplate, "DELETE", `/api/plantillas/${a.id}`, undefined, a.id)).status, 404, "already removed");
  const row = await prisma.plantillaAvaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: a.id }, select: { BActivo: true, DFechaEliminacion: true } });
  assert.equal(row.BActivo, false);
  assert.ok(row.DFechaEliminacion, "a soft delete: the row stays");
  assert.deepEqual(await load(publicId, fixture.organizationId), before, "the valuation created from it is unchanged");
  assert.equal(before.find((section) => section.id === customId)!.blocks[0].concepts[0].value, "Planta baja");
  assert.ok(!(await getValuationCreationCatalogs(fixture.organizationId)).templates.some((template) => template.publicId === a.id));

  // The name is free again once removed.
  assert.equal((await call(jar, patchTemplate, "PATCH", `/api/plantillas/${b.id}`, { name: "Casa habitación" }, b.id)).status, 200);
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

  // "Reemplazar" from another firm under the same name saves a template of its own; A's stays as it was.
  await captureDocument(other);
  const foreign = await call(otherJar, postTemplate, "POST", "/api/plantillas", { name: "privada", valuationId: other.publicId, replace: true });
  assert.equal(foreign.status, 201);
  assert.notEqual((foreign.body!.data as ValuationTemplateSummary).id, id);
  const mine = (await call(jar, getTemplate, "GET", `/api/plantillas/${id}`, undefined, id)).body!.data as ValuationTemplateSummary;
  assert.deepEqual([mine.name, mine.version], ["Privada", 1]);

  for (const roleKey of ["REVISOR", "CONSULTA"]) {
    const member = await createValuationFixture();
    const memberJar = await signIn(member, roleKey);
    assert.equal((await call(memberJar, listTemplates as Handler, "GET", "/api/plantillas")).status, 403, roleKey);
    assert.equal((await call(memberJar, postTemplate, "POST", "/api/plantillas", { name: "X", valuationId: member.publicId })).status, 403, roleKey);
    // Their own firm's template, saved by someone who edits.
    const row = await prisma.plantillaAvaluo.create({
      data: { IdOrganizacion: member.organizationId, IdTipoAvaluo: (await prisma.tipoAvaluo.findFirstOrThrow()).IdTipoAvaluo, SNombre: "De su despacho" },
      select: { UIdentificadorPublico: true },
    });
    const path = `/api/plantillas/${row.UIdentificadorPublico}`;
    assert.equal((await call(memberJar, postTemplate, "POST", "/api/plantillas", { name: "De su despacho", valuationId: member.publicId, replace: true })).status, 403, roleKey);
    assert.equal((await call(memberJar, getTemplate, "GET", path, undefined, row.UIdentificadorPublico)).status, 403, roleKey);
    assert.equal((await call(memberJar, patchTemplate, "PATCH", path, { name: "Otra" }, row.UIdentificadorPublico)).status, 403, roleKey);
    assert.equal((await call(memberJar, deleteTemplate, "DELETE", path, undefined, row.UIdentificadorPublico)).status, 403, roleKey);
    const unchanged = await prisma.plantillaAvaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: row.UIdentificadorPublico }, select: { SNombre: true, BActivo: true } });
    assert.deepEqual(unchanged, { SNombre: "De su despacho", BActivo: true }, roleKey);
  }

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
