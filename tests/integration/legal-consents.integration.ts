/**
 * Legal documents and the consent log against the database (docs/LEGAL.md):
 * the stored versions keep their SHA-256, sign-up writes the evidence of
 * matrix 3.2, a prior account is held until it accepts the published versions
 * (and again after a change that asks for it), and casillas 2 to 4 change at
 * once, each change logged. Test versions are published with an invented
 * address and removed at the end, so the local database keeps only the drafts.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { registerLocalUser } from "../../src/features/auth/services/registration.service";
import { parseRegisterInput } from "../../src/features/auth/validations/register.schema";
import {
  acceptCurrentDocuments,
  changeOptionalConsents,
  getAcceptanceGate,
  getLegalAcceptanceContext,
  getOptionalConsents,
  getPrivacyOverview,
  pendingLegalAcceptances,
} from "../../src/features/legal/consent.service";
import { overrideLegalAcceptanceRequired } from "../../src/features/legal/legal-config";
import { LegalPublishError, findLegalVersion, insertLegalVersion } from "../../src/features/legal/legal-document.repository";
import { ACCEPTANCE_DOCUMENTS, LEGAL_DOCUMENT_KEYS, parseLegalSource, type LegalDocumentKey } from "../../src/features/legal/legal-documents";
import { legalTextHash } from "../../src/features/legal/legal-text-hash";
import { assertLocalDatabase, captureAuthEmails, createAuthUserFixture, prisma } from "./support";

const PUBLISHER = `prueba-integracion-${randomUUID().slice(0, 8)}`;
const CONTEXT = { ip: "203.0.113.24", userAgent: "Navegador de prueba", cookieHash: "huella-de-cookie-de-prueba" };

before(() => assertLocalDatabase());
after(async () => {
  overrideLegalAcceptanceRequired(undefined);
  // Only this file's published test versions: the local database goes back to its drafts.
  await prisma.$executeRaw`DELETE FROM "devpware_documentos_legales" WHERE "SRegistradoPor" = ${PUBLISHER}`;
  await prisma.$disconnect();
});

const draftBody = (key: LegalDocumentKey) => parseLegalSource(readFileSync(`docs/legal/${key}.md`, "utf8")).body;

/** The draft with its blanks filled with invented data, as the owner would before publishing. */
const filled = (key: LegalDocumentKey, note = "") => draftBody(key).replaceAll("______", "Calle Inventada 123, Ciudad de Prueba") + note;

function publish(documento: LegalDocumentKey, text: string, requiresAcceptance = true) {
  return insertLegalVersion({
    documento,
    title: `Prueba ${documento}`,
    updatedOn: new Date("2026-12-01T00:00:00Z"),
    text,
    published: true,
    requiresAcceptance,
    registeredBy: PUBLISHER,
  });
}

const logOf = (userId: number) => prisma.bitacoraConsentimiento.findMany({ where: { IdUsuario: userId }, orderBy: { IdBitacoraConsentimiento: "asc" } });

test("the seeded drafts keep their text unchanged: the stored hash is the SHA-256 of the stored text and of docs/legal", async () => {
  for (const key of LEGAL_DOCUMENT_KEYS) {
    const draft = await prisma.documentoLegal.findFirstOrThrow({ where: { SDocumento: key, SRegistradoPor: "migración 064" } });
    const [{ digest }] = await prisma.$queryRaw<{ digest: string }[]>`
      SELECT encode(sha256(convert_to("TTexto", 'UTF8')), 'hex') AS digest FROM "devpware_documentos_legales" WHERE "IdDocumentoLegal" = ${draft.IdDocumentoLegal}`;
    assert.equal(draft.SHashSha256, digest, key);
    assert.equal(draft.SHashSha256, legalTextHash(draftBody(key)), key);
    assert.equal(draft.BPublicable, false);
    assert.equal(draft.IVersion, 1);
  }
});

