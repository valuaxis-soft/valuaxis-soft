import type { DocumentoLegal } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";
import { hasLegalBlanks, type LegalDocumentKey } from "./legal-documents";
import { legalTextHash } from "./legal-text-hash";

/**
 * The versions of the legal documents (`devpware_documentos_legales`). Insert
 * and read only: a version is never changed or deleted (matrix 3.1, CCom art.
 * 49); a new text is a new row.
 */

export type LegalVersion = {
  id: number;
  documento: LegalDocumentKey;
  version: number;
  title: string;
  /** The update date the document carries (a calendar date, UTC midnight). */
  updatedOn: Date;
  text: string;
  hash: string;
  published: boolean;
  requiresAcceptance: boolean;
  createdAt: Date;
};

const toVersion = (row: DocumentoLegal): LegalVersion => ({
  id: row.IdDocumentoLegal,
  documento: row.SDocumento as LegalDocumentKey,
  version: row.IVersion,
  title: row.STitulo,
  updatedOn: row.DFechaActualizacion,
  text: row.TTexto,
  hash: row.SHashSha256,
  published: row.BPublicable,
  requiresAcceptance: row.BRequiereAceptacion,
  createdAt: row.DFechaCreacion,
});

/** Every version of a document, newest first: published ones by number, drafts after the latest published. */
async function listRows(documento: LegalDocumentKey) {
  return prisma.documentoLegal.findMany({
    where: { SDocumento: documento },
    orderBy: [{ IVersion: "desc" }, { DFechaCreacion: "desc" }, { IdDocumentoLegal: "desc" }],
  });
}

/**
 * The version in force: the newest published one. While a document has never
 * been published, its newest draft stands in, marked as such (docs/LEGAL.md):
 * sign-up links to it and nothing requires it.
 */
export function currentVersionOf(rows: readonly LegalVersion[]): LegalVersion | null {
  const published = rows.filter((row) => row.published).sort((a, b) => b.version - a.version);
  if (published.length) return published[0];
  const drafts = [...rows].sort((a, b) => b.version - a.version || b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
  return drafts[0] ?? null;
}

export async function findCurrentLegalVersion(documento: LegalDocumentKey) {
  return currentVersionOf((await listRows(documento)).map(toVersion));
}

/** The version in force of each document asked for, by key; a document with no row is missing. */
export async function findCurrentLegalVersions(documentos: readonly LegalDocumentKey[]) {
  const rows = await prisma.documentoLegal.findMany({ where: { SDocumento: { in: [...documentos] } } });
  const versions = rows.map(toVersion);
  const current = new Map<LegalDocumentKey, LegalVersion>();
  for (const documento of documentos) {
    const version = currentVersionOf(versions.filter((row) => row.documento === documento));
    if (version) current.set(documento, version);
  }
  return current;
}

/** The published versions of a document, newest first (its public history). */
export async function listPublishedLegalVersions(documento: LegalDocumentKey) {
  return (await listRows(documento)).filter((row) => row.BPublicable).map(toVersion);
}

/**
 * Version `version` of a document as the public page shows it: the published
 * one; a draft only while the document has never been published.
 */
export async function findLegalVersion(documento: LegalDocumentKey, version: number) {
  const rows = (await listRows(documento)).map(toVersion);
  const published = rows.find((row) => row.published && row.version === version);
  if (published) return published;
  if (rows.some((row) => row.published)) return null;
  const current = currentVersionOf(rows);
  return current && current.version === version ? current : null;
}

/** For the acceptance gate: number and whether it asks for acceptance, of every published version. */
export async function listPublishedVersionSummaries() {
  const rows = await prisma.documentoLegal.findMany({
    where: { BPublicable: true },
    select: { SDocumento: true, IVersion: true, BRequiereAceptacion: true },
  });
  return rows.map((row) => ({ documento: row.SDocumento as LegalDocumentKey, version: row.IVersion, requiresAcceptance: row.BRequiereAceptacion }));
}

export class LegalPublishError extends Error {}

/**
 * Stores a new version of a document (`pnpm legal:publish`). A published one
 * takes the next number after the last published; a draft, the number it would
 * be published with. A text for publication must have no blanks left.
 */
export async function insertLegalVersion(input: {
  documento: LegalDocumentKey;
  title: string;
  updatedOn: Date;
  text: string;
  published: boolean;
  requiresAcceptance: boolean;
  registeredBy: string;
}) {
  if (!input.text.trim()) throw new LegalPublishError("El texto está vacío.");
  if (input.published && hasLegalBlanks(input.text)) {
    throw new LegalPublishError("El texto todavía tiene espacios en blanco («______»): llénalos antes de publicar.");
  }
  const hash = legalTextHash(input.text);
  return prisma.$transaction(async (tx) => {
    // One publication at a time per document: the next number is read and taken under this lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`legal:${input.documento}`}))`;
    const lastPublished = await tx.documentoLegal.findFirst({
      where: { SDocumento: input.documento, BPublicable: true },
      orderBy: { IVersion: "desc" },
    });
    if (input.published && lastPublished?.SHashSha256 === hash) {
      throw new LegalPublishError(`Ese texto ya es la versión ${lastPublished.IVersion} publicada.`);
    }
    const row = await tx.documentoLegal.create({
      data: {
        SDocumento: input.documento,
        IVersion: (lastPublished?.IVersion ?? 0) + 1,
        STitulo: input.title,
        DFechaActualizacion: input.updatedOn,
        TTexto: input.text,
        SHashSha256: hash,
        BPublicable: input.published,
        BRequiereAceptacion: input.requiresAcceptance,
        SRegistradoPor: input.registeredBy,
      },
    });
    return toVersion(row);
  });
}
