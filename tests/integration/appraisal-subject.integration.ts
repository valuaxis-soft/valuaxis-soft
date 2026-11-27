/**
 * «Clase de avalúo» and «¿Qué se está valuando?» against the local database
 * (voice notes of 24 Nov 2026): the firm's own lists, the class and essence
 * a valuation is created with and changed to in the carátula, the machinery
 * carátula, and the machine's data of a comparable. Every name is invented.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage, type WorkUnitStore } from "next/dist/server/app-render/work-unit-async-storage.external";
import { POST as postValuation } from "../../src/app/api/avaluos/route";
import { PUT as putValuation } from "../../src/app/api/avaluos/[id]/route";
import { DELETE as deleteListItem, GET as getLists, POST as postListItem } from "../../src/app/api/organizacion/despacho/listas/route";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { addCustomUnit, getCustomUnits, getFirmLists } from "../../src/features/firm/firm.service";
import { getComparableCard } from "../../src/features/valuations/calculation/comparable-card.service";
import { createComparable, getMarketCalculation, updateComparable } from "../../src/features/valuations/calculation/market.service";
import { createBaseComparable } from "../../src/features/valuations/comparable-base/comparable-base-write.service";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { comparableFormValues } from "../../src/features/valuations/calculation/market-types";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { listValuationsPage } from "../../src/features/valuations/repositories/valuation-list.repository";
import { getValuationCreationCatalogs } from "../../src/features/valuations/services/valuation-catalogs.service";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createValuationFixture, prisma, TestCookieJar, withCookies } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;
type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
type Body = { data?: { publicId?: string; lists?: Awaited<ReturnType<typeof getFirmLists>> }; error?: string; code?: string } | null;

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

/** Creating and saving a valuation revalidate the dashboard and schedule a notice: they need the stores of an action. */
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
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.32", "user-agent": "Pruebas" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const response = await inAction(jar, () => handler(request, { params: Promise.resolve({ id }) }));
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as Body };
}

async function creationBase(fixture: Fixture) {
  const catalogs = await getValuationCreationCatalogs(fixture.organizationId);
  const general = catalogs.templates.find((template) => template.system && /general/i.test(template.label));
  return {
    title: "Retroexcavadora de prueba",
    clientName: "Cliente inventado",
    appraisalTypeId: catalogs.appraisalTypes.find((option) => option.key === "COMERCIAL")!.id,
    // The form sends the kind it derived; the server derives it again from the class and essence.
    propertyTypeId: catalogs.propertyTypes[0].id,
    operationTypeId: catalogs.operationTypes[0].id,
    templateId: general?.id ?? null,
    catalogs,
  };
}

test("a name typed and ticked joins the firm's list, only for that firm, and the units keep theirs", async () => {
  const owner = await createValuationFixture();
  const stranger = await createValuationFixture();
  const jar = await signIn(owner);

  await addCustomUnit(owner.user, "cabezas");
  const added = await call(jar, postListItem as unknown as Handler, "POST", "/api/organizacion/despacho/listas", { list: "queSeValua", appraisalClass: "MAQUINARIA", name: " Grúa  telescópica " });
  assert.equal(added.status, 200, JSON.stringify(added.body));
  await call(jar, postListItem as unknown as Handler, "POST", "/api/organizacion/despacho/listas", { list: "tipoAvaluo", name: "Catastral" });
  const again = await call(jar, postListItem as unknown as Handler, "POST", "/api/organizacion/despacho/listas", { list: "queSeValua", appraisalClass: "MAQUINARIA", name: "grua telescopica" });
  assert.deepEqual(again.body?.data?.lists?.essences.MAQUINARIA, ["Grúa telescópica"], "once, however it was written");
  const refused = await call(jar, postListItem as unknown as Handler, "POST", "/api/organizacion/despacho/listas", { list: "queSeValua", name: "Sin clase" });
  assert.equal(refused.status, 400);

  // A unit added afterwards keeps the lists, and the lists keep the units.
  await addCustomUnit(owner.user, "lotes");
  assert.deepEqual(await getCustomUnits(owner.organizationId), ["cabezas", "lotes"]);
  const read = await call(jar, getLists as unknown as Handler, "GET", "/api/organizacion/despacho/listas");
  assert.deepEqual(read.body?.data?.lists, { essences: { INMUEBLE: [], MAQUINARIA: ["Grúa telescópica"], AGROPECUARIO: [] }, appraisalKinds: ["Catastral"] });
  assert.deepEqual((await getValuationCreationCatalogs(owner.organizationId)).firmLists, read.body?.data?.lists, "the creation form offers them");

  // Another firm does not see them.
  assert.deepEqual(await getFirmLists(stranger.organizationId), { essences: { INMUEBLE: [], MAQUINARIA: [], AGROPECUARIO: [] }, appraisalKinds: [] });

  const removed = await call(jar, deleteListItem as unknown as Handler, "DELETE", "/api/organizacion/despacho/listas", { list: "tipoAvaluo", name: "catastral" });
  assert.deepEqual(removed.body?.data?.lists?.appraisalKinds, []);
  assert.deepEqual(await getCustomUnits(owner.organizationId), ["cabezas", "lotes"]);
});

