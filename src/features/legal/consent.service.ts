import { prisma } from "@/infrastructure/database/prisma-client";
import { appendConsentLog, listConsentLog } from "./consent-log.repository";
import {
  ACCEPTANCE_EVENTS,
  FALLBACK_BOX_TEXTS,
  NO_OPTIONAL_CONSENTS,
  SCREEN_TEXTS_VERSION,
  currentOptionalConsents,
  pendingAcceptances,
  sameVersions,
  type ConsentBoxes,
  type ConsentDocumentRef,
  type ConsentEvent,
  type OptionalConsents,
} from "./consent-rules";
import { isLegalAcceptanceRequired } from "./legal-config";
import { findCurrentLegalVersions, listPublishedVersionSummaries, type LegalVersion } from "./legal-document.repository";
import { ACCEPTANCE_DOCUMENTS, splitSimplifiedNotice, type LegalDocumentKey } from "./legal-documents";

/** Where an acceptance came from (matrix 3.2, «IP y cookie»). */
export type ConsentRequestContext = { ip: string | null; userAgent: string | null; cookieHash: string | null };

/** A version as the forms show it and link to it. */
export type LegalVersionLink = { id: number; documento: LegalDocumentKey; version: number; title: string; published: boolean; updatedOn: string };

const toLink = (version: LegalVersion): LegalVersionLink => ({
  id: version.id,
  documento: version.documento,
  version: version.version,
  title: version.title,
  published: version.published,
  updatedOn: version.updatedOn.toISOString().slice(0, 10),
});

/** The documents of an acceptance as the log keeps them, plus the version of the screen texts (casilla T, the age). */
export function documentRefs(versions: Iterable<LegalVersion>): ConsentDocumentRef[] {
  const refs: ConsentDocumentRef[] = [...versions].map((version) => ({
    documento: version.documento,
    version: version.version,
    publicable: version.published,
    hash: version.hash,
    id: version.id,
  }));
  refs.push({ documento: "textos-de-pantalla", version: SCREEN_TEXTS_VERSION, publicable: true, hash: null, id: null });
  return refs;
}

/**
 * What the sign-up form and the acceptance page show: the version in force of
 * each document accepted, Part I of the simplified notice (in full) and the
 * literal texts of the four boxes. Works with drafts while nothing is published.
 */
export async function getLegalAcceptanceContext() {
  const current = await findCurrentLegalVersions(ACCEPTANCE_DOCUMENTS);
  const simplified = current.get("privacidad-simplificado") ?? null;
  const split = simplified ? splitSimplifiedNotice(simplified.text) : null;
  if (simplified && !split) console.error("[LEGAL] The simplified notice has no Part II boxes: the form uses the 15 nov 2026 texts.");
  const links = Object.fromEntries([...current].map(([key, version]) => [key, toLink(version)])) as Partial<Record<LegalDocumentKey, LegalVersionLink>>;
  return {
    versions: [...current.values()],
    versionIds: [...current.values()].map((version) => version.id),
    links,
    notice: simplified && split ? { text: split.partOne, link: toLink(simplified) } : null,
    boxTexts: split?.boxes ?? FALLBACK_BOX_TEXTS,
  };
}

export type LegalAcceptanceContext = Awaited<ReturnType<typeof getLegalAcceptanceContext>>;

/** Whether the versions a form showed are still the ones in force; the boxes accept what was shown. */
export function shownVersionsAreCurrent(context: LegalAcceptanceContext, shownIds: readonly number[]) {
  return sameVersions(shownIds, context.versionIds);
}

/**
 * The documents the account still owes an acceptance of (matrix 1.2 and 3.1):
 * empty while LEGAL_ACCEPTANCE_REQUIRED is off or nothing is published.
 */
export async function pendingLegalAcceptances(userId: number) {
  if (!isLegalAcceptanceRequired()) return [];
  const published = await listPublishedVersionSummaries();
  if (!published.length) return [];
  const accepted = await prisma.bitacoraConsentimiento.findMany({
    where: { IdUsuario: userId, SEvento: { in: [...ACCEPTANCE_EVENTS] } },
    select: { JDocumentos: true },
  });
  return pendingAcceptances(published, accepted.flatMap((row) => (Array.isArray(row.JDocumentos) ? (row.JDocumentos as ConsentDocumentRef[]) : [])));
}

/** The latest state of every box the account recorded, and whether it ever declared its age. */
async function recordedState(userId: number) {
  const log = await listConsentLog(userId);
  const optional = log.length ? currentOptionalConsents(log[0].JCasillas) : NO_OPTIONAL_CONSENTS;
  const adultDeclared = log.some((row) => (row.JCasillas as Record<string, unknown> | null)?.mayorDeEdad === true);
  const accepted = log.some((row) => (ACCEPTANCE_EVENTS as readonly string[]).includes(row.SEvento));
  return { log, optional, adultDeclared, accepted };
}

/** /aceptar-documentos: what the account owes, and whether it still has to declare its age. */
export async function getAcceptanceGate(userId: number) {
  const pending = await pendingLegalAcceptances(userId);
  if (!pending.length) return { pending, askAdult: false };
  return { pending, askAdult: !(await recordedState(userId)).adultDeclared };
}

