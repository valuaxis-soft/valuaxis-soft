/**
 * Shared setup for the HTTP end-to-end tests (pnpm test:e2e). They call a
 * running app (E2E_BASE_URL, default http://127.0.0.1:3000) with fetch and
 * create their own users, organizations and sessions in the same local
 * database the app uses. Never point them at production.
 */
import { randomUUID } from "node:crypto";
import { DEFAULT_FACTOR_SLOTS } from "../../src/features/valuations/calculation/market-types";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { prisma } from "../../src/infrastructure/database/prisma-client";

export { prisma };

export const BASE_URL = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
/**
 * The Origin a page of the app sends. The proxy accepts APP_URL and the
 * server's own origin (next start reports localhost, not 127.0.0.1), so
 * APP_URL is the one that always matches.
 */
const ORIGIN = new URL(process.env.E2E_ORIGIN ?? process.env.APP_URL ?? BASE_URL).origin;

export type Role = "ADMINISTRADOR" | "VALUADOR" | "REVISOR" | "CONSULTA";

export type Actor = { userId: number; email: string; token: string; organizationId: number; role: Role };

export type ApiResponse = {
  status: number;
  headers: Headers;
  body: unknown;
  /** body.data when the response is `{ data }`; loosely typed on purpose, tests read a few fields. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
};

type RequestOptions = {
  json?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  /** Defaults to this app's own origin, as a browser page would send. */
  origin?: string | null;
};

/** Calls the app as `actor` (or anonymously with null). Redirects are not followed. */
export async function call(actor: Actor | null, method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...options.headers };
  if (actor) headers.cookie = `${AUTH_SESSION_COOKIE}=${actor.token}`;
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin && method !== "GET") headers.origin = origin;
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }
  const response = await fetch(`${BASE_URL}${path}`, { method, headers, body, redirect: "manual" });
  const type = response.headers.get("content-type") ?? "";
  const parsed: unknown = type.includes("application/json") ? await response.json().catch(() => null) : await response.arrayBuffer();
  const data = parsed && typeof parsed === "object" && "data" in parsed ? (parsed as { data: unknown }).data : undefined;
  return { status: response.status, headers: response.headers, body: parsed, data };
}

/** A readable assertion message: the call, the expected and the actual status, and the error text. */
export function describeCall(label: string, response: ApiResponse) {
  const error = response.body && typeof response.body === "object" && "error" in response.body
    ? ` (${String((response.body as { error: unknown }).error)})`
    : "";
  return `${label} → ${response.status}${error}`;
}

/** The fixtures write to the app's database: never anything but a local one. */
function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error("E2E tests only run against a local database (DATABASE_URL must point to localhost).");
  }
}

async function createOrganization(suffix: string, label: string) {
  const state = await prisma.estadoOrganizacion.findUniqueOrThrow({ where: { SClave: "ACTIVA" } });
  return prisma.organizacion.create({
    data: {
      IdEstadoOrganizacion: state.IdEstadoOrganizacion,
      SNombre: `E2E ${label} ${suffix}`,
      SSlug: `e2e-${label.toLowerCase()}-${suffix}`,
      STipoAmbito: "TEAM",
      DFechaModificacion: new Date(),
    },
  });
}