test("a machinery valuation is created with its class and essence: the carátula asks for the machine and the list shows both", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const { catalogs, ...base } = await creationBase(fixture);
  const refused = await call(jar, postValuation as Handler, "POST", "/api/avaluos", { ...base, appraisalClass: "MAQUINARIA", essence: "  " });
  assert.equal(refused.body?.code, "ESSENCE_MISSING");

  const created = await call(jar, postValuation as Handler, "POST", "/api/avaluos", { ...base, appraisalClass: "MAQUINARIA", essence: "Retroexcavadora" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const publicId = created.body!.data!.publicId!;
  const detail = (await getValuationByPublicId(publicId, fixture.organizationId))!;
  assert.equal(detail.propertyKind, "maquinaria_equipo", "the «Tipo de bien» follows from the class, whatever the form sent");
  assert.equal(detail.appraisalClass, "MAQUINARIA");
  assert.equal(detail.essence, "Retroexcavadora");
  assert.equal(detail.appraisalKind, "comercial");

  assert.ok(base.templateId, "the system's general template starts the carátula");
  {
    const caratula = detail.sections.find((section) => section.label === "CARATULA")!;
    const concepts = caratula.blocks.flatMap((block) => block.concepts);
    assert.equal(concepts.find((concept) => concept.label === "Tipo de máquina / equipo")?.value, "Retroexcavadora");
    assert.ok(!concepts.some((concept) => ["Calle", "Código postal", "Superficie total terreno", "Numero de niveles"].includes(concept.label)), "no real estate field (FAL-21)");
  }
  const conclusion = detail.sections.find((section) => section.label === "CONCLUSIONES")!;
  // The concluded value is its own subbloque of the conclusion (video 8.15).
  assert.ok(conclusion.blocks[0].subBlocks.flatMap((apartado) => apartado.concepts).some((concept) => concept.label === "Valor comercial de la retroexcavadora"));

  const { items } = await listValuationsPage({ organizationId: fixture.organizationId, page: 1, pageSize: 20 });
  const row = items.find((item) => item.id === publicId)!;
  assert.equal(row.propertyKindName, "Retroexcavadora");
  assert.equal(row.appraisalClassName, "Maquinaria y equipo");

  // A real estate essence of the firm's own is «Otro» with its name; the old «¿Cuál?» reads it.
  const own = await call(jar, postValuation as Handler, "POST", "/api/avaluos", { ...base, title: "Hotel de prueba", appraisalClass: "INMUEBLE", essence: "Hotel boutique" });
  const hotel = (await getValuationByPublicId(own.body!.data!.publicId!, fixture.organizationId))!;
  assert.equal(hotel.propertyKind, "otro");
  assert.equal(hotel.propertyKindOther, "Hotel boutique");
  assert.equal(hotel.essence, "Hotel boutique");
  assert.ok(catalogs.propertyTypes.some((option) => option.key === "OTRO"));
});

test("the carátula changes what is valued and the «Tipo de avalúo»; machinery stays machinery", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const { catalogs: _catalogs, ...base } = await creationBase(fixture);
  const created = await call(jar, postValuation as Handler, "POST", "/api/avaluos", { ...base, title: "Casa de prueba", appraisalClass: "INMUEBLE", essence: "Casa habitación" });
  const publicId = created.body!.data!.publicId!;

  const saved = await call(jar, putValuation as Handler, "PUT", `/api/avaluos/${publicId}`, {
    appraisalClass: "INMUEBLE", essence: "Terreno", appraisalKind: "otro", appraisalKindOther: "Catastral",
  }, publicId);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  let detail = (await getValuationByPublicId(publicId, fixture.organizationId))!;
  assert.equal(detail.propertyKind, "terreno", "a house that becomes land takes the land's kind");
  assert.equal(detail.essence, "Terreno");
  assert.equal(detail.appraisalKind, "otro");
  assert.equal(detail.appraisalKindOther, "Catastral");
  const { items } = await listValuationsPage({ organizationId: fixture.organizationId, page: 1, pageSize: 20 });
  assert.equal(items.find((item) => item.id === publicId)?.appraisalKindName, "Catastral");

  // Nothing becomes machinery from the carátula: its panels and sections are chosen at creation.
  await call(jar, putValuation as Handler, "PUT", `/api/avaluos/${publicId}`, { appraisalClass: "MAQUINARIA", essence: "Grúa" }, publicId);
  detail = (await getValuationByPublicId(publicId, fixture.organizationId))!;
  assert.equal(detail.appraisalClass, "INMUEBLE");
  assert.equal(detail.propertyKind, "otro", "the essence typed is kept, as real estate of its own");
  assert.equal(detail.essence, "Grúa");

  // Back to the catalog's kind: the name of «Otro» goes.
  await call(jar, putValuation as Handler, "PUT", `/api/avaluos/${publicId}`, { appraisalKind: "fiscal", appraisalKindOther: "" }, publicId);
  detail = (await getValuationByPublicId(publicId, fixture.organizationId))!;
  assert.equal(detail.appraisalKind, "fiscal");
  assert.equal(detail.appraisalKindOther, undefined);
});

