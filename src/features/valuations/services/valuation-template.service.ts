/**
 * The firm's own templates: the structure of one of its valuations, saved
 * under a name to start new valuations from or to import Blocks from.
 *
 * A template is a PlantillaAvaluo of the organization (never a system one)
 * with published VersionPlantilla rows whose JConfiguracionGeneral holds the
 * document (document-template.ts). Saving again under its name ("Reemplazar")
 * adds a version; the latest one is what new valuations and "Importar bloque"
 * read. Every read and write is scoped to the organization: another firm's
 * template is not found.
 */
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { initialSectionsFor } from "@/features/valuations/components/workspace/model/initial-hydration";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";
import type { AppSection } from "@/features/valuations/model";
import { buildDocumentTemplate, readDocumentTemplate, type DocumentTemplateContent } from "./document-template";
import { ValuationWorkflowError } from "./valuation-workflow/errors";
import type { Tx } from "./valuation-workflow/types";

export type ValuationTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  includeData: boolean;
  includeImages: boolean;
  sections: number;
  blocks: number;
  /** The number of the version in use: 1, plus one per replacement. */
  version: number;
  createdAt: string;
  /** Who saved the first version. */
  createdBy: string | null;
  /** The last rename, replacement or description change. */
  updatedAt: string;
  /** Who saved the version in use. */
  versionBy: string | null;
};

export type ValuationTemplateDetail = ValuationTemplateSummary & { content: DocumentTemplateContent };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const activeTemplateWhere = (organizationId: number) => ({
  IdOrganizacion: organizationId,
  BEsSistema: false,
  BActivo: true,
  DFechaEliminacion: null,
}) satisfies Prisma.PlantillaAvaluoWhereInput;

const author = { select: { SNombre: true, SApellidoPaterno: true } } satisfies Prisma.UsuarioDefaultArgs;

const latestVersion = {
  where: { BActiva: true },
  orderBy: { INumeroVersion: "desc" },
  take: 1,
  select: { INumeroVersion: true, JConfiguracionGeneral: true, usuarioCreador: author },
} satisfies Prisma.PlantillaAvaluo$versionesArgs;

type TemplateRow = Prisma.PlantillaAvaluoGetPayload<{ include: { versiones: typeof latestVersion } }>;
type Author = Prisma.UsuarioGetPayload<typeof author>;

const authorName = (user: Author | null | undefined) =>
  user ? [user.SNombre, user.SApellidoPaterno].filter(Boolean).join(" ") : null;

const nameKey = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Who saved the first version of each template, by its database id. */
async function firstAuthors(client: Tx, templateIds: number[]) {
  const versions = await client.versionPlantilla.findMany({
    where: { IdPlantillaAvaluo: { in: templateIds } },
    orderBy: [{ IdPlantillaAvaluo: "asc" }, { INumeroVersion: "asc" }],
    distinct: ["IdPlantillaAvaluo"],
    select: { IdPlantillaAvaluo: true, usuarioCreador: author },
  });
  return new Map(versions.map((version) => [version.IdPlantillaAvaluo, authorName(version.usuarioCreador)]));
}

function toSummary(row: TemplateRow, content: DocumentTemplateContent, createdBy: string | null): ValuationTemplateSummary {
  const visible = content.sections.filter((section) => section.blocks.length > 0);
  const version = row.versiones[0];
  return {
    id: row.UIdentificadorPublico,
    name: row.SNombre,
    description: row.SDescripcion,
    includeData: content.includeData,
    includeImages: content.includeImages,
    sections: visible.length,
    blocks: visible.reduce((total, section) => total + section.blocks.length, 0),
    version: version?.INumeroVersion ?? 1,
    createdAt: row.DFechaCreacion.toISOString(),
    createdBy,
    updatedAt: row.DFechaModificacion.toISOString(),
    versionBy: authorName(version?.usuarioCreador),
  };
}

async function summaryOf(client: Tx, row: TemplateRow, content: DocumentTemplateContent) {
  return toSummary(row, content, (await firstAuthors(client, [row.IdPlantillaAvaluo])).get(row.IdPlantillaAvaluo) ?? null);
}

/** The firm's templates that hold a document, by name. */
export async function listValuationTemplates(organizationId: number): Promise<ValuationTemplateSummary[]> {
  const rows = await prisma.plantillaAvaluo.findMany({
    where: activeTemplateWhere(organizationId),
    orderBy: [{ SNombre: "asc" }],
    include: { versiones: latestVersion },
  });
  const authors = await firstAuthors(prisma, rows.map((row) => row.IdPlantillaAvaluo));
  return rows.flatMap((row) => {
    const content = readDocumentTemplate(row.versiones[0]?.JConfiguracionGeneral);
    return content ? [toSummary(row, content, authors.get(row.IdPlantillaAvaluo) ?? null)] : [];
  });
}

async function findTemplate(organizationId: number, publicId: string) {
  if (!UUID.test(publicId)) return null;
  return prisma.plantillaAvaluo.findFirst({
    where: { ...activeTemplateWhere(organizationId), UIdentificadorPublico: publicId },
    include: { versiones: latestVersion },
  });
}

export async function getValuationTemplate(organizationId: number, publicId: string): Promise<ValuationTemplateDetail | null> {
  const row = await findTemplate(organizationId, publicId);
  const content = readDocumentTemplate(row?.versiones[0]?.JConfiguracionGeneral);
  return row && content ? { ...(await summaryOf(prisma, row, content)), content } : null;
}

