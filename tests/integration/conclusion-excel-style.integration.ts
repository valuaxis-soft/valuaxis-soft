/**
 * Álvaro, 24 Nov 2026, against the local database: a kind chosen as «Otro»
 * says which and prints so; «Guardar como plantilla» with «Incluir imágenes»
 * takes the carátula's image to the valuations made from it; and the names
 * of the concluded values never speak of intangibles, in the document or in
 * the resumen de valores.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage, type WorkUnitStore } from "next/dist/server/app-render/work-unit-async-storage.external";
import { POST as postValuation } from "../../src/app/api/avaluos/route";
import { PUT as putConclusion } from "../../src/app/api/avaluos/[id]/conclusion/route";
import { POST as postTemplate } from "../../src/app/api/plantillas/route";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { COVER_IMAGE_ENTITY, COVER_IMAGE_RELATION_TYPE } from "../../src/features/files/services/valuation-cover-image";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { listValuationsPage } from "../../src/features/valuations/repositories/valuation-list.repository";
import { INTANGIBLE_REFUSAL_MESSAGE } from "../../src/features/valuations/services/intangible-labels";
import { getValuationCreationCatalogs } from "../../src/features/valuations/services/valuation-catalogs.service";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createValuationFixture, prisma, TestCookieJar, withCookies } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;
type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

async function signIn(fixture: Fixture) {
  const role = await prisma.rol.findUniqueOrThrow({ where: { SClave: "ADMINISTRADOR" } });
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

/** Creating a valuation revalidates the dashboard and schedules a notice: it needs the stores of an action. */
function inAction<T>(jar: TestCookieJar, fn: () => Promise<T>): Promise<T> {
  return withCookies(jar, () => {
    const workStore = { route: "/integration-test", incrementalCache: {}, afterContext: { after: () => undefined } } as unknown as WorkStore;
    const unitStore = { type: "request", phase: "action", cookies: jar, userspaceMutableCookies: jar } as unknown as WorkUnitStore;
    return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(unitStore, fn));
  });
}

async function call(jar: TestCookieJar, handler: Handler, method: string, path: string, body: unknown, id = "") {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.31", "user-agent": "Pruebas" },
    body: JSON.stringify(body),
  });
  const run = () => handler(request, { params: Promise.resolve({ id }) });
  const response = await (handler === (postValuation as Handler) ? inAction(jar, run) : withCookies(jar, run));
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as { data?: { publicId?: string }; error?: string; code?: string } | null };
}

/** The carátula image of a valuation as an upload leaves it: a stored file related as its principal image. */
async function giveCoverImage(fixture: Fixture) {
  const [fileType, relationType] = await Promise.all([
    prisma.tipoArchivo.findFirstOrThrow({ where: { SClave: "IMAGEN_SUJETO" } }),
    prisma.tipoRelacionArchivo.findFirstOrThrow({ where: { SClave: COVER_IMAGE_RELATION_TYPE } }),
  ]);
  const file = await prisma.archivo.create({
    data: {
      UIdentificadorPublico: randomUUID(),
      IdOrganizacion: fixture.organizationId,
      IdUsuarioCarga: fixture.user.id,
      IdTipoArchivo: fileType.IdTipoArchivo,
      SBucket: "pruebas",
      SClaveObjeto: `pruebas/${randomUUID()}.jpg`,
      SNombreOriginal: "fachada-de-prueba.jpg",
      STipoMime: "image/jpeg",
      ITamanoBytes: BigInt(1234),
      SChecksum: "0".repeat(64),
    },
  });
  await prisma.relacionArchivo.create({
    data: {
      IdArchivo: file.IdArchivo,
      IdTipoRelacionArchivo: relationType.IdTipoRelacionArchivo,
      SEntidad: COVER_IMAGE_ENTITY,
      SIdentificadorEntidad: fixture.publicId,
      BPrincipal: true,
    },
  });
  return file;
}

const principalFile = (publicId: string) =>
  prisma.relacionArchivo.findFirst({ where: { SEntidad: COVER_IMAGE_ENTITY, SIdentificadorEntidad: publicId, BPrincipal: true }, select: { IdArchivo: true } });

