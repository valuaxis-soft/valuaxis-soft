/**
 * The firm's own templates: the structure of one of its valuations, saved
 * under a name to start new valuations from or to import Blocks from.
 *
 * A template is a PlantillaAvaluo of the organization (never a system one)
 * with one published VersionPlantilla whose JConfiguracionGeneral holds the
 * document (document-template.ts). Every read and write is scoped to the
 * organization: another firm's template is not found.
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
  createdAt: string;
  updatedAt: string;
};

export type ValuationTemplateDetail = ValuationTemplateSummary & { content: DocumentTemplateContent };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const activeTemplateWhere = (organizationId: number) => ({
  IdOrganizacion: organizationId,
  BEsSistema: false,
  BActivo: true,
  DFechaEliminacion: null,
}) satisfies Prisma.PlantillaAvaluoWhereInput;

const latestVersion = {
  where: { BActiva: true },
  orderBy: { INumeroVersion: "desc" },
  take: 1,
  select: { JConfiguracionGeneral: true },
} satisfies Prisma.PlantillaAvaluo$versionesArgs;

type TemplateRow = Prisma.PlantillaAvaluoGetPayload<{ include: { versiones: typeof latestVersion } }>;

const nameKey = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function toSummary(row: TemplateRow, content: DocumentTemplateContent): ValuationTemplateSummary {
  const visible = content.sections.filter((section) => section.blocks.length > 0);
  return {
    id: row.UIdentificadorPublico,
    name: row.SNombre,
    description: row.SDescripcion,
    includeData: content.includeData,
    includeImages: content.includeImages,
    sections: visible.length,
    blocks: visible.reduce((total, section) => total + section.blocks.length, 0),
    createdAt: row.DFechaCreacion.toISOString(),
    updatedAt: row.DFechaModificacion.toISOString(),
  };
}

/** The firm's templates that hold a document, by name. */
export async function listValuationTemplates(organizationId: number): Promise<ValuationTemplateSummary[]> {
  const rows = await prisma.plantillaAvaluo.findMany({
    where: activeTemplateWhere(organizationId),
    orderBy: [{ SNombre: "asc" }],
    include: { versiones: latestVersion },
  });
  return rows.flatMap((row) => {
    const content = readDocumentTemplate(row.versiones[0]?.JConfiguracionGeneral);
    return content ? [toSummary(row, content)] : [];
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
  return row && content ? { ...toSummary(row, content), content } : null;
}

async function assertFreeName(organizationId: number, name: string, exceptId?: number) {
  const rows = await prisma.plantillaAvaluo.findMany({
    where: activeTemplateWhere(organizationId),
    select: { IdPlantillaAvaluo: true, SNombre: true },
  });
  if (rows.some((row) => row.IdPlantillaAvaluo !== exceptId && nameKey(row.SNombre) === nameKey(name))) {
    throw new ValuationWorkflowError("Ya hay una plantilla con ese nombre.", 409);
  }
}

/** Saves the document of one of the firm's valuations, as it is saved now, as a template. */
export async function createValuationTemplate(input: {
  user: AuthUser;
  name: string;
  description?: string | null;
  valuationId: string;
  includeData: boolean;
  includeImages: boolean;
}): Promise<ValuationTemplateSummary> {
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
  await assertFreeName(organizationId, input.name);

  const content = buildDocumentTemplate(initialSectionsFor(detail), {
    includeData: input.includeData,
    includeImages: input.includeImages,
  });
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
  return toSummary(row, content);
}

export async function renameValuationTemplate(organizationId: number, publicId: string, name: string) {
  const row = await findTemplate(organizationId, publicId);
  const content = readDocumentTemplate(row?.versiones[0]?.JConfiguracionGeneral);
  if (!row || !content) return null;
  await assertFreeName(organizationId, name, row.IdPlantillaAvaluo);
  const updated = await prisma.plantillaAvaluo.update({
    where: { IdPlantillaAvaluo: row.IdPlantillaAvaluo },
    data: { SNombre: name },
    include: { versiones: latestVersion },
  });
  return toSummary(updated, content);
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
