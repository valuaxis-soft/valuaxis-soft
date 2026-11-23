/**
 * Despacho → Colores del dictamen: the palette the firm's new valuations and
 * new templates start with.
 *
 * Without a migration: like the review checklist, it is a custom field of the
 * firm (PALETA_DICTAMEN, devpware_campos_personalizados, data type JSON) and
 * lives in its JConfiguracion. A valuation keeps its own copy on its carátula
 * section, so changing the firm's palette never repaints a valuation that
 * already exists.
 */
import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import {
  DEFAULT_DOCUMENT_PALETTE,
  readDocumentPalette,
  sameDocumentPalette,
  type DocumentPalette,
} from "@/features/valuations/services/document-palette";
import { prisma } from "@/infrastructure/database/prisma-client";
import type { Prisma } from "@prisma/client";

export const DOCUMENT_PALETTE_FIELD_KEY = "PALETA_DICTAMEN";
const JSON_DATA_TYPE = "JSON";

export type FirmDocumentPaletteDto = {
  /** The firm's palette; the document's own blue while it has not chosen one. */
  palette: DocumentPalette;
  /** The firm chose a palette other than the document's own. */
  customized: boolean;
};

type Client = Prisma.TransactionClient | typeof prisma;

const fieldWhere = (organizationId: number) => ({
  IdOrganizacion: organizationId,
  SClave: DOCUMENT_PALETTE_FIELD_KEY,
  DFechaEliminacion: null,
}) satisfies Prisma.CampoPersonalizadoWhereInput;

/** The palette the firm chose, or null while it prints with the document's own. */
async function storedFirmPalette(organizationId: number, client: Client): Promise<DocumentPalette | null> {
  const field = await client.campoPersonalizado.findFirst({ where: fieldWhere(organizationId), select: { JConfiguracion: true } });
  const palette = readDocumentPalette(field?.JConfiguracion);
  return palette && !sameDocumentPalette(palette, DEFAULT_DOCUMENT_PALETTE) ? palette : null;
}

export async function getFirmDocumentPalette(organizationId: number, client: Client = prisma): Promise<FirmDocumentPaletteDto> {
  const palette = await storedFirmPalette(organizationId, client);
  return { palette: palette ?? DEFAULT_DOCUMENT_PALETTE, customized: palette !== null };
}

/** Saves the firm's palette; null (or the document's own blue) goes back to the default. */
export async function saveFirmDocumentPalette(user: AuthUser, input: DocumentPalette | null): Promise<FirmDocumentPaletteDto> {
  const organizationId = user.organizationId;
  const palette = input && !sameDocumentPalette(input, DEFAULT_DOCUMENT_PALETTE) ? input : null;
  await prisma.$transaction(async (tx) => {
    const field = await tx.campoPersonalizado.findFirst({ where: fieldWhere(organizationId), select: { IdCampoPersonalizado: true } });
    if (!palette) {
      if (field) {
        await tx.campoPersonalizado.update({
          where: { IdCampoPersonalizado: field.IdCampoPersonalizado },
          data: { BActivo: false, DFechaEliminacion: new Date() },
        });
      }
      return;
    }
    const configuration = palette as unknown as Prisma.InputJsonObject;
    if (field) {
      await tx.campoPersonalizado.update({ where: { IdCampoPersonalizado: field.IdCampoPersonalizado }, data: { JConfiguracion: configuration } });
      return;
    }
    const dataType = await tx.tipoDato.findUniqueOrThrow({ where: { SClave: JSON_DATA_TYPE }, select: { IdTipoDato: true } });
    await tx.campoPersonalizado.create({
      data: {
        IdOrganizacion: organizationId,
        IdTipoDato: dataType.IdTipoDato,
        SClave: DOCUMENT_PALETTE_FIELD_KEY,
        SNombre: "Colores del dictamen",
        SDescripcion: "Color fuerte y color pastel con que nacen los avalúos y las plantillas del despacho (Despacho → Colores del dictamen).",
        SSeccionSugerida: "CARATULA",
        JConfiguracion: configuration,
      },
    });
  });
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId,
    userId: user.id,
    entity: "Organizacion",
    entityId: String(organizationId),
    action: palette ? "DOCUMENT_PALETTE_SAVE" : "DOCUMENT_PALETTE_RESET",
    result: "EXITOSO",
    metadata: palette ? { ...palette } : undefined,
  });
  return getFirmDocumentPalette(organizationId);
}

/**
 * A document that starts (a new valuation or a new template) takes the firm's
 * palette on its carátula section, unless it already carries one of its own
 * (a template that chose its colours keeps them).
 */
export function withFirmDocumentPalette<T extends { id?: string; palette?: unknown }>(sections: T[], palette: DocumentPalette | null): T[] {
  if (!palette) return sections;
  const cover = sections.find((section) => section.id !== undefined && getCanonicalSectionKey(section.id) === "CARATULA");
  if (!cover || readDocumentPalette(cover.palette)) return sections;
  return sections.map((section) => (section === cover ? { ...section, palette } : section));
}

/** The firm's palette on the carátula section of a version just created, as its first save would have left it. */
export async function applyFirmDocumentPalette(tx: Prisma.TransactionClient, versionId: number, organizationId: number) {
  const palette = await storedFirmPalette(organizationId, tx);
  if (!palette) return;
  const sections = await tx.seccionDocumento.findMany({
    where: { IdVersionAvaluo: versionId },
    select: { IdSeccionDocumento: true, SClave: true, JConfiguracion: true },
  });
  const cover = sections.find((section) => getCanonicalSectionKey(section.SClave) === "CARATULA");
  if (!cover) return;
  const config = cover.JConfiguracion && typeof cover.JConfiguracion === "object" && !Array.isArray(cover.JConfiguracion) ? cover.JConfiguracion : {};
  if (readDocumentPalette(config.palette)) return;
  await tx.seccionDocumento.update({
    where: { IdSeccionDocumento: cover.IdSeccionDocumento },
    data: { JConfiguracion: { ...config, palette } as Prisma.InputJsonObject },
  });
}