test("a kind chosen as «Otro» asks which: refused without it, and its name prints in the carátula and the list", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const catalogs = await getValuationCreationCatalogs(fixture.organizationId);
  const other = <T extends { key?: string }>(options: T[]) => options.find((option) => ["OTRO", "OTRA"].includes(option.key ?? ""))!;
  const base = {
    title: "Kiosco de prueba",
    clientName: "Cliente inventado",
    appraisalTypeId: other(catalogs.appraisalTypes).id,
    propertyTypeId: other(catalogs.propertyTypes).id,
    operationTypeId: other(catalogs.operationTypes).id,
  };

  const refused = await call(jar, postValuation as Handler, "POST", "/api/avaluos", { ...base, appraisalTypeOther: "Arbitraje", propertyTypeOther: "Kiosco" });
  assert.equal(refused.status, 400);
  assert.equal(refused.body?.code, "OWN_KIND_NAME_MISSING");
  assert.match(refused.body?.error ?? "", /Tipo de operación/);

  const created = await call(jar, postValuation as Handler, "POST", "/api/avaluos", {
    ...base, appraisalTypeOther: "Arbitraje", propertyTypeOther: "Kiosco", operationTypeOther: "Dación en pago",
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const publicId = created.body!.data!.publicId!;

  const detail = (await getValuationByPublicId(publicId, fixture.organizationId))!;
  assert.equal(detail.propertyKindOther, "Kiosco");
  assert.equal(detail.valuationKindOther, "Dación en pago");
  assert.equal(detail.caratula?.proposito, "Dación en pago", "the purpose of the carátula says which operation");

  const { items } = await listValuationsPage({ organizationId: fixture.organizationId, page: 1, pageSize: 20 });
  const row = items.find((item) => item.id === publicId)!;
  assert.equal(row.propertyKindName, "Kiosco");
  assert.equal(row.appraisalKindName, "Arbitraje");
});

test("«Guardar como plantilla» with «Incluir imágenes» takes the carátula's image, and a valuation made from it shows it", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const file = await giveCoverImage(fixture);

  const without = await call(jar, postTemplate as Handler, "POST", "/api/plantillas", { name: "Sin imágenes", valuationId: fixture.publicId, includeImages: false });
  assert.equal(without.status, 201, JSON.stringify(without.body));
  const withImages = await call(jar, postTemplate as Handler, "POST", "/api/plantillas", { name: "Con imágenes", valuationId: fixture.publicId, includeImages: true });
  assert.equal(withImages.status, 201, JSON.stringify(withImages.body));
  assert.equal((withImages.body!.data as { includeImages: boolean }).includeImages, true);

  const catalogs = await getValuationCreationCatalogs(fixture.organizationId);
  const create = (label: string) => call(jar, postValuation as Handler, "POST", "/api/avaluos", {
    title: `Desde «${label}»`,
    appraisalTypeId: catalogs.appraisalTypes[0].id,
    propertyTypeId: catalogs.propertyTypes.find((type) => type.key === "CASA_HABITACION")!.id,
    operationTypeId: catalogs.operationTypes.find((type) => type.key === "VENTA")!.id,
    templateId: catalogs.templates.find((template) => template.label === label)!.id,
  });

  const fromImages = await create("Con imágenes");
  assert.equal(fromImages.status, 201, JSON.stringify(fromImages.body));
  assert.equal((await principalFile(fromImages.body!.data!.publicId!))?.IdArchivo, file.IdArchivo, "the same stored image, now the new valuation's");
  // The original keeps its own.
  assert.equal((await principalFile(fixture.publicId))?.IdArchivo, file.IdArchivo);

  const fromPlain = await create("Sin imágenes");
  assert.equal(fromPlain.status, 201);
  assert.equal(await principalFile(fromPlain.body!.data!.publicId!), null, "without images, no carátula image");
});

test("the names of the concluded values never speak of intangibles: the document and the resumen refuse them", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const conclusion = (label: string, observation = "") => [{
    id: "conclusiones",
    label: "CONCLUSIÓN",
    title: "CONCLUSIÓN",
    blocks: [{
      id: "conclusion-del-valor",
      title: "CONCLUSIÓN DEL VALOR",
      concepts: [
        { id: "c-costos", label, value: "", calculationKey: "conclusion:approach:costos" },
        { id: "c-valor", label: "Valor concluido", value: "", calculationKey: "conclusion:value" },
        { id: "c-obs", label: "Observaciones finales", value: observation, type: "longText" as const },
      ],
    }],
  }];
  const save = (label: string, observation?: string) =>
    saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections: conclusion(label, observation) });

  await assert.rejects(save("Valor de la marca"), (error: Error & { status?: number }) => error.message === INTANGIBLE_REFUSAL_MESSAGE && error.status === 400);
  await assert.rejects(save("Valor del negocio en marcha"), (error: Error) => error.message === INTANGIBLE_REFUSAL_MESSAGE);
  // A free text may mention a trademark; a name without one is kept.
  await save("Valor físico", "El inmueble no incluye la marca comercial del ocupante.");

  const refused = await call(jar, putConclusion as Handler, "PUT", `/api/avaluos/${fixture.publicId}/conclusion`, {
    method: { kind: "single", approach: "costos" },
    justification: null,
    summaryRows: [{ source: "costos", label: "Valor del crédito mercantil" }],
  }, fixture.publicId);
  assert.equal(refused.status, 400);
  assert.ok(refused.body?.error?.includes(INTANGIBLE_REFUSAL_MESSAGE.replace(/\.$/, "")), refused.body?.error);
});