/** The firm's template with that name, ignoring case, accents and repeated spaces. */
async function templateNamed(organizationId: number, name: string, exceptId?: number) {
  const rows = await prisma.plantillaAvaluo.findMany({
    where: activeTemplateWhere(organizationId),
    select: { IdPlantillaAvaluo: true, SNombre: true },
  });
  return rows.find((row) => row.IdPlantillaAvaluo !== exceptId && nameKey(row.SNombre) === nameKey(name)) ?? null;
}

const nameTaken = () => new ValuationWorkflowError("Ya hay una plantilla con ese nombre.", 409);

const descriptionData = (description: string | null | undefined) =>
  description === undefined ? {} : { SDescripcion: description?.trim() || null };

/**
 * Saves the document of one of the firm's valuations, as it is saved now, as
 * a template. Under the name of an existing one it is refused (409) unless
 * `replace`: then it becomes a new version of that template.
 */
export async function createValuationTemplate(input: {
  user: AuthUser;
  name: string;
  description?: string | null;
  valuationId: string;
  includeData: boolean;
  includeImages: boolean;
  replace?: boolean;
}): Promise<ValuationTemplateSummary & { replaced: boolean }> {
  const organizationId = input.user.organizationId;
  const [valuation, detail] = await Promise.all([
    UUID.test(input.valuationId)
      ? prisma.avaluo.findFirst({
          where: { UIdentificadorPublico: input.valuationId, IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null },
          select: { IdTipoAvaluo: true },
        })
      : null,
    getValuationByPublicId(input.valuationId, organizationId),
  ]);
  if (!valuation || !detail) throw new ValuationWorkflowError("Avaluo no encontrado", 404);

  const content = buildDocumentTemplate(initialSectionsFor(detail), {
    includeData: input.includeData,
    includeImages: input.includeImages,
  });
  const existing = await templateNamed(organizationId, input.name);
  if (existing) {
    if (!input.replace) throw nameTaken();
    const replaced = await replaceTemplateDocument(existing.IdPlantillaAvaluo, valuation.IdTipoAvaluo, content, input);
    return { ...replaced, replaced: true };
  }
  const row = await prisma.plantillaAvaluo.create({
    data: {
      IdOrganizacion: organizationId,
      IdTipoAvaluo: valuation.IdTipoAvaluo,
      SNombre: input.name,
      SDescripcion: input.description?.trim() || null,
      BEsSistema: false,
      versiones: {
        create: {
          IdUsuarioCreador: input.user.id,
          INumeroVersion: 1,
          JConfiguracionGeneral: content as unknown as Prisma.InputJsonObject,
          BPublicada: true,
          DFechaPublicacion: new Date(),
        },
      },
    },
    include: { versiones: latestVersion },
  });
  return { ...toSummary(row, content, authorName(row.versiones[0]?.usuarioCreador)), replaced: false };
}

/**
 * A new version of the template with this document. The name stays; the
 * description changes only when one is sent. Earlier versions are kept,
 * inactive, so nothing reads them any more.
 */
async function replaceTemplateDocument(
  templateId: number,
  appraisalTypeId: number,
  content: DocumentTemplateContent,
  input: { user: AuthUser; description?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.versionPlantilla.aggregate({ where: { IdPlantillaAvaluo: templateId }, _max: { INumeroVersion: true } });
    const number = (last._max.INumeroVersion ?? 0) + 1;
    await tx.versionPlantilla.updateMany({ where: { IdPlantillaAvaluo: templateId, BActiva: true }, data: { BActiva: false } });
    const row = await tx.plantillaAvaluo.update({
      where: { IdPlantillaAvaluo: templateId },
      data: {
        IdTipoAvaluo: appraisalTypeId,
        INumeroVersionActual: number,
        ...descriptionData(input.description),
        versiones: {
          create: {
            IdUsuarioCreador: input.user.id,
            INumeroVersion: number,
            JConfiguracionGeneral: content as unknown as Prisma.InputJsonObject,
            BPublicada: true,
            DFechaPublicacion: new Date(),
          },
        },
      },
      include: { versiones: latestVersion },
    });
    return summaryOf(tx, row, content);
  });
}

/** Changes the name and, when sent, the description; the name stays unique in the firm. */
export async function updateValuationTemplate(
  organizationId: number,
  publicId: string,
  changes: { name: string; description?: string | null },
) {
  const row = await findTemplate(organizationId, publicId);
  const content = readDocumentTemplate(row?.versiones[0]?.JConfiguracionGeneral);
  if (!row || !content) return null;
  if (await templateNamed(organizationId, changes.name, row.IdPlantillaAvaluo)) throw nameTaken();
  const updated = await prisma.plantillaAvaluo.update({
    where: { IdPlantillaAvaluo: row.IdPlantillaAvaluo },
    data: { SNombre: changes.name, ...descriptionData(changes.description) },
    include: { versiones: latestVersion },
  });
  return summaryOf(prisma, updated, content);
}

/** Removes the template from the firm's list; valuations created from it keep their content. */
export async function deleteValuationTemplate(organizationId: number, publicId: string) {
  const row = await findTemplate(organizationId, publicId);
  if (!row) return false;
  await prisma.plantillaAvaluo.update({
    where: { IdPlantillaAvaluo: row.IdPlantillaAvaluo },
    data: { BActivo: false, DFechaEliminacion: new Date() },
  });
  return true;
}

/**
 * The document a template (by its database id) starts a new valuation with,
 * or null for a template without one (the system's template, older rows).
 */
export async function templateSectionsForCreation(client: Tx, templateId: number, organizationId: number): Promise<AppSection[] | null> {
  const row = await client.plantillaAvaluo.findFirst({
    where: { ...activeTemplateWhere(organizationId), IdPlantillaAvaluo: templateId },
    include: { versiones: latestVersion },
  });
  return readDocumentTemplate(row?.versiones[0]?.JConfiguracionGeneral)?.sections ?? null;
}