test("sign-up writes the account, its profile and the ALTA entry with every field of matrix 3.2", async (t) => {
  captureAuthEmails(t);
  const form = new FormData();
  const email = `alta-${randomUUID().slice(0, 8)}@example.test`;
  const legal = await getLegalAcceptanceContext();
  for (const [key, value] of Object.entries({
    name: "Ana",
    paternalLastName: "Prueba",
    email,
    password: "Clave-Segura-2026!",
    confirmPassword: "Clave-Segura-2026!",
    phone: "3311112222",
    cedula: "7654321",
    specialty: "Inmuebles",
    adultDeclaration: "on",
    consentPrivacy: "on",
    consentTerms: "on",
    consentStatistics: "on",
    legalVersionIds: legal.versionIds.join(","),
  })) form.set(key, value);
  const parsed = parseRegisterInput(form);
  assert.equal(parsed.ok, true);
  const before = new Date(Date.now() - 1000);
  const result = await registerLocalUser(parsed.data, { versions: legal.versions, context: CONTEXT });
  assert.ok(result.ok);

  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: result.userId } });
  assert.equal(user.STelefono, "+523311112222");
  assert.deepEqual(user.JPerfilProfesional, { cedula: "7654321", especialidad: "Inmuebles" });

  const [entry, ...rest] = await logOf(result.userId);
  assert.equal(rest.length, 0);
  assert.equal(entry.SEvento, "ALTA");
  assert.equal(entry.SMetodo, "LOCAL");
  assert.equal(entry.SCorreo, email);
  assert.equal(entry.SDireccionIP, CONTEXT.ip);
  assert.equal(entry.SAgenteUsuario, CONTEXT.userAgent);
  assert.equal(entry.SCookieSesionHash, CONTEXT.cookieHash);
  assert.ok(entry.DFechaEvento >= before && entry.DFechaEvento <= new Date(Date.now() + 1000));
  assert.ok(entry.SZonaHoraria.length > 0);
  // Every box, ticked and not.
  assert.deepEqual(entry.JCasillas, { privacidad: true, terminos: true, mayorDeEdad: true, comercial: false, boletin: false, estadistica: true });
  // Each accepted document with the version in force (the drafts, while nothing is published), plus the screen texts.
  const documents = entry.JDocumentos as { documento: string; version: number; publicable: boolean; hash: string | null; id: number | null }[];
  assert.deepEqual(documents.map((item) => item.documento).sort(), [...ACCEPTANCE_DOCUMENTS, "textos-de-pantalla"].sort());
  for (const version of legal.versions) {
    const recorded = documents.find((item) => item.documento === version.documento)!;
    assert.deepEqual(recorded, { documento: version.documento, version: version.version, publicable: version.published, hash: version.hash, id: version.id });
  }
  // The form's contact and identification data, never the password.
  assert.deepEqual(entry.JFormulario, {
    nombre: "Ana",
    apellidoPaterno: "Prueba",
    apellidoMaterno: null,
    correo: email,
    telefono: "+523311112222",
    cedula: "7654321",
    especialidad: "Inmuebles",
    organizacion: null,
  });
  assert.doesNotMatch(JSON.stringify(entry, (_key, value) => (typeof value === "bigint" ? String(value) : value)), /Clave-Segura/);
});

test("casillas 2 to 4 change at once from «Mi cuenta», each change logged with every box; no change, no entry", async () => {
  const user = await createAuthUserFixture({ label: "privacidad" });
  const account = { id: user.userId, email: user.email };
  assert.deepEqual(await getOptionalConsents(user.userId), { comercial: false, boletin: false, estadistica: false });

  assert.deepEqual(await changeOptionalConsents(account, { boletin: true }, CONTEXT), { comercial: false, boletin: true, estadistica: false });
  assert.deepEqual(await getOptionalConsents(user.userId), { comercial: false, boletin: true, estadistica: false });
  await changeOptionalConsents(account, { boletin: true }, CONTEXT);
  await changeOptionalConsents(account, { boletin: false, comercial: true }, CONTEXT);
  assert.deepEqual(await getOptionalConsents(user.userId), { comercial: true, boletin: false, estadistica: false });

  const entries = await logOf(user.userId);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((entry) => entry.SEvento), ["CAMBIO_CASILLAS", "CAMBIO_CASILLAS"]);
  assert.deepEqual(entries[1].JCasillas, { privacidad: false, terminos: false, mayorDeEdad: false, comercial: true, boletin: false, estadistica: false });
  assert.equal(entries[1].SMetodo, "CUENTA");
  assert.equal(entries[1].SDireccionIP, CONTEXT.ip);
  const documents = (entries[1].JDocumentos as { documento: string }[]).map((item) => item.documento).sort();
  assert.deepEqual(documents, ["privacidad-integral", "privacidad-simplificado", "textos-de-pantalla"]);

  const overview = await getPrivacyOverview(user.userId);
  assert.equal(overview.history.length, 2);
  assert.deepEqual(overview.optional, { comercial: true, boletin: false, estadistica: false });
});

