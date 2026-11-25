import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";

/**
 * Suppressing a concluded valuation when its retention expires (Terms 14.3,
 * privacy notice 8.3, point 3; docs/CUENTAS.md, «Qué se suprime»). Removed:
 * every version with its sections, blocks, values, tables, calculations,
 * carátula and conclusion; its comparables with the advertiser's data (the
 * snapshot of the listing and, when no other valuation or the firm's base
 * uses them, the property and its listings with the contact); its subject
 * property; its searches, map captures, exports and reopenings; its custom
 * field values and labels; the notifications that link to it; and its files,
 * in storage and in the database, unless another valuation or the firm still
 * uses them. Kept: the valuation's row with its folio, dates, firm and who
 * made it (the credit ledger cites it and the operator must be able to say
 * who made a folio), its state history, the audit and the email log (both
 * append-only by law), and the credit movements.
 *
 * All in one transaction: a valuation either is suppressed entirely or stays
 * as it was (a reference the code does not know, such as a production rule
 * outside the migrations, makes the transaction fail and the valuation is
 * reported as blocked). Storage objects are deleted after the commit.
 */

export const SUPPRESSED_VALUATION_TITLE = "Avalúo suprimido al vencer su guarda";

export class SuppressionBlockedError extends Error {
  constructor(readonly reason: string) {
    super(`Valuation cannot be suppressed: ${reason}`);
    this.name = "SuppressionBlockedError";
  }
}

/** Storage keys of uploaded files as they appear in saved content: raw, or URL-encoded inside /api/archivos/imagen?key=. */
const STORAGE_KEY_PATTERN = /(?:uploads|organizaciones)(?:\/|%2F)[A-Za-z0-9._-]+(?:(?:\/|%2F)[A-Za-z0-9._-]+)*\.[A-Za-z0-9]{2,5}/gi;

export function storageKeysIn(text: string): string[] {
  const keys = new Set<string>();
  for (const match of text.matchAll(STORAGE_KEY_PATTERN)) {
    try {
      keys.add(decodeURIComponent(match[0]));
    } catch {
      keys.add(match[0]);
    }
  }
  return [...keys];
}

/** The text of everything a valuation saved, where its images are referenced by key. */
async function valuationContentText(tx: Prisma.TransactionClient, valuationId: number, versionIds: number[]) {
  if (!versionIds.length) return "";
  const rows = await tx.$queryRaw<{ t: string | null }[]>(Prisma.sql`
    SELECT string_agg(x.t, ' ') AS t FROM (
      SELECT row_to_json(v)::text AS t FROM "devpware_versiones_avaluos" v WHERE v."IdVersionAvaluo" = ANY(${versionIds})
      UNION ALL
      SELECT row_to_json(s)::text FROM "devpware_secciones_documentos" s WHERE s."IdVersionAvaluo" = ANY(${versionIds})
      UNION ALL
      SELECT n."JConfiguracion"::text FROM "devpware_nodos_documentos" n
        JOIN "devpware_secciones_documentos" s ON s."IdSeccionDocumento" = n."IdSeccionDocumento"
        WHERE s."IdVersionAvaluo" = ANY(${versionIds})
      UNION ALL
      SELECT row_to_json(val)::text FROM "devpware_valores_nodos_documentos" val WHERE val."IdVersionAvaluo" = ANY(${versionIds})
      UNION ALL
      SELECT row_to_json(c)::text FROM "devpware_celdas_tablas_documentos" c
        JOIN "devpware_filas_tablas_documentos" f ON f."IdFilaTablaDocumento" = c."IdFilaTablaDocumento"
        JOIN "devpware_tablas_documentos" tb ON tb."IdTablaDocumento" = f."IdTablaDocumento"
        JOIN "devpware_nodos_documentos" n ON n."IdNodoDocumento" = tb."IdNodoDocumento"
        JOIN "devpware_secciones_documentos" s ON s."IdSeccionDocumento" = n."IdSeccionDocumento"
        WHERE s."IdVersionAvaluo" = ANY(${versionIds})
      UNION ALL
      SELECT row_to_json(ca)::text FROM "devpware_comparables_avaluos" ca WHERE ca."IdAvaluo" = ${valuationId}
    ) x
  `);
  return rows[0]?.t ?? "";
}