/** A verified, active user who belongs to one organization with `role`, and a live session in it. */
export async function createActor(organizationId: number, role: Role, suffix = randomUUID().slice(0, 8)): Promise<Actor> {
  const [userState, rol] = await Promise.all([
    prisma.estadoUsuario.findUniqueOrThrow({ where: { SClave: "ACTIVO" } }),
    prisma.rol.findUniqueOrThrow({ where: { SClave: role } }),
  ]);
  const email = `e2e-${role.toLowerCase()}-${suffix}-${randomUUID().slice(0, 4)}@example.test`;
  const user = await prisma.usuario.create({
    data: {
      IdEstadoUsuario: userState.IdEstadoUsuario,
      SNombre: `E2E ${role}`,
      SCorreo: email,
      BCorreoVerificado: true,
      DFechaVerificacionCorreo: new Date(),
      DFechaModificacion: new Date(),
    },
  });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: organizationId, IdUsuario: user.IdUsuario, IdRol: rol.IdRol, DFechaModificacion: new Date() },
  });
  const token = createSecureToken();
  await prisma.sesion.create({
    data: {
      IdUsuario: user.IdUsuario,
      IdOrganizacion: organizationId,
      STokenHash: hashToken(token),
      DFechaExpiracion: new Date(Date.now() + 60 * 60 * 1000),
      DFechaUltimaActividad: new Date(),
    },
  });
  return { userId: user.IdUsuario, email, token, organizationId, role };
}

/** The catalog ids a new valuation needs, as the "new valuation" dialog sends them. */
export async function valuationCatalogIds() {
  const [appraisalType, propertyType, operationType] = await Promise.all([
    prisma.tipoAvaluo.findFirstOrThrow({ where: { BActivo: true }, orderBy: { IdTipoAvaluo: "asc" } }),
    prisma.tipoInmueble.findFirstOrThrow({ where: { BActivo: true }, orderBy: { IdTipoInmueble: "asc" } }),
    prisma.tipoOperacion.findFirstOrThrow({ where: { BActivo: true }, orderBy: { IdTipoOperacion: "asc" } }),
  ]);
  return {
    appraisalTypeId: appraisalType.IdTipoAvaluo,
    propertyTypeId: propertyType.IdTipoInmueble,
    operationTypeId: operationType.IdTipoOperacion,
  };
}

/** Creates a valuation through the API, as the app does, and returns its public id. */
export async function createValuation(actor: Actor, title = "Avalúo E2E"): Promise<string> {
  const response = await call(actor, "POST", "/api/avaluos", {
    json: { title, clientName: "Cliente E2E", ...(await valuationCatalogIds()) },
  });
  if (response.status !== 201) throw new Error(describeCall("POST /api/avaluos (fixture)", response));
  return String(response.data.publicId);
}

/**
 * Two organizations: A with one member per role, B with an administrator. Each
 * test file builds its own, so files never share state.
 */
export async function createWorld() {
  assertLocalDatabase();
  const suffix = randomUUID().slice(0, 8);
  const [orgA, orgB] = await Promise.all([createOrganization(suffix, "A"), createOrganization(suffix, "B")]);
  const a = {
    organizationId: orgA.IdOrganizacion,
    admin: await createActor(orgA.IdOrganizacion, "ADMINISTRADOR", suffix),
    valuador: await createActor(orgA.IdOrganizacion, "VALUADOR", suffix),
    revisor: await createActor(orgA.IdOrganizacion, "REVISOR", suffix),
    consulta: await createActor(orgA.IdOrganizacion, "CONSULTA", suffix),
  };
  const b = {
    organizationId: orgB.IdOrganizacion,
    admin: await createActor(orgB.IdOrganizacion, "ADMINISTRADOR", suffix),
  };
  return { suffix, a, b };
}

export type World = Awaited<ReturnType<typeof createWorld>>;

/** Waits for the server, so a clear message replaces a wall of ECONNREFUSED failures. */
export async function waitForServer(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await fetch(`${BASE_URL}/api/auth/session`, { redirect: "manual" });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`The app is not answering at ${BASE_URL}. Start it (pnpm build && pnpm start) or set E2E_BASE_URL. ${String(lastError)}`);
}

// ---- Valid request bodies ------------------------------------------------

export const costPayload = {
  land: {
    subjectArea: 200,
    referenceArea: 200,
    unitValue: 1500,
    surfacePower: 3,
    factors: { negotiation: 1, location: 1, services: 1, classification: 1, topography: 1 },
  },
  constructions: [],
  installations: [],
  indirects: [],
};

