/**
 * The croquis stored before 25 nov 2026 were drawn over a Google Maps image,
 * which Google does not allow to keep (terms 3.2.3 a/b). This draws each one
 * again over our OpenStreetMap base (croquis-image.service.ts) from what the
 * valuation keeps: the subject's pin and croquis settings (highlighted
 * streets, free lines, north arrow, whether the comparables show) and the
 * image's own marker (its kind, frame and names placed by hand). The new
 * picture replaces the old one under the same storage key, so every copy of
 * the image in the document, its section and its block keep pointing to it
 * and nothing of the document changes.
 *
 * Only files the generator stored («uso» CROQUIS) are touched, never an
 * image the appraiser uploaded; the ones already drawn on OpenStreetMap are
 * skipped, so it can run again. Concluded valuations are left alone unless
 * asked: their dictamen was already delivered. The report is counts only.
 */
import { Prisma } from "@prisma/client";

import { keyFromStoredImageUrl } from "@/features/files/services/stored-image-url";
import { prisma } from "@/infrastructure/database/prisma-client";
import { storageProvider } from "@/infrastructure/storage/storage-provider";

import { includesComparables } from "../croquis";
import { readCroquisMarker, withLegacyCroquisMarker, type CroquisImageMarker } from "../croquis-marker";
import { frameCenter } from "../map-styles";
import { readSubjectCroquisSettings, readSubjectLocation } from "../subject-location";
import { CROQUIS_FILE_METADATA, renderCroquisImage, type CroquisRenderInput } from "./croquis-image.service";
import { valuationPins } from "./subject-location.service";

export interface CroquisRegenerationOptions {
  /** Without it nothing is drawn or written: the counts of what would be. */
  apply: boolean;
  /** Concluded valuations too (their delivered dictamen showed the old picture). */
  includeConcluded?: boolean;
  organizationId?: number | null;
  /** The renderer; the tests replace it. */
  render?: (input: CroquisRenderInput) => Promise<Buffer>;
}

export interface CroquisRegenerationReport {
  valuations: number;
  /** Croquis images found in the documents (one per stored file). */
  croquis: number;
  /** Drawn again over OpenStreetMap (or that would be, in a dry run). */
  regenerated: number;
  alreadyOpenStreetMap: number;
  /** Left alone because their valuation is concluded. */
  concluded: number;
  /** The valuation lost its pin: there is nothing to draw around. */
  withoutLocation: number;
  /** Images with a croquis marker whose file the generator did not store (uploaded by hand, or missing). */
  notGenerated: number;
  failed: number;
  /** PDFs of the dictamen stored for the versions with old croquis: they keep the Google image until someone decides about them. */
  storedPdfs: number;
}

interface FoundImage {
  src: string;
  marker: CroquisImageMarker;
}

/** Every image of a document's JSON that is a croquis (by its marker or its old fixed id), wherever it sits. */
export function croquisImagesIn(value: unknown, found: FoundImage[] = []): FoundImage[] {
  if (Array.isArray(value)) {
    for (const item of value) croquisImagesIn(item, found);
    return found;
  }
  if (typeof value !== "object" || value === null) return found;
  const record = value as Record<string, unknown>;
  if (typeof record.src === "string" && typeof record.id === "string") {
    const marker = withLegacyCroquisMarker({ id: record.id, croquis: readCroquisMarker(record.croquis) }).croquis;
    if (marker) found.push({ src: record.src, marker });
  }
  for (const child of Object.values(record)) if (typeof child === "object" && child !== null) croquisImagesIn(child, found);
  return found;
}

/** The storage key behind an image's address: the stable route (S3) or the local path. */
export function storageKeyOf(src: string) {
  const fromRoute = keyFromStoredImageUrl(src);
  if (fromRoute) return fromRoute;
  return /^\/uploads\//.test(src) ? src.slice(1) : null;
}

const asRecord = (value: unknown) => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

const BATCH = 50;

