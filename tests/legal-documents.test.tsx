/**
 * The legal documents (We Law, 15 nov 2026; docs/LEGAL.md): the sources in
 * docs/legal are the drafts migration 064 seeds, byte for byte; the form quotes
 * the simplified notice literally; the boxes load unticked; the log and the
 * versions are never rewritten.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AUTH_SESSION_COOKIE } from "../src/features/auth/constants/auth.constants";
import { parseRegisterInput } from "../src/features/auth/validations/register.schema";
import { ConsentCheckboxes, EMPTY_CONSENT_BOXES, requiredBoxesTicked } from "../src/features/legal/components/consent-checkboxes";
import { LegalComingSoon } from "../src/features/legal/components/legal-document-view";
import { LegalText } from "../src/features/legal/components/legal-text";
import {
  FALLBACK_BOX_TEXTS,
  TERMS_BOX_SEGMENTS,
  currentOptionalConsents,
  optionalConsentsPatchSchema,
  parseVersionIds,
  pendingAcceptances,
  sameVersions,
} from "../src/features/legal/consent-rules";
import { currentVersionOf, type LegalVersion } from "../src/features/legal/legal-document.repository";
import {
  ACCEPTANCE_DOCUMENTS,
  LEGAL_DOCUMENT_KEYS,
  PRIVACY_DOCUMENTS,
  TERMS_DOCUMENTS,
  canShowDraftPublicly,
  hasLegalBlanks,
  parseLegalSource,
  splitSimplifiedNotice,
} from "../src/features/legal/legal-documents";
import { LEGAL_FOOTER_LINKS } from "../src/features/legal/legal-links";
import { parseLegalInline, parseLegalMarkdown } from "../src/features/legal/legal-markdown";
import { legalTextHash } from "../src/features/legal/legal-text-hash";
import { COOKIE_INVENTORY, arcoEmailFrom } from "../src/features/legal/privacy-facts";
import { THIRD_PARTY_NOTICES } from "../src/features/legal/third-party-notices";

const MIGRATION = "prisma/migrations/20261125000000_064_documentos_legales/migration.sql";
const source = (key: string) => parseLegalSource(readFileSync(`docs/legal/${key}.md`, "utf8"));

test("every document has its markdown source, and only the publishable ones (no research, no matrix)", () => {
  const files = readdirSync("docs/legal").sort();
  assert.deepEqual(files, [...LEGAL_DOCUMENT_KEYS].map((key) => `${key}.md`).sort());
  for (const key of LEGAL_DOCUMENT_KEYS) {
    const parsed = source(key);
    assert.equal(parsed.document, key);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.date, "2026-11-15");
    // The PDF's running header, footer and page numbers were removed.
    assert.doesNotMatch(parsed.body, /welaw\.com\.mx|Página \d+ de \d+|Elaborado por We Law/);
  }
});

test("migration 064 seeds each draft with exactly the text of docs/legal and its SHA-256", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  for (const key of LEGAL_DOCUMENT_KEYS) {
    const { body } = source(key);
    const pattern = new RegExp(`SELECT '${key}', 1, '[^']+', DATE '2026-11-15', \\$legal\\$([\\s\\S]*?)\\$legal\\$, '([0-9a-f]{64})', false, (true|false)`);
    const match = pattern.exec(sql);
    assert.ok(match, `seed of ${key}`);
    assert.equal(match[1], body, `${key}: the seeded text is the source`);
    assert.equal(match[2], legalTextHash(body));
    assert.equal(match[2], createHash("sha256").update(body, "utf8").digest("hex"));
    // Only the dissociated-information policy is not accepted (matrix, section 0).
    assert.equal(match[3], key === "informacion-disociada" ? "false" : "true", key);
  }
  // Only additive statements: new tables, indexes and columns, and new rows.
  assert.doesNotMatch(sql.replace(/\$legal\$[\s\S]*?\$legal\$/g, ""), /\b(DROP|ALTER COLUMN|ALTER TYPE|UPDATE|DELETE|TRUNCATE)\b/);
});

test("the drafts still have the owner's blanks, and they render marked", () => {
  const blanks = Object.fromEntries(LEGAL_DOCUMENT_KEYS.map((key) => [key, source(key).body.split("______").length - 1]));
  assert.deepEqual(blanks, {
    terminos: 4,
    licencia: 0,
    "privacidad-integral": 3,
    "privacidad-simplificado": 3,
    "politicas-comerciales": 4,
    "anexo-ia": 0,
    "informacion-disociada": 4,
  });
  assert.equal(hasLegalBlanks(source("terminos").body), true);
  assert.equal(hasLegalBlanks(source("licencia").body), false);
  const html = renderToStaticMarkup(<LegalText text={"1. Domicilio: ______."} />);
  assert.match(html, /<mark data-legal-blank=""[^>]*>______<\/mark>/);
});

test("the form quotes Part I and the four boxes of the simplified notice literally", () => {
  const split = splitSimplifiedNotice(source("privacidad-simplificado").body);
  assert.ok(split);
  assert.deepEqual(split.boxes, FALLBACK_BOX_TEXTS);
  assert.match(split.partOne, /^# Parte I\. Aviso de privacidad simplificado/);
  assert.match(split.partOne, /Este aviso simplificado se presenta conforme al artículo 16, fracción II, de la Ley\./);
  assert.doesNotMatch(split.partOne, /PARTE II/);
  assert.equal(splitSimplifiedNotice("# Sin parte II"), null);
});

test("the markdown keeps the documents' own numbering, their tables and their bold subsection titles", () => {
  const integral = parseLegalMarkdown(source("privacidad-integral").body);
  const tables = integral.filter((block) => block.type === "table");
  assert.equal(tables.length, 3);
  assert.deepEqual(tables[0].type === "table" && tables[0].head, ["Categoría", "Datos", "Origen"]);
  assert.equal(tables[2].type === "table" && tables[2].rows.length, 8);
  const terms = parseLegalMarkdown(source("terminos").body);
  const definitions = terms.find((block) => block.type === "list" && block.items.length === 18);
  assert.ok(definitions && definitions.type === "list");
  assert.equal(definitions.items[17].number, 18);
  assert.deepEqual(parseLegalInline("**1.1 Proveedor.** Ver https://policies.google.com/privacy)."), [
    { type: "bold", text: "1.1 Proveedor." },
    { type: "text", text: " Ver " },
    { type: "link", text: "https://policies.google.com/privacy" },
    { type: "text", text: ")." },
  ]);
});

test("matrix rule 1: before publication only the privacy notices show their draft; the rest, «Se publicará próximamente» without text", () => {
  assert.deepEqual(
    LEGAL_DOCUMENT_KEYS.filter((key) => canShowDraftPublicly(key)),
    ["privacidad-integral", "privacidad-simplificado"],
  );
  const html = renderToStaticMarkup(<LegalComingSoon title="Términos y condiciones de uso" />);
  assert.match(html, /Se publicará próximamente/);
  // Not a word of the draft.
  assert.doesNotMatch(html, /QUIÉNES SOMOS|Proveedor|______/);
  for (const page of ["src/app/legal/[documento]/page.tsx", "src/app/legal/[documento]/v/[version]/page.tsx"]) {
    assert.match(readFileSync(page, "utf8"), /!(current|found)\.published && !canShowDraftPublicly\(documento\)\) return <LegalComingSoon/, page);
  }
});

test("the boxes load unticked; casilla T links its four documents; a draft link says so", () => {
  const html = renderToStaticMarkup(
    <ConsentCheckboxes
      boxTexts={FALLBACK_BOX_TEXTS}
      links={{ terminos: { version: 1, published: false }, licencia: { version: 2, published: true } }}
      state={EMPTY_CONSENT_BOXES}
      onChange={() => {}}
    />,
  );
  assert.doesNotMatch(html, /aria-checked="true"|data-checked=""/);
  for (const name of ["adultDeclaration", "consentPrivacy", "consentTerms", "consentCommercial", "consentNewsletter", "consentStatistics"]) {
    assert.match(html, new RegExp(`id="${name}"`), name);
  }
  for (const text of Object.values(FALLBACK_BOX_TEXTS)) assert.ok(html.includes(text), text);
  const termsLinks = TERMS_BOX_SEGMENTS.filter((segment) => typeof segment !== "string");
  assert.deepEqual(termsLinks.map((link) => link.document), [...TERMS_DOCUMENTS]);
  // Unpublished: the privacy notice says «borrador»; the Terms, that they will be published.
  assert.match(html, /href="\/legal\/terminos\/v\/1"[^>]*>Términos y condiciones de uso \(se publicará próximamente\)<\/a>/);
  assert.match(html, /href="\/legal\/licencia\/v\/2"[^>]*>Licencia de uso del software<\/a>/);
  assert.match(html, /href="\/legal\/politicas-comerciales"/);
  assert.match(html, /href="\/legal\/anexo-ia"/);
  assert.match(html, /href="\/legal\/privacidad-integral"/);
});

test("the button accepts only with casillas 1 and T (and the age) ticked; 2 to 4 never matter", () => {
  assert.equal(requiredBoxesTicked(EMPTY_CONSENT_BOXES), false);
  assert.equal(requiredBoxesTicked({ ...EMPTY_CONSENT_BOXES, privacy: true, terms: true }), false);
  assert.equal(requiredBoxesTicked({ ...EMPTY_CONSENT_BOXES, privacy: true, adult: true }), false);
  assert.equal(requiredBoxesTicked({ ...EMPTY_CONSENT_BOXES, privacy: true, terms: true, adult: true }), true);
  assert.equal(requiredBoxesTicked({ ...EMPTY_CONSENT_BOXES, privacy: true, terms: true }, false), true);
});

test("the sign-up form needs the profile, the age and casillas 1 and T, and records 2 to 4 as chosen", () => {
  const form = (values: Record<string, string>) => {
    const data = new FormData();
    const base = {
      name: "Ana",
      paternalLastName: "Prueba",
      email: "ana@example.test",
      password: "Clave-Segura-2026!",
      confirmPassword: "Clave-Segura-2026!",
      phone: "33 1234 5678",
      specialty: "  Maquinaria   y equipo ",
      adultDeclaration: "on",
      consentPrivacy: "on",
      consentTerms: "on",
      legalVersionIds: "3,1,2",
    };
    for (const [key, value] of Object.entries({ ...base, ...values })) if (value) data.set(key, value);
    return parseRegisterInput(data);
  };
  const ok = form({ consentNewsletter: "on", cedula: "1234567" });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.phone, "+523312345678");
  assert.equal(ok.data.specialty, "Maquinaria y equipo");
  assert.equal(ok.data.cedula, "1234567");
  assert.deepEqual(ok.data.consents, { optional: { comercial: false, boletin: true, estadistica: false }, versionIds: [3, 1, 2] });
  // None of the optional boxes is needed.
  assert.equal(form({}).ok, true);
  assert.deepEqual(form({}).data.consents.optional, { comercial: false, boletin: false, estadistica: false });
  for (const missing of ["adultDeclaration", "consentPrivacy", "consentTerms", "phone", "specialty"]) {
    const parsed = form({ [missing]: "" });
    assert.equal(parsed.ok, false, missing);
    assert.ok(parsed.fieldErrors[missing]?.length, missing);
  }
  assert.ok(form({ cedula: "12ab" }).fieldErrors.cedula);
  assert.ok(form({ phone: "123" }).fieldErrors.phone);
});

test("an account owes the newest published version that asks for acceptance; drafts never count", () => {
  const published = [
    { documento: "terminos" as const, version: 1, requiresAcceptance: true },
    { documento: "terminos" as const, version: 2, requiresAcceptance: true },
    { documento: "terminos" as const, version: 3, requiresAcceptance: false },
    { documento: "privacidad-simplificado" as const, version: 1, requiresAcceptance: true },
  ];
  const ref = (documento: "terminos" | "privacidad-simplificado", version: number, publicable = true) => ({ documento, version, publicable, hash: null, id: null });
  assert.deepEqual(pendingAcceptances(published, []), [
    { documento: "privacidad-simplificado", version: 1 },
    { documento: "terminos", version: 2 },
  ]);
  // A draft accepted at sign-up does not stand for the published version.
  assert.equal(pendingAcceptances(published, [ref("terminos", 2, false), ref("privacidad-simplificado", 1, false)]).length, 2);
  // Version 3 does not ask for acceptance: having accepted 2 is enough.
  assert.deepEqual(pendingAcceptances(published, [ref("terminos", 2), ref("privacidad-simplificado", 1)]), []);
  assert.deepEqual(pendingAcceptances(published, [ref("terminos", 1), ref("privacidad-simplificado", 1)]), [{ documento: "terminos", version: 2 }]);
  // Nothing published: nothing owed.
  assert.deepEqual(pendingAcceptances([], []), []);
  assert.deepEqual([...ACCEPTANCE_DOCUMENTS], [...PRIVACY_DOCUMENTS, ...TERMS_DOCUMENTS]);
});

test("the version in force is the newest published one; a draft stands in only while none is published", () => {
  const version = (id: number, number: number, published: boolean): LegalVersion => ({
    id,
    documento: "terminos",
    version: number,
    title: "Términos",
    updatedOn: new Date("2026-11-15T00:00:00Z"),
    text: "",
    hash: "",
    published,
    requiresAcceptance: true,
    createdAt: new Date(2026, 10, id),
  });
  assert.equal(currentVersionOf([]), null);
  assert.equal(currentVersionOf([version(1, 1, false), version(2, 1, false)])?.id, 2);
  assert.equal(currentVersionOf([version(1, 1, false), version(2, 1, true), version(3, 2, false)])?.id, 2);
  assert.equal(currentVersionOf([version(2, 1, true), version(4, 2, true)])?.id, 4);
});

test("small rules: version ids, optional boxes, the patch schema and the ARCO email", () => {
  assert.deepEqual(parseVersionIds("4, 5,x,0,-1,6"), [4, 5, 6]);
  assert.deepEqual(parseVersionIds(null), []);
  assert.equal(sameVersions([3, 1, 2], [1, 2, 3]), true);
  assert.equal(sameVersions([1, 2], [1, 2, 3]), false);
  assert.deepEqual(currentOptionalConsents({ comercial: true, boletin: "true", estadistica: false }), { comercial: true, boletin: false, estadistica: false });
  assert.equal(optionalConsentsPatchSchema.safeParse({}).success, false);
  assert.equal(optionalConsentsPatchSchema.safeParse({ boletin: true }).success, true);
  assert.equal(optionalConsentsPatchSchema.safeParse({ privacidad: false }).success, false);
  assert.equal(arcoEmailFrom(source("privacidad-integral").body), null);
  assert.equal(
    arcoEmailFrom("el correo electrónico para privacidad y derechos ARCO, privacidad@valuaxis.test, y el sitio web"),
    "privacidad@valuaxis.test",
  );
});

test("the cookies listed are the ones the code sets; none for analytics or ads", () => {
  assert.deepEqual(COOKIE_INVENTORY.map((cookie) => cookie.name), [AUTH_SESSION_COOKIE, "valuaxis_oauth", "valuaxis_registro"]);
  assert.match(readFileSync("src/features/auth/oauth/oauth-binding-cookie.ts", "utf8"), /OAUTH_BINDING_COOKIE = "valuaxis_oauth"/);
  assert.match(readFileSync("src/features/legal/registration-cookie.ts", "utf8"), /REGISTRATION_COOKIE = "valuaxis_registro"/);
});

test("footers link the five documents and «Avisos de terceros», which lists OpenStreetMap and Google Maps", () => {
  assert.deepEqual(LEGAL_FOOTER_LINKS.map((link) => link.href), [
    "/legal/terminos",
    "/legal/privacidad-integral",
    "/legal/politicas-comerciales",
    "/legal/anexo-ia",
    "/legal/informacion-disociada",
    "/legal/avisos-de-terceros",
  ]);
  const names = THIRD_PARTY_NOTICES.map((notice) => notice.name);
  for (const name of ["libvips", "PostGIS", "caniuse-lite", "OpenStreetMap", "Google Maps"]) assert.ok(names.includes(name), name);
  assert.match(THIRD_PARTY_NOTICES.find((notice) => notice.name === "OpenStreetMap")!.notice, /© colaboradores de OpenStreetMap.*ODbL/);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

test("the consent log and the document versions are append-only: no code updates or deletes them", () => {
  const offenders: string[] = [];
  for (const file of [...sourceFiles("src"), ...sourceFiles("scripts")]) {
    const text = readFileSync(file, "utf8");
    if (/\b(bitacoraConsentimiento|documentoLegal)\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b/.test(text)) offenders.push(file);
    if (/(UPDATE|DELETE\s+FROM)\s+"?devpware_(bitacora_consentimientos|documentos_legales)/i.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
