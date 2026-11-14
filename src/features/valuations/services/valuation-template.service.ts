/**
 * The firm's own templates: the structure of one of its valuations, saved
 * under a name to start new valuations from or to import Blocks from.
 *
 * A template is a PlantillaAvaluo of the organization (never a system one)
 * with published VersionPlantilla rows whose JConfiguracionGeneral holds the
 * document (document-template.ts). Saving again under its name ("Reemplazar")
 * adds a version; the latest one is what new valuations and "Importar"
 * read. Every read and write is scoped to the organization: another firm's
 * template is not found.
 */
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { initialSectionsFor } from "@/features/valuations/components/workspace/model/initial-hydration";
import { getValuationByPublicId, newValuationSections } from "@/features/valuations/repositories/valuation.repository";
import type { AppSection } from "@/features/valuations/model";
import { initiallyHiddenSections } from "@/features/valuations/sections/section-registry";
import {
  blankTemplateSections,
  documentHasImages,
  buildDocumentTemplate,
  readDocumentTemplate,
  templateContainsData,
  type DocumentTemplateContent,
} from "./document-template";
import { ValuationWorkflowError } from "./valuation-workflow/errors";
import type { Tx } from "./valuation-workflow/types";

export type ValuationTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  includeData: boolean;
  /** The template still carries data of a client or a property (saved before 2 Nov 2026 with "Incluir datos"). */
  containsData: boolean;
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
  /** The kind of valuation it is meant for (the template's IdTipoAvaluo). */
  appraisalType: { id: number; name: string };
  /** The kind of property it is meant for; null: any. */
  propertyType: { id: number; key: string; name: string } | null;
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

const templateInclude = {
  versiones: latestVersion,
  tipoAvaluo: { select: { IdTipoAvaluo: true, SNombre: true } },
} satisfies Prisma.PlantillaAvaluoInclude;

type TemplateRow = Prisma.PlantillaAvaluoGetPayload<{ include: typeof templateInclude }>;
type PropertyType = { id: number; key: string; name: string };

/** The kinds of property, by key: a template keeps the key of the one it is meant for. */
async function propertyTypesByKey(client: Tx) {
  const rows = await client.tipoInmueble.findMany({ select: { IdTipoInmueble: true, SClave: true, SNombre: true } });
  return new Map(rows.map((row) => [row.SClave, { id: row.IdTipoInmueble, key: row.SClave, name: row.SNombre }]));
}
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

function toSummary(
  row: TemplateRow, content: DocumentTemplateContent, createdBy: string | null, propertyTypes: Map<string, PropertyType>,
): ValuationTemplateSummary {
  const visible = content.sections.filter((section) => section.blocks.length > 0);
  const version = row.versiones[0];
  return {
    id: row.UIdentificadorPublico,
    name: row.SNombre,
    description: row.SDescripcion,
    includeData: content.includeData,
    containsData: templateContainsData(content.sections),
    includeImages: content.includeImages,
    sections: visible.length,
    blocks: visible.reduce((total, section) => total + section.blocks.length, 0),
    version: version?.INumeroVersion ?? 1,
    createdAt: row.DFechaCreacion.toISOString(),
    createdBy,
    updatedAt: row.DFechaModificacion.toISOString(),
    versionBy: authorName(version?.usuarioCreador),
    appraisalType: { id: row.tipoAvaluo.IdTipoAvaluo, name: row.tipoAvaluo.SNombre },
    propertyType: (content.propertyTypeKey && propertyTypes.get(content.propertyTypeKey)) || null,
  };
}

async function summaryOf(client: Tx, row: TemplateRow, content: DocumentTemplateContent) {
  const [authors, propertyTypes] = await Promise.all([firstAuthors(client, [row.IdPlantillaAvaluo]), propertyTypesByKey(client)]);
  return toSummary(row, content, authors.get(row.IdPlantillaAvaluo) ?? null, propertyTypes);
}

/** The firm's templates that hold a document, by name. */
export async function listValuationTemplates(organizationId: number): Promise<ValuationTemplateSummary[]> {
  const rows = await prisma.plantillaAvaluo.findMany({
    where: activeTemplateWhere(organizationId),
    orderBy: [{ SNombre: "asc" }],
    include: templateInclude,
  });
  const [authors, propertyTypes] = await Promise.all([firstAuthors(prisma, rows.map((row) => row.IdPlantillaAvaluo)), propertyTypesByKey(prisma)]);
  return rows.flatMap((row) => {
    const content = readDocumentTemplate(row.versiones[0]?.JConfiguracionGeneral);
    return content ? [toSummary(row, content, authors.get(row.IdPlantillaAvaluo) ?? null, propertyTypes)] : [];
  });
}