export async function regenerateCroquis(options: CroquisRegenerationOptions): Promise<CroquisRegenerationReport> {
  const render = options.render ?? (async (input: CroquisRenderInput) => (await renderCroquisImage(input)).jpeg);
  const report: CroquisRegenerationReport = { valuations: 0, croquis: 0, regenerated: 0, alreadyOpenStreetMap: 0, concluded: 0, withoutLocation: 0, notGenerated: 0, failed: 0, storedPdfs: 0 };
  const oldVersions = new Set<number>();
  let cursor = 0;
  for (;;) {
    const valuations = await prisma.avaluo.findMany({
      where: { IdAvaluo: { gt: cursor }, DFechaEliminacionDefinitiva: null, ...(options.organizationId ? { IdOrganizacion: options.organizationId } : {}) },
      select: {
        IdAvaluo: true,
        IdOrganizacion: true,
        BBloqueado: true,
        IdVersionTrabajo: true,
        IdVersionFinal: true,
        propiedadSujeto: { select: { JCaracteristicas: true, direccionesPropiedad: { where: { BEsDireccionActual: true }, select: { SDireccionCompleta: true }, take: 1 } } },
      },
      orderBy: { IdAvaluo: "asc" },
      take: BATCH,
    });
    if (!valuations.length) break;
    cursor = valuations[valuations.length - 1].IdAvaluo;
    for (const valuation of valuations) {
      const versions = [...new Set([valuation.IdVersionTrabajo, valuation.IdVersionFinal].filter((id): id is number => id !== null))];
      if (!versions.length) continue;
      const sections = await prisma.seccionDocumento.findMany({ where: { IdVersionAvaluo: { in: versions } }, select: { JConfiguracion: true } });
      const byKey = new Map<string, CroquisImageMarker>();
      for (const image of croquisImagesIn(sections.map((section) => section.JConfiguracion))) {
        const key = storageKeyOf(image.src);
        if (key && !byKey.has(key)) byKey.set(key, image.marker);
      }
      if (!byKey.size) continue;
      report.valuations += 1;
      const characteristics = valuation.propiedadSujeto?.JCaracteristicas ?? null;
      const location = readSubjectLocation(characteristics);
      const settings = readSubjectCroquisSettings(characteristics);
      let pins: Awaited<ReturnType<typeof valuationPins>> | null = null;
      for (const [key, marker] of byKey) {
        report.croquis += 1;
        const file = await prisma.archivo.findFirst({ where: { SClaveObjeto: key, IdOrganizacion: valuation.IdOrganizacion }, select: { IdArchivo: true, JMetadatos: true, SNombreOriginal: true } });
        const metadata = asRecord(file?.JMetadatos);
        if (!file || metadata.uso !== CROQUIS_FILE_METADATA.uso) {
          report.notGenerated += 1;
          continue;
        }
        if (metadata.base === CROQUIS_FILE_METADATA.base) {
          report.alreadyOpenStreetMap += 1;
          continue;
        }
        versions.forEach((id) => oldVersions.add(id));
        if (valuation.BBloqueado && !options.includeConcluded) {
          report.concluded += 1;
          continue;
        }
        if (!location) {
          report.withoutLocation += 1;
          continue;
        }
        if (!options.apply) {
          report.regenerated += 1;
          continue;
        }
        try {
          const frame = marker.frame ?? settings[marker.kind];
          pins ??= settings.comparablesOnMap || settings.includeComparables ? await valuationPins(valuation.IdVersionTrabajo ?? valuation.IdVersionFinal) : [];
          const jpeg = await render({
            kind: marker.kind,
            center: frameCenter(frame, location.point),
            zoom: frame.zoom,
            subject: location.point,
            northArrow: settings.northArrow,
            pins: includesComparables(marker.kind, settings) ? pins : [],
            streets: settings.streets,
            labels: marker.labels ?? settings.labels[marker.kind] ?? [],
            lines: settings.lines,
            address: valuation.propiedadSujeto?.direccionesPropiedad[0]?.SDireccionCompleta ?? "",
          });
          const stored = await storageProvider.createUpload({ buffer: jpeg, filename: file.SNombreOriginal, mimeType: "image/jpeg", key, generateDownloadUrl: false });
          await prisma.archivo.update({
            where: { IdArchivo: file.IdArchivo },
            data: {
              ITamanoBytes: BigInt(stored.size),
              SChecksum: stored.checksum,
              STipoMime: "image/jpeg",
              JMetadatos: { ...metadata, base: CROQUIS_FILE_METADATA.base, regenerado: new Date().toISOString() } as Prisma.InputJsonObject,
            },
          });
          report.regenerated += 1;
        } catch (error) {
          report.failed += 1;
          // The cause only, never the valuation's data.
          console.error(`[CROQUIS] regeneration failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }
  if (oldVersions.size) {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS "count" FROM "devpware_archivos"
      WHERE "JMetadatos"->>'uso' = 'AVALUO_DICTAMEN_PDF' AND ("JMetadatos"->>'versionId') ~ '^[0-9]+$'
        AND ("JMetadatos"->>'versionId')::int = ANY(${[...oldVersions]}::int[])
    `;
    report.storedPdfs = Number(rows[0]?.count ?? 0);
  }
  return report;
}