export const marketPayload = {
  comparableType: "TERRENO_VENTA",
  subjectArea: 200,
  baseArea: null,
  surfacePower: 3,
  adoptedUnitValue: 1500,
  justification: null,
  additionalAmount: 0,
  factorSlots: [{ type: "SUPERFICIE", label: "Superficie" }],
};

export const incomePayload = {
  method: "tabla",
  annuity: {
    vacancyDays: null,
    contractYears: null,
    otherMonthlyIncome: null,
    tiie: null,
    inflation: null,
    remainingLifeYears: null,
    option: 1,
  },
  marketRate: { negotiation: null, vacancy: null, salePrices: {} },
  rentableUnits: [{ description: "Local", area: 100, unitRent: 150 }],
  deductions: [],
  ratingColumns: [null, null, null, null, null, null, null],
  appliedRate: 0.1,
};

export const conclusionPayload = { method: { kind: "single", approach: "costos" }, justification: null };

export const comparablePayload = {
  location: "Calle E2E 1",
  area: 400,
  price: 1_200_000,
  landUse: null,
  shape: null,
  zone: null,
  frontage: null,
  depth: null,
  topography: null,
  services: null,
  notes: null,
  sourceName: null,
  contactName: null,
  contactPhone: null,
  url: null,
  offerDate: null,
  factors: [],
};

/** A search result sent back to become a comparable (POST …/comparables/buscar). */
export const foundComparablesPayload = {
  results: [{
    sourceId: "despacho",
    origin: "avalúo E2E-0001",
    comparable: { ...Object.fromEntries(Object.entries(comparablePayload).filter(([key]) => key !== "factors")), location: "Calle Encontrada 7" },
  }],
};

/**
 * Requests to the AI routes that never reach the AI service, whatever the
 * server's key: a text too short to be a listing and too little data to
 * write from are refused (422) after the permission and the valuation checks.
 */
export const shortListingPayload = { text: "Terreno en venta", url: null };
export const thinDraftPayload = { field: "Descripción del terreno", facts: [{ label: "Topografía", value: "Plana" }] };

export const firmPayload = { validityMonths: 6, folioPrefix: "E2E" };

export const emailPayload = { to: ["cliente@example.test"], subject: "Dictamen", message: "Adjunto el dictamen." };

export const reopenPayload = { reason: "Corrección E2E", acceptedText: "Acepto reabrir el avalúo." };

/** A CSV of comparables for the import endpoint, with the template's column names. */
export function comparablesCsv() {
  const csv = [
    "Ubicación,Superficie del terreno (m²),Precio de oferta ($)",
    "Calle Uno 1,400,1200000",
    "Calle Dos 2,500,1400000",
  ].join("\n");
  const form = new FormData();
  form.set("file", new Blob([csv], { type: "text/csv" }), "comparables.csv");
  return form;
}

/** Rent market settings and four comparables: the income approach takes its unit rent from their homologated mean. */
export async function addRentMarket(actor: Actor, valuation: string) {
  const settings = await call(actor, "PUT", `/api/avaluos/${valuation}/mercado`, {
    json: { ...marketPayload, comparableType: "INMUEBLE_RENTA", subjectArea: 100, adoptedUnitValue: 150, factorSlots: DEFAULT_FACTOR_SLOTS },
  });
  if (settings.status !== 200) throw new Error(describeCall("PUT rent market (fixture)", settings));
  for (const [index, [area, price]] of [[100, 15_000], [120, 17_400], [90, 14_000], [110, 16_000]].entries()) {
    const response = await call(actor, "POST", `/api/avaluos/${valuation}/mercado/comparables?tipo=INMUEBLE_RENTA`, {
      json: { ...comparablePayload, location: `Renta ${index + 1}`, area, price },
    });
    if (response.status !== 201) throw new Error(describeCall("POST rent comparable (fixture)", response));
  }
}