async function findTemplate(organizationId: number, publicId: string) {
  if (!UUID.test(publicId)) return null;
  return prisma.plantillaAvaluo.findFirst({
    where: { ...activeTemplateWhere(organizationId), UIdentificadorPublico: publicId },
    include: templateInclude,
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
  return { ...(await insertTemplate({ ...input, appraisalTypeId: valuation.IdTipoAvaluo, content })), replaced: false };
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
    // A replacement keeps what the template is meant for.
    const active = await tx.versionPlantilla.findFirst({
      where: { IdPlantillaAvaluo: templateId, BActiva: true },
      orderBy: { INumeroVersion: "desc" },
      select: { JConfiguracionGeneral: true },
    });
    const kept = readDocumentTemplate(active?.JConfiguracionGeneral)?.propertyTypeKey;
    const document = kept && !content.propertyTypeKey ? { ...content, propertyTypeKey: kept } : content;
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
            JConfiguracionGeneral: document as unknown as Prisma.InputJsonObject,
            BPublicada: true,
            DFechaPublicacion: new Date(),
          },
        },
      },
      include: templateInclude,
    });
    return summaryOf(tx, row, document);
  });
}

/** The kind of valuation and of property a template is meant for; an unknown id is refused (400). */
async function appliesTo(client: Tx, appraisalTypeId: number, propertyTypeId: number | null) {
  const [appraisalType, propertyType] = await Promise.all([
    client.tipoAvaluo.findFirst({ where: { IdTipoAvaluo: appraisalTypeId, BActivo: true }, select: { IdTipoAvaluo: true } }),
    propertyTypeId === null
      ? null
      : client.tipoInmueble.findFirst({ where: { IdTipoInmueble: propertyTypeId, BActivo: true }, select: { SClave: true } }),
  ]);
  if (!appraisalType) throw new ValuationWorkflowError("El tipo de avalúo no existe.", 400);
  if (propertyTypeId !== null && !propertyType) throw new ValuationWorkflowError("El tipo de bien no existe.", 400);
  return { appraisalTypeId: appraisalType.IdTipoAvaluo, propertyTypeKey: propertyType?.SClave ?? null };
}

/** A new template of the firm with its first version. */
async function insertTemplate(input: {
  user: AuthUser;
  name: string;
  description?: string | null;
  appraisalTypeId: number;
  content: DocumentTemplateContent;
}) {
  const row = await prisma.plantillaAvaluo.create({
    data: {
      IdOrganizacion: input.user.organizationId,
      IdTipoAvaluo: input.appraisalTypeId,
      SNombre: input.name,
      SDescripcion: input.description?.trim() || null,
      BEsSistema: false,
      versiones: {
        create: {
          IdUsuarioCreador: input.user.id,
          INumeroVersion: 1,
          JConfiguracionGeneral: input.content as unknown as Prisma.InputJsonObject,
          BPublicada: true,
          DFechaPublicacion: new Date(),
        },
      },
    },
    include: templateInclude,
  });
  return summaryOf(prisma, row, input.content);
}

/**
 * A document shaped in the template editor, without the client's data (the
 * same cleaning as «Guardar como plantilla»). The images put there are the
 * template's own and stay; «Con imágenes» says whether it has any.
 */
function editedTemplate(sections: AppSection[]): DocumentTemplateContent {
  const content = buildDocumentTemplate(sections, { includeImages: true });
  return { ...content, includeImages: documentHasImages(content.sections) };
}

/**
 * «Nueva plantilla»: a template of the firm that starts from the sections of
 * a new valuation of the system (the machinery ones hidden for machinery),
 * to shape in the editor. Its name is unique in the firm.
 */
export async function createBlankValuationTemplate(input: {
  user: AuthUser;
  name: string;
  description?: string | null;
  appraisalTypeId: number;
  propertyTypeId: number | null;
}): Promise<ValuationTemplateSummary> {
  if (await templateNamed(input.user.organizationId, input.name)) throw nameTaken();
  const target = await appliesTo(prisma, input.appraisalTypeId, input.propertyTypeId);
  const sections = blankTemplateSections(
    initialSectionsFor({ sections: newValuationSections(target.propertyTypeKey?.toLowerCase()) }),
    initiallyHiddenSections(target.propertyTypeKey ?? ""),
  );
  const content: DocumentTemplateContent = {
    ...editedTemplate(sections),
    ...(target.propertyTypeKey ? { propertyTypeKey: target.propertyTypeKey } : {}),
  };
  return insertTemplate({ ...input, appraisalTypeId: target.appraisalTypeId, content });
}

