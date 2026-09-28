/**
 * The dictamen as a PDF generated on the server: Chromium prints the same
 * /avaluos/<id>/dictamen page the browser prints, with the user's session.
 * Each PDF is kept as a file of the valuation (draft while it is open, final
 * once concluded) and recorded as an export.
 */
import { createHash, randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { renderPageToPdf } from "@/infrastructure/pdf/chromium-pdf";
import { buildValuationExportKey } from "@/infrastructure/storage/storage-keys";
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import { AUTH_SESSION_COOKIE } from "@/features/auth/constants/auth.constants";
import { ValuationWorkflowError } from "./valuation-workflow/errors";

const PDF_ENTITY = "AVALUO_DICTAMEN_PDF";

/** Safe file name for the download: Dictamen-VDA-0001.pdf. */
export const dictamenPdfFilename = (folio: string) =>
  `Dictamen-${folio.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "avaluo"}.pdf`;

export type DictamenPdfOptions = {
  /** How the export is recorded: DICTAMEN for a download, DICTAMEN_CORREO when emailed. */
  exportType?: string;
  parameters?: Prisma.InputJsonValue;
};

export async function generateDictamenPdf(
  user: AuthUser,
  valuationPublicId: string,
  sessionToken: string,
  options: DictamenPdfOptions = {},
) {
  const valuation = await prisma.avaluo.findFirst({
    where: { UIdentificadorPublico: valuationPublicId, IdOrganizacion: user.organizationId, BActivo: true, DFechaEliminacion: null },
    select: {
      IdAvaluo: true,
      SFolio: true,
      BBloqueado: true,
      IdVersionTrabajo: true,
      IdVersionFinal: true,
      organizacion: { select: { UIdentificadorPublico: true } },
    },
  });
  if (!valuation) throw new ValuationWorkflowError("Avalúo no encontrado", 404);
  const versionId = (valuation.BBloqueado ? valuation.IdVersionFinal : valuation.IdVersionTrabajo) ?? valuation.IdVersionFinal ?? valuation.IdVersionTrabajo;
  if (!versionId) throw new ValuationWorkflowError("El avalúo todavía no tiene contenido para imprimir.", 409);

  const requestedAt = new Date();
  const buffer = await renderPageToPdf({
    path: `/avaluos/${valuationPublicId}/dictamen`,
    cookies: [{ name: AUTH_SESSION_COOKIE, value: sessionToken }],
    settleSelector: "main[data-print-document] article",
  });

  const filePublicId = randomUUID();
  const filename = dictamenPdfFilename(valuation.SFolio);
  const stored = await storageProvider.createUpload({
    buffer,
    filename,
    mimeType: "application/pdf",
    key: buildValuationExportKey(valuation.organizacion.UIdentificadorPublico, valuationPublicId, "pdf", filePublicId),
    generateDownloadUrl: false,
  });

  try {
    await prisma.$transaction(async (tx) => {
      const [fileType, relationType] = await Promise.all([
        tx.tipoArchivo.findFirstOrThrow({ where: { SClave: valuation.BBloqueado ? "PDF_FINAL" : "PDF_BORRADOR", BActivo: true } }),
        tx.tipoRelacionArchivo.findFirstOrThrow({ where: { SClave: "AVALUO", BActivo: true } }),
      ]);
      const archivo = await tx.archivo.create({
        data: {
          UIdentificadorPublico: filePublicId,
          IdOrganizacion: user.organizationId,
          IdUsuarioCarga: user.id,
          IdTipoArchivo: fileType.IdTipoArchivo,
          SBucket: stored.bucket,
          SClaveObjeto: stored.key,
          SNombreOriginal: filename,
          SNombreAlmacenado: stored.filename,
          STipoMime: "application/pdf",
          SExtension: ".pdf",
          ITamanoBytes: BigInt(buffer.length),
          SChecksum: stored.checksum,
          BPrivado: true,
          JMetadatos: { uso: PDF_ENTITY, versionId },
        },
      });
      await tx.relacionArchivo.create({
        data: {
          IdArchivo: archivo.IdArchivo,
          IdTipoRelacionArchivo: relationType.IdTipoRelacionArchivo,
          SEntidad: PDF_ENTITY,
          SIdentificadorEntidad: valuationPublicId,
          BPrincipal: false,
          IOrden: 0,
        },
      });
      await tx.exportacionAvaluo.create({
        data: {
          IdAvaluo: valuation.IdAvaluo,
          IdVersionAvaluo: versionId,
          IdUsuario: user.id,
          IdArchivo: archivo.IdArchivo,
          STipoExportacion: options.exportType ?? "DICTAMEN",
          JParametros: options.parameters,
          SFormato: "PDF",
          SEstado: "COMPLETADA",
          SHashContenido: createHash("sha256").update(buffer).digest("hex"),
          DFechaSolicitud: requestedAt,
          DFechaInicio: requestedAt,
          DFechaFinalizacion: new Date(),
        },
      });
    });
  } catch (error) {
    await storageProvider.deleteObject(stored.key).catch((cleanup) => console.error("[DICTAMEN_PDF_CLEANUP]", cleanup));
    throw error;
  }

  return { buffer, filename, folio: valuation.SFolio, final: valuation.BBloqueado };
}