test("a valuation of before keeps its kind when the carátula saves it untouched", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const industrial = await prisma.tipoInmueble.findFirstOrThrow({ where: { SClave: "INDUSTRIAL" } });
  await prisma.avaluo.update({ where: { UIdentificadorPublico: fixture.publicId }, data: { IdTipoInmueble: industrial.IdTipoInmueble } });
  const before = (await getValuationByPublicId(fixture.publicId, fixture.organizationId))!;
  assert.equal(before.essence, "Bodega / Nave industrial");
  await call(jar, putValuation as Handler, "PUT", `/api/avaluos/${fixture.publicId}`, { appraisalClass: before.appraisalClass, essence: before.essence }, fixture.publicId);
  assert.equal((await getValuationByPublicId(fixture.publicId, fixture.organizationId))!.propertyKind, "industrial");
});

test("the machine's data of a comparable are kept in its snapshot, and a client that leaves them out keeps them", async () => {
  const owner = await createValuationFixture();
  const machinery = {
    brand: "Caterpillar", model: "420F", year: 2018, serial: "SERIE-PRUEBA-001", capacity: "101 HP (75 kW)", meterKind: "HOROMETRO" as const,
    meterReading: 5480, condition: "Bueno", operatingState: "Activo", maintenance: "Preventivo", attachments: "Cucharón frontal", origin: "Estados Unidos", freight: 25_000,
  };
  const payload: ComparableInputPayload = {
    location: "Zona industrial inventada, Guadalajara, Jalisco", area: 1, price: 1_680_000, factors: [],
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
    notes: null, sourceName: "Portal de prueba", contactName: "Vendedor Inventado", contactPhone: null, url: null, offerDate: "2026-11-20",
    machinery,
  };
  await createComparable(owner.publicId, owner.user, "INMUEBLE_VENTA", payload);
  const [stored] = (await getMarketCalculation(owner.publicId, owner.organizationId, "INMUEBLE_VENTA")).comparables;
  assert.deepEqual(stored.machinery, machinery);
  const row = await prisma.comparableAvaluo.findFirstOrThrow({ where: { UIdentificadorPublico: stored.id }, select: { JPropiedadSnapshot: true } });
  assert.deepEqual((row.JPropiedadSnapshot as { machinery?: unknown }).machinery, machinery, "in the property snapshot, no column of its own");

  const { machinery: _left, ...old } = comparableFormValues(stored);
  await updateComparable(owner.publicId, owner.user, stored.id, { ...old, price: 1_700_000, factors: [] });
  const [kept] = (await getMarketCalculation(owner.publicId, owner.organizationId, "INMUEBLE_VENTA")).comparables;
  assert.equal(kept.price, 1_700_000);
  assert.deepEqual(kept.machinery, machinery);

  await updateComparable(owner.publicId, owner.user, stored.id, { ...comparableFormValues(kept), machinery: { ...machinery, meterKind: "ODOMETRO", meterReading: 2145 }, factors: [] });
  const [edited] = (await getMarketCalculation(owner.publicId, owner.organizationId, "INMUEBLE_VENTA")).comparables;
  assert.equal(edited.machinery?.meterKind, "ODOMETRO");
  assert.equal(edited.machinery?.meterReading, 2145);
});