/** Of these keys, the ones some other saved content still references (run after this valuation's rows are gone). */
async function keysStillReferenced(tx: Prisma.TransactionClient, organizationId: number, keys: string[]) {
  if (!keys.length) return new Set<string>();
  const variants = keys.flatMap((key) => [key, encodeURIComponent(key)]);
  // A file belongs to one firm: only that firm's valuations, comparables and templates (and the shared templates) can use it.
  const rows = await tx.$queryRaw<{ k: string }[]>(Prisma.sql`
    WITH
      firm_versions AS (
        SELECT v."IdVersionAvaluo" FROM "devpware_versiones_avaluos" v
        JOIN "devpware_avaluos" a ON a."IdAvaluo" = v."IdAvaluo"
        WHERE a."IdOrganizacion" = ${organizationId}
      ),
      firm_text AS (
        SELECT row_to_json(v)::text AS t FROM "devpware_versiones_avaluos" v WHERE v."IdVersionAvaluo" IN (SELECT * FROM firm_versions)
        UNION ALL
        SELECT n."JConfiguracion"::text FROM "devpware_nodos_documentos" n
          JOIN "devpware_secciones_documentos" s ON s."IdSeccionDocumento" = n."IdSeccionDocumento"
          WHERE s."IdVersionAvaluo" IN (SELECT * FROM firm_versions)
        UNION ALL
        SELECT coalesce(val."SValorTexto", '') || coalesce(val."JValorComplejo"::text, '') FROM "devpware_valores_nodos_documentos" val
          WHERE val."IdVersionAvaluo" IN (SELECT * FROM firm_versions)
        UNION ALL
        SELECT row_to_json(c)::text FROM "devpware_celdas_tablas_documentos" c
          JOIN "devpware_filas_tablas_documentos" f ON f."IdFilaTablaDocumento" = c."IdFilaTablaDocumento"
          JOIN "devpware_tablas_documentos" tb ON tb."IdTablaDocumento" = f."IdTablaDocumento"
          JOIN "devpware_nodos_documentos" n ON n."IdNodoDocumento" = tb."IdNodoDocumento"
          JOIN "devpware_secciones_documentos" s ON s."IdSeccionDocumento" = n."IdSeccionDocumento"
          WHERE s."IdVersionAvaluo" IN (SELECT * FROM firm_versions)
        UNION ALL
        SELECT coalesce(ca."JImagenesSnapshot"::text, '') || coalesce(ca."JPublicacionSnapshot"::text, '') FROM "devpware_comparables_avaluos" ca
          WHERE ca."IdOrganizacion" = ${organizationId} OR ca."IdVersionAvaluo" IN (SELECT * FROM firm_versions)
        UNION ALL
        SELECT row_to_json(np)::text FROM "devpware_nodos_plantillas" np
          JOIN "devpware_secciones_plantillas" sp ON sp."IdSeccionPlantilla" = np."IdSeccionPlantilla"
          JOIN "devpware_versiones_plantillas" vp ON vp."IdVersionPlantilla" = sp."IdVersionPlantilla"
          JOIN "devpware_plantillas_avaluos" p ON p."IdPlantillaAvaluo" = vp."IdPlantillaAvaluo"
          WHERE p."IdOrganizacion" = ${organizationId} OR p."IdOrganizacion" IS NULL
        UNION ALL
        SELECT row_to_json(o)::text FROM "devpware_organizaciones" o WHERE o."IdOrganizacion" = ${organizationId}
      )
    SELECT DISTINCT k FROM unnest(${variants}::text[]) AS k
    JOIN firm_text ON strpos(firm_text.t, k) > 0
  `);
  const referenced = new Set(rows.map((row) => row.k));
  return new Set(keys.filter((key) => referenced.has(key) || referenced.has(encodeURIComponent(key))));
}

export type SuppressionOutcome = {
  /** Storage objects to delete once the transaction committed. */
  storageKeys: string[];
  files: number;
  properties: number;
  comparables: number;
  versions: number;
};

