/**
 * Publishes a new version of a legal document (docs/LEGAL.md). Nothing is
 * written without --apply: the dry run prints what would be stored.
 *
 *   pnpm legal:publish estado
 *   pnpm legal:publish <documento> <archivo.md> [--borrador] [--sin-nueva-aceptacion] [--fecha AAAA-MM-DD] [--titulo "<título>"] [--por "<quién>"] [--apply]
 *
 * Inside the production container: node --import tsx scripts/ops/publicar-legal.ts <documento> <archivo> …
 *
 * <documento>: terminos | licencia | privacidad-integral | privacidad-simplificado
 * | politicas-comerciales | anexo-ia | informacion-disociada.
 *
 * The file is the document's markdown (docs/legal/<documento>.md is the
 * model): the front matter is optional (titulo, fecha) and the body is stored
 * exactly as written, with its SHA-256. A version for publication is refused
 * while it has a blank («______»): the lawyer's texts still have the address,
 * the emails, the phone, the website and the bank details to fill. --borrador
 * stores a draft instead (never required, shown only while the document has
 * no published version). --sin-nueva-aceptacion marks a published change that
 * does not ask accounts to accept again (Terms 15.2: only changes to their
 * rights or obligations do). A stored version is never changed: a correction
 * is a new version.
 */
import { readFile } from "node:fs/promises";
import { prisma } from "../../src/infrastructure/database/prisma-client";
import { LegalPublishError, insertLegalVersion } from "../../src/features/legal/legal-document.repository";
import { LEGAL_BLANK, LEGAL_DOCUMENT_KEYS, LEGAL_DOCUMENT_TITLES, isLegalDocumentKey, parseLegalSource } from "../../src/features/legal/legal-documents";
import { legalTextHash } from "../../src/features/legal/legal-text-hash";

const USAGE = [
  "Uso: pnpm legal:publish estado",
  "     pnpm legal:publish <documento> <archivo.md> [--borrador] [--sin-nueva-aceptacion] [--fecha AAAA-MM-DD] [--titulo <título>] [--por <quién>] [--apply]",
  `     documento: ${LEGAL_DOCUMENT_KEYS.join(" | ")}`,
].join("\n");

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = { apply: false, draft: false, noReacceptance: false, date: null as string | null, title: null as string | null, by: "operador" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") flags.apply = true;
    else if (arg === "--borrador") flags.draft = true;
    else if (arg === "--sin-nueva-aceptacion") flags.noReacceptance = true;
    else if (arg === "--fecha") flags.date = argv[++index] ?? null;
    else if (arg === "--titulo") flags.title = argv[++index] ?? null;
    else if (arg === "--por") flags.by = argv[++index] ?? flags.by;
    else positional.push(arg);
  }
  return { positional, flags };
}

/** Today in Mexico City, as the date a document carries. */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());

async function status() {
  const rows = await prisma.documentoLegal.findMany({
    select: { SDocumento: true, IVersion: true, BPublicable: true, BRequiereAceptacion: true, DFechaActualizacion: true, SHashSha256: true, DFechaCreacion: true, TTexto: true },
    orderBy: [{ SDocumento: "asc" }, { IVersion: "asc" }, { DFechaCreacion: "asc" }],
  });
  for (const key of LEGAL_DOCUMENT_KEYS) {
    console.log(`\n${LEGAL_DOCUMENT_TITLES[key]} (${key})`);
    const versions = rows.filter((row) => row.SDocumento === key);
    if (!versions.length) console.log("  sin versiones");
    for (const row of versions) {
      const blanks = row.TTexto.split(LEGAL_BLANK).length - 1;
      console.log(
        `  v${row.IVersion} ${row.BPublicable ? "PUBLICADA" : "borrador "} ${row.DFechaActualizacion.toISOString().slice(0, 10)}` +
          `${row.BPublicable && !row.BRequiereAceptacion ? " (sin nueva aceptación)" : ""}` +
          `${blanks ? ` · ${blanks} espacios en blanco` : ""} · sha256 ${row.SHashSha256.slice(0, 12)}…`,
      );
    }
  }
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (positional[0] === "estado") return status();
  const [documento, file] = positional;
  if (!documento || !file || !isLegalDocumentKey(documento)) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const source = parseLegalSource(await readFile(file, "utf8"));
  if (source.document && source.document !== documento) {
    throw new LegalPublishError(`El archivo dice «documento: ${source.document}», no ${documento}.`);
  }
  const date = flags.date ?? source.date ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new LegalPublishError("La fecha va como AAAA-MM-DD.");
  const title = flags.title ?? source.title ?? LEGAL_DOCUMENT_TITLES[documento];
  const blanks = source.body.split(LEGAL_BLANK).length - 1;
  const published = !flags.draft;

  console.log(`${published ? "Publicar" : "Guardar como borrador"}: ${title} (${documento})`);
  console.log(`  fecha de actualización ${date} · ${source.body.length} caracteres · sha256 ${legalTextHash(source.body)}`);
  console.log(`  ${published ? (flags.noReacceptance ? "no pide nueva aceptación" : "pide aceptarla a quien aceptó una versión anterior") : "borrador: nadie tiene que aceptarlo"}`);
  if (blanks) console.log(`  ${blanks} espacios en blanco («${LEGAL_BLANK}»)`);
  if (published && blanks) {
    throw new LegalPublishError("No se publica un texto con espacios en blanco: llénalos (domicilio, correos, teléfono, sitio web, banco…) y vuelve a correrlo.");
  }
  if (!flags.apply) {
    console.log("\nSimulación: agrega --apply para guardarlo.");
    return;
  }
  const stored = await insertLegalVersion({
    documento,
    title,
    updatedOn: new Date(`${date}T00:00:00Z`),
    text: source.body,
    published,
    requiresAcceptance: published && !flags.noReacceptance,
    registeredBy: flags.by,
  });
  console.log(`\nGuardado: versión ${stored.version} ${stored.published ? "publicada" : "(borrador)"}, id ${stored.id}. Se ve en /legal/${documento}/v/${stored.version}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof LegalPublishError ? `No se guardó: ${error.message}` : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