export type AcceptanceResult ={ ok: true } | { ok: false; reason: "DOCUMENTS_CHANGED" | "AGE_REQUIRED" };

/**
 * An account that existed before the documents, or before a change that asks
 * for acceptance, accepts the versions in force with casillas 1 and T
 * (/aceptar-documentos). Its boxes 2 to 4 stay as they were.
 */
export async function acceptCurrentDocuments(
  user: { id: number; email: string },
  input: { versionIds: number[]; adult?: boolean },
  context: ConsentRequestContext,
): Promise<AcceptanceResult> {
  const legal = await getLegalAcceptanceContext();
  if (!shownVersionsAreCurrent(legal, input.versionIds)) return { ok: false, reason: "DOCUMENTS_CHANGED" };
  const state = await recordedState(user.id);
  if (!state.adultDeclared && input.adult !== true) return { ok: false, reason: "AGE_REQUIRED" };
  const event: ConsentEvent = state.accepted ? "NUEVA_ACEPTACION" : "ACEPTACION_USUARIO_PREVIO";
  await appendConsentLog(prisma, {
    userId: user.id,
    email: user.email,
    event,
    method: "CUENTA",
    documents: documentRefs(legal.versions),
    boxes: { privacidad: true, terminos: true, mayorDeEdad: true, ...state.optional },
    ip: context.ip,
    userAgent: context.userAgent,
    cookieHash: context.cookieHash,
  });
  return { ok: true };
}

/** Casillas 2 to 4 now: none ticked until the account ticks one. */
export async function getOptionalConsents(userId: number): Promise<OptionalConsents> {
  return (await recordedState(userId)).optional;
}

/**
 * «Mi cuenta» → «Privacidad»: the account ticks or unticks casillas 2 to 4
 * with immediate effect (matrix 1.10). Each change is a log entry with every box.
 */
export async function changeOptionalConsents(
  user: { id: number; email: string },
  patch: Partial<OptionalConsents>,
  context: ConsentRequestContext,
) {
  const state = await recordedState(user.id);
  const next: OptionalConsents = {
    comercial: patch.comercial ?? state.optional.comercial,
    boletin: patch.boletin ?? state.optional.boletin,
    estadistica: patch.estadistica ?? state.optional.estadistica,
  };
  const changed = (Object.keys(next) as (keyof OptionalConsents)[]).some((key) => next[key] !== state.optional[key]);
  if (!changed) return next;
  // The notice these boxes come from, in the version in force.
  const privacy = await findCurrentLegalVersions(["privacidad-simplificado", "privacidad-integral"]);
  const previous = state.log[0]?.JCasillas as Partial<ConsentBoxes> | undefined;
  await appendConsentLog(prisma, {
    userId: user.id,
    email: user.email,
    event: "CAMBIO_CASILLAS",
    method: "CUENTA",
    documents: documentRefs(privacy.values()),
    boxes: { privacidad: previous?.privacidad === true, terminos: previous?.terminos === true, mayorDeEdad: state.adultDeclared, ...next },
    ip: context.ip,
    userAgent: context.userAgent,
    cookieHash: context.cookieHash,
  });
  return next;
}

const historyDate = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" });

export type PrivacyHistoryEntry = {
  id: string;
  event: ConsentEvent;
  at: string;
  /** The date as «Mi cuenta» shows it, formatted on the server (Mexico City time). */
  atLabel: string;
  timeZone: string;
  documents: ConsentDocumentRef[];
  boxes: Partial<ConsentBoxes>;
};

/** What «Privacidad» shows: the boxes 2 to 4 now and every acceptance or change, newest first. */
export async function getPrivacyOverview(userId: number) {
  const state = await recordedState(userId);
  const history: PrivacyHistoryEntry[] = state.log.map((row) => ({
    id: row.UIdentificadorPublico,
    event: row.SEvento as ConsentEvent,
    at: row.DFechaEvento.toISOString(),
    atLabel: historyDate.format(row.DFechaEvento),
    timeZone: row.SZonaHoraria,
    documents: Array.isArray(row.JDocumentos) ? (row.JDocumentos as ConsentDocumentRef[]) : [],
    boxes: (row.JCasillas ?? {}) as Partial<ConsentBoxes>,
  }));
  return { optional: state.optional, history };
}

/** The sign-up form as the log keeps it (Terms 3.2: contact and identification data), never the password. */
export function registrationFormRecord(input: {
  name: string;
  paternalLastName?: string | null;
  maternalLastName?: string | null;
  email: string;
  phone: string;
  cedula?: string | null;
  specialty: string;
  organizationName?: string | null;
}): Record<string, string | null> {
  return {
    nombre: input.name,
    apellidoPaterno: input.paternalLastName ?? null,
    apellidoMaterno: input.maternalLastName ?? null,
    correo: input.email,
    telefono: input.phone,
    cedula: input.cedula ?? null,
    especialidad: input.specialty,
    organizacion: input.organizationName ?? null,
  };
}