test("a prior account is held until it accepts the published versions, and again after a change that asks for it", async () => {
  const user = await createAuthUserFixture({ label: "previo" });
  const account = { id: user.userId, email: user.email };

  // Off: nobody is held, whatever is published.
  overrideLegalAcceptanceRequired(false);
  assert.deepEqual(await pendingLegalAcceptances(user.userId), []);
  overrideLegalAcceptanceRequired(true);

  // A text with blanks is never published.
  await assert.rejects(publish("terminos", draftBody("terminos")), LegalPublishError);

  const published = new Map<LegalDocumentKey, number>();
  for (const key of ACCEPTANCE_DOCUMENTS) published.set(key, (await publish(key, filled(key))).version);
  // The same text again is not a new version.
  await assert.rejects(publish("anexo-ia", filled("anexo-ia")), LegalPublishError);

  // Once published, the public pages show the published version, never the draft of that number.
  const shown = await findLegalVersion("terminos", published.get("terminos")!);
  assert.equal(shown?.published, true);

  const gate = await getAcceptanceGate(user.userId);
  assert.deepEqual(gate.pending.map((item) => item.documento).sort(), [...ACCEPTANCE_DOCUMENTS].sort());
  assert.equal(gate.askAdult, true);

  const legal = await getLegalAcceptanceContext();
  assert.ok(legal.versions.every((version) => version.published && version.text.indexOf("______") < 0));
  // Versions other than the ones in force, or no age declared: refused, nothing logged.
  assert.deepEqual(await acceptCurrentDocuments(account, { versionIds: legal.versionIds.slice(1), adult: true }, CONTEXT), { ok: false, reason: "DOCUMENTS_CHANGED" });
  assert.deepEqual(await acceptCurrentDocuments(account, { versionIds: legal.versionIds }, CONTEXT), { ok: false, reason: "AGE_REQUIRED" });
  assert.equal((await logOf(user.userId)).length, 0);

  assert.deepEqual(await acceptCurrentDocuments(account, { versionIds: legal.versionIds, adult: true }, CONTEXT), { ok: true });
  assert.deepEqual(await pendingLegalAcceptances(user.userId), []);
  const [first] = await logOf(user.userId);
  assert.equal(first.SEvento, "ACEPTACION_USUARIO_PREVIO");
  assert.equal(first.SMetodo, "CUENTA");
  assert.deepEqual(first.JCasillas, { privacidad: true, terminos: true, mayorDeEdad: true, comercial: false, boletin: false, estadistica: false });
  assert.ok((first.JDocumentos as { publicable: boolean }[]).every((item) => item.publicable));

  // A change to the Terms that touches rights: accepted again, without asking the age twice.
  const second = await publish("terminos", filled("terminos", "\nCambio de prueba que pide aceptación.\n"));
  assert.deepEqual(await pendingLegalAcceptances(user.userId), [{ documento: "terminos", version: second.version }]);
  assert.equal((await getAcceptanceGate(user.userId)).askAdult, false);
  const again = await getLegalAcceptanceContext();
  assert.deepEqual(await acceptCurrentDocuments(account, { versionIds: again.versionIds }, CONTEXT), { ok: true });
  const entries = await logOf(user.userId);
  assert.equal(entries.at(-1)?.SEvento, "NUEVA_ACEPTACION");
  assert.deepEqual(await pendingLegalAcceptances(user.userId), []);

  // A change that does not ask for acceptance holds nobody.
  await publish("terminos", filled("terminos", "\nCorrección de estilo.\n"), false);
  assert.deepEqual(await pendingLegalAcceptances(user.userId), []);

  // An account that signed up accepting only drafts owes the published versions.
  const signedUpOnDrafts = await createAuthUserFixture({ label: "borradores" });
  await prisma.bitacoraConsentimiento.create({
    data: {
      IdUsuario: signedUpOnDrafts.userId,
      SCorreo: signedUpOnDrafts.email,
      SEvento: "ALTA",
      SMetodo: "LOCAL",
      JDocumentos: ACCEPTANCE_DOCUMENTS.map((documento) => ({ documento, version: 1, publicable: false, hash: null, id: null })),
      JCasillas: { privacidad: true, terminos: true, mayorDeEdad: true, comercial: false, boletin: false, estadistica: false },
    },
  });
  assert.equal((await pendingLegalAcceptances(signedUpOnDrafts.userId)).length, ACCEPTANCE_DOCUMENTS.length);
  overrideLegalAcceptanceRequired(undefined);
});