test("a vehicle is created with the automobile book's carátula, and its comparable keeps the vehicle's data", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const { catalogs: _catalogs, ...base } = await creationBase(fixture);
  const created = await call(jar, postValuation as Handler, "POST", "/api/avaluos", { ...base, title: "Automóvil de prueba", appraisalClass: "MAQUINARIA", essence: "Automóvil" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const detail = (await getValuationByPublicId(created.body!.data!.publicId!, fixture.organizationId))!;
  assert.equal(detail.propertyKind, "maquinaria_equipo");
  const caratula = detail.sections.find((section) => section.label === "CARATULA")!;
  const data = caratula.blocks.find((block) => block.title === "DATOS DEL BIEN A VALUAR")!;
  assert.deepEqual(data.concepts.map((concept) => concept.label), [
    "Tipo de máquina / equipo", "Marca", "Modelo", "Matrícula", "No. de serie chasis", "No. de serie motor",
    "Año de fabricación", "País de origen", "Potencia (HP/kW)", "Odómetro", "Ubicación del bien",
  ]);
  assert.equal(data.concepts[0].value, "Automóvil");
  const labels = caratula.blocks.flatMap((block) => block.concepts.map((concept) => concept.label));
  assert.ok(labels.includes("Tipo de transmisión") && labels.includes("Combustible"));
  assert.ok(!labels.includes("Horas de uso (horómetro)"));

  // A comparable of the firm's base of kind «Automóvil» keeps the automobile book's fields in its snapshot.
  const vehicle = {
    brand: "Marca Inventada", model: "Sedán GT", year: 2022, condition: "Bueno", maintenance: "Preventivo", origin: "México", color: "Gris",
    meterKind: "ODOMETRO" as const, meterReading: 58_420, engine: "1.6 L turbo", doors: "4", spareTire: "Sí", serviceHistory: "Completo",
    repairs: "Ninguna", operatingState: "Activo", attachments: "Ninguno",
  };
  const payload: ComparableInputPayload = {
    location: "Colonia inventada, Guadalajara, Jalisco", area: null, price: 379_000, factors: [],
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
    notes: null, sourceName: "Portal de prueba", contactName: null, contactPhone: null, url: null, offerDate: "2026-11-20",
    propertyDetails: { kind: "AUTOMOVIL", assetClass: "MAQUINARIA" },
    machinery: vehicle,
  };
  const stored = await createBaseComparable(fixture.user, "INMUEBLE_VENTA", payload);
  const row = await prisma.comparableAvaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: stored.id }, select: { JPropiedadSnapshot: true } });
  const snapshot = row.JPropiedadSnapshot as { machinery?: unknown; details?: { kind?: unknown } };
  assert.deepEqual(snapshot.machinery, vehicle);
  assert.equal(snapshot.details?.kind, "AUTOMOVIL");
  const card = await getComparableCard(stored.id, fixture.organizationId);
  assert.deepEqual(card.comparable.machinery, vehicle);
});