/** «Duplicar»: the same document and type under another name, as a template of its own (version 1). */
export async function duplicateValuationTemplate(user: AuthUser, publicId: string, name: string): Promise<ValuationTemplateSummary | null> {
  const row = await findTemplate(user.organizationId, publicId);
  const content = readDocumentTemplate(row?.versiones[0]?.JConfiguracionGeneral);
  if (!row || !content) return null;
  if (await templateNamed(user.organizationId, name)) throw nameTaken();
  return insertTemplate({ user, name, description: row.SDescripcion, appraisalTypeId: row.IdTipoAvaluo, content });
}

/**
 * «Editar plantilla» saves the editor's document as the template's, without
 * the client's data (the same cleaning as «Guardar como plantilla»; the
 * images the appraiser put in the template stay). The first save of an
 * editing session adds a version; the next ones of that session (`sameSession`)
 * change it in place, so autosave does not pile up versions. `version` is the
 * one the editor opened (or last saved): when someone else saved another one
 * meanwhile, the save is refused (409) instead of undoing their changes.
 */
export async function saveValuationTemplateDocument(input: {
  user: AuthUser;
  publicId: string;
  sections: AppSection[];
  version: number;
  sameSession: boolean;
}): Promise<ValuationTemplateSummary | null> {
  const row = await findTemplate(input.user.organizationId, input.publicId);
  const current = row?.versiones[0];
  const stored = readDocumentTemplate(current?.JConfiguracionGeneral);
  if (!row || !current || !stored) return null;
  if (current.INumeroVersion !== input.version) {
    throw new ValuationWorkflowError(
      `Mientras editabas, ${authorName(current.usuarioCreador) ?? "otra persona"} guardó la versión ${current.INumeroVersion} de la plantilla. Sal sin guardar y vuelve a abrirla para no deshacer sus cambios.`,
      409,
    );
  }
  const content: DocumentTemplateContent = {
    ...editedTemplate(input.sections),
    ...(stored.propertyTypeKey ? { propertyTypeKey: stored.propertyTypeKey } : {}),
  };
  if (!input.sameSession) return replaceTemplateDocument(row.IdPlantillaAvaluo, row.IdTipoAvaluo, content, { user: input.user });
  return prisma.$transaction(async (tx) => {
    await tx.versionPlantilla.updateMany({
      where: { IdPlantillaAvaluo: row.IdPlantillaAvaluo, INumeroVersion: current.INumeroVersion, BActiva: true },
      data: { JConfiguracionGeneral: content as unknown as Prisma.InputJsonObject, IdUsuarioCreador: input.user.id, DFechaPublicacion: new Date() },
    });
    // Touched, so «Actualizada» says when.
    const updated = await tx.plantillaAvaluo.update({
      where: { IdPlantillaAvaluo: row.IdPlantillaAvaluo },
      data: { DFechaModificacion: new Date() },
      include: templateInclude,
    });
    return summaryOf(tx, updated, content);
  });
}

/**
 * Changes the name and, when sent, the description and the kind of valuation
 * and of property it is meant for; the name stays unique in the firm.
 */
export async function updateValuationTemplate(
  organizationId: number,
  publicId: string,
  changes: { name: string; description?: string | null; appraisalTypeId?: number; propertyTypeId?: number | null },
) {
  const row = await findTemplate(organizationId, publicId);
  const content = readDocumentTemplate(row?.versiones[0]?.JConfiguracionGeneral);
  if (!row || !content) return null;
  if (await templateNamed(organizationId, changes.name, row.IdPlantillaAvaluo)) throw nameTaken();
  const target = changes.appraisalTypeId === undefined
    ? null
    : await appliesTo(prisma, changes.appraisalTypeId, changes.propertyTypeId ?? null);
  return prisma.$transaction(async (tx) => {
    let next = content;
    if (target && changes.propertyTypeId !== undefined && (content.propertyTypeKey ?? null) !== target.propertyTypeKey) {
      // What it is meant for is not a new version of its document: the version in use keeps its number.
      const { propertyTypeKey: _previous, ...rest } = content;
      next = target.propertyTypeKey ? { ...rest, propertyTypeKey: target.propertyTypeKey } : rest;
      await tx.versionPlantilla.updateMany({
        where: { IdPlantillaAvaluo: row.IdPlantillaAvaluo, BActiva: true, INumeroVersion: row.versiones[0]?.INumeroVersion },
        data: { JConfiguracionGeneral: next as unknown as Prisma.InputJsonObject },
      });
    }
    const updated = await tx.plantillaAvaluo.update({
      where: { IdPlantillaAvaluo: row.IdPlantillaAvaluo },
      data: {
        SNombre: changes.name,
        ...descriptionData(changes.description),
        ...(target ? { IdTipoAvaluo: target.appraisalTypeId } : {}),
      },
      include: templateInclude,
    });
    return summaryOf(tx, updated, next);
  });
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