/** Removes the content of one concluded valuation (see the module comment). Never touches the credit ledger. */
export async function suppressValuationContent(valuationId: number, now = new Date()): Promise<SuppressionOutcome> {
  return prisma.$transaction(
    async (tx) => {
      const valuation = await tx.avaluo.findUniqueOrThrow({
        where: { IdAvaluo: valuationId },
        select: {
          IdAvaluo: true,
          IdOrganizacion: true,
          UIdentificadorPublico: true,
          IdPropiedadSujeto: true,
          DFechaSupresion: true,
          DFechaEliminacion: true,
          DFechaEliminacionDefinitiva: true,
          organizacion: { select: { UIdentificadorPublico: true } },
        },
      });
      if (valuation.DFechaSupresion) return { storageKeys: [], files: 0, properties: 0, comparables: 0, versions: 0 };
      // Snapshots are immutable by a trigger (migration 017): a valuation with one cannot be suppressed here.
      if (await tx.snapshotVersionAvaluo.count({ where: { IdAvaluo: valuationId } })) throw new SuppressionBlockedError("snapshot");

      const versionIds = (await tx.versionAvaluo.findMany({ where: { IdAvaluo: valuationId }, select: { IdVersionAvaluo: true } })).map(
        (row) => row.IdVersionAvaluo,
      );
      const comparables = await tx.comparableAvaluo.findMany({
        where: { OR: [{ IdAvaluo: valuationId }, ...(versionIds.length ? [{ IdVersionAvaluo: { in: versionIds } }] : [])] },
        select: { UIdentificadorPublico: true, IdPropiedad: true },
      });
      const searchResults = await tx.resultadoBusquedaComparable.findMany({
        where: { busquedaComparable: { IdAvaluo: valuationId } },
        select: { IdPropiedad: true },
      });
      const propertyIds = new Set<number>([...comparables, ...searchResults].map((row) => row.IdPropiedad));
      if (valuation.IdPropiedadSujeto) propertyIds.add(valuation.IdPropiedadSujeto);

      // Files: the ones under the valuation's folder, the ones its content references by key, and the ones linked to it by id.
      const contentKeys = storageKeysIn(await valuationContentText(tx, valuationId, versionIds));
      const entityIds = [valuation.UIdentificadorPublico, ...comparables.map((row) => row.UIdentificadorPublico)];
      const [relations, captures, exports, conclusions] = await Promise.all([
        tx.relacionArchivo.findMany({ where: { SIdentificadorEntidad: { in: entityIds } }, select: { IdArchivo: true } }),
        tx.capturaMapa.findMany({ where: { IdAvaluo: valuationId }, select: { IdArchivo: true } }),
        tx.exportacionAvaluo.findMany({ where: { IdAvaluo: valuationId, IdArchivo: { not: null } }, select: { IdArchivo: true } }),
        versionIds.length
          ? tx.conclusionAvaluo.findMany({ where: { IdVersionAvaluo: { in: versionIds }, IdArchivoFirma: { not: null } }, select: { IdArchivoFirma: true } })
          : Promise.resolve([]),
      ]);
      const linkedIds = [
        ...relations.map((row) => row.IdArchivo),
        ...captures.map((row) => row.IdArchivo),
        ...exports.map((row) => row.IdArchivo as bigint),
        ...conclusions.map((row) => row.IdArchivoFirma as bigint),
      ];
      const folder = `organizaciones/${valuation.organizacion.UIdentificadorPublico}/avaluos/${valuation.UIdentificadorPublico}/`;
      const fileCandidates = await tx.archivo.findMany({
        where: {
          IdOrganizacion: valuation.IdOrganizacion,
          OR: [{ SClaveObjeto: { startsWith: folder } }, { SClaveObjeto: { in: contentKeys } }, { IdArchivo: { in: linkedIds } }],
        },
        select: { IdArchivo: true, SClaveObjeto: true, versionesArchivo: { select: { SClaveObjeto: true } } },
      });

      // The valuation's own rows. Those that restrict the deletion of a version go first.
      await tx.historialUsoComparable.deleteMany({ where: { IdAvaluo: valuationId } });
      await tx.reaperturaAvaluo.deleteMany({ where: { IdAvaluo: valuationId } });
      await tx.exportacionAvaluo.deleteMany({ where: { IdAvaluo: valuationId } });
      await tx.capturaMapa.deleteMany({ where: { IdAvaluo: valuationId } });
      await tx.busquedaComparable.deleteMany({ where: { IdAvaluo: valuationId } });
      const removedComparables = await tx.comparableAvaluo.deleteMany({
        where: { OR: [{ IdAvaluo: valuationId }, ...(versionIds.length ? [{ IdVersionAvaluo: { in: versionIds } }] : [])] },
      });
      await tx.valorCampoPersonalizado.deleteMany({ where: { IdAvaluo: valuationId } });
      await tx.etiquetaAvaluo.deleteMany({ where: { IdAvaluo: valuationId } });
      await tx.avaluo.update({
        where: { IdAvaluo: valuationId },
        data: {
          IdVersionTrabajo: null,
          IdVersionFinal: null,
          IdPropiedadSujeto: null,
          STitulo: SUPPRESSED_VALUATION_TITLE,
          SNombreCliente: null,
          BActivo: false,
          DFechaEliminacion: valuation.DFechaEliminacion ?? now,
          DFechaEliminacionDefinitiva: valuation.DFechaEliminacionDefinitiva ?? now,
          DFechaSupresion: now,
        },
      });
      const removedVersions = await tx.versionAvaluo.deleteMany({ where: { IdAvaluo: valuationId } });

      // Properties (with their listings, where the advertiser's contact lives) nobody else uses.
      let removedProperties = 0;
      const publicationImageFiles: bigint[] = [];
      for (const propertyId of propertyIds) {
        const [comparableUses, subjectUses, historyUses, resultUses] = await Promise.all([
          tx.comparableAvaluo.count({ where: { IdPropiedad: propertyId } }),
          tx.avaluo.count({ where: { IdPropiedadSujeto: propertyId } }),
          tx.historialUsoComparable.count({ where: { IdPropiedad: propertyId } }),
          tx.resultadoBusquedaComparable.count({ where: { IdPropiedad: propertyId } }),
        ]);
        if (comparableUses + subjectUses + historyUses + resultUses > 0) continue;
        const images = await tx.imagenPublicacion.findMany({
          where: { publicacionPropiedad: { IdPropiedad: propertyId }, IdArchivo: { not: null } },
          select: { IdArchivo: true },
        });
        publicationImageFiles.push(...images.map((row) => row.IdArchivo as bigint));
        await tx.historialUbicacionPropiedad.deleteMany({ where: { IdPropiedad: propertyId } });
        await tx.publicacionPropiedad.deleteMany({ where: { IdPropiedad: propertyId } });
        await tx.propiedad.delete({ where: { IdPropiedad: propertyId } });
        removedProperties += 1;
      }
      if (publicationImageFiles.length) {
        fileCandidates.push(
          ...(await tx.archivo.findMany({
            where: { IdArchivo: { in: publicationImageFiles } },
            select: { IdArchivo: true, SClaveObjeto: true, versionesArchivo: { select: { SClaveObjeto: true } } },
          })),
        );
      }

      // A file still referenced elsewhere (a duplicate that shares it, the firm's logo, a kept listing) stays.
      const byId = new Map(fileCandidates.map((file) => [file.IdArchivo, file]));
      const files = [...byId.values()];
      const stillReferenced = await keysStillReferenced(tx, valuation.IdOrganizacion, files.map((file) => file.SClaveObjeto));
      const ids = files.map((file) => file.IdArchivo);
      const [otherRelations, otherCaptures, otherImages, otherSignatures] = ids.length
        ? await Promise.all([
            tx.relacionArchivo.findMany({ where: { IdArchivo: { in: ids }, SIdentificadorEntidad: { notIn: entityIds } }, select: { IdArchivo: true } }),
            tx.capturaMapa.findMany({ where: { IdArchivo: { in: ids } }, select: { IdArchivo: true } }),
            tx.imagenPublicacion.findMany({ where: { IdArchivo: { in: ids } }, select: { IdArchivo: true } }),
            tx.conclusionAvaluo.findMany({ where: { IdArchivoFirma: { in: ids } }, select: { IdArchivoFirma: true } }),
          ])
        : [[], [], [], []];
      const sharedIds = new Set<bigint>([
        ...otherRelations.map((row) => row.IdArchivo),
        ...otherCaptures.map((row) => row.IdArchivo),
        ...otherImages.map((row) => row.IdArchivo as bigint),
        ...otherSignatures.map((row) => row.IdArchivoFirma as bigint),
      ]);
      const removable = files.filter((file) => !sharedIds.has(file.IdArchivo) && !stillReferenced.has(file.SClaveObjeto));
      const removableIds = removable.map((file) => file.IdArchivo);
      if (removableIds.length) {
        // A completed upload must point to its file (constraint of migration 011): its record goes with the file.
        await tx.cargaArchivo.deleteMany({ where: { IdArchivo: { in: removableIds } } });
        await tx.archivo.deleteMany({ where: { IdArchivo: { in: removableIds } } });
      }

      await tx.notificacion.deleteMany({ where: { SEnlace: { contains: valuation.UIdentificadorPublico } } });

      return {
        storageKeys: [...new Set(removable.flatMap((file) => [file.SClaveObjeto, ...file.versionesArchivo.map((version) => version.SClaveObjeto)]))],
        files: removable.length,
        properties: removedProperties,
        comparables: removedComparables.count,
        versions: removedVersions.count,
      };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}
