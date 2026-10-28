/**
 * The firm's base of comparables seen one at a time: the card of a
 * comparable (its evidence and the valuations it was used in), the review of
 * the comparables of a valuation, and the check for duplicates before one is
 * added. Every read is within the user's organization.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/infrastructure/database/prisma-client";
import { stableDownloadUrl } from "@/infrastructure/storage/stable-url";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";
import { asRecord, decimal, findValuation, firmComparableMonths, inFirmBase } from "./access";
import { addressFromRecord, formatAddress, formatComparableId, todayInMexico } from "./comparable-card";
import {
  DUPLICATE_REASON_LABELS, PRICE_TOLERANCE, addressKey, canonicalUrlKey, duplicateProbeOf, duplicateReasons, phoneKey, type DuplicateProbe,
  type DuplicateReason,
} from "./comparable-duplicates";
import { comparableWarnings, type ComparableWarning } from "./comparable-review";
import { comparableValidity, type ComparableValidity } from "./comparable-validity";
import { comparableInclude, toComparableDto } from "./market.service";
import { COMPARABLE_TYPES, type ComparableDto, type ComparableType } from "./market-types";
import { AREA, FIRM_BASE_FROM, firmBaseCondition, likePattern } from "../comparable-search/own-base-sql";

/** A valuation a comparable of the base was used in. */
export type ComparableUseDto = {
  valuationId: string;
  folio: string;
  title: string | null;
  /** Client of that valuation, as captured. */
  client: string | null;
  type: ComparableType;
  reference: number;
  /** Day it was added to that valuation, YYYY-MM-DD. */
  addedOn: string;
};

export type ComparableCardDto = {
  comparable: ComparableDto;
  type: ComparableType;
  /** The valuation it was captured in; null for a comparable kept in the firm's base without one. */
  valuation: { id: string; folio: string; title: string | null } | null;
  /** "Fecha de alta / actualización" and "Vigente hasta" of the comparable in the firm's base. */
  validity: ComparableValidity;
  warnings: ComparableWarning[];
  uses: ComparableUseDto[];
};

export type ReviewRowDto = { comparable: ComparableDto; type: ComparableType; warnings: ComparableWarning[] };

export type DuplicateMatchDto = {
  /** The comparable to reuse ("Usar el existente"): its most recent capture. */
  comparableId: string;
  folio: number | null;
  type: ComparableType;
  location: string;
  area: number | null;
  price: number | null;
  url: string | null;
  contactPhone: string | null;
  /** The valuation of that capture; null for one kept in the base without a valuation. */
  valuation: { id: string; folio: string } | null;
  /** It is already a comparable of the valuation being captured. */
  sameValuation: boolean;
  reasons: DuplicateReason[];
  thumbnailUrl: string | null;
  /** "Fecha de alta / actualización" of its data, YYYY-MM-DD: which of the two is the more recent. */
  updatedOn: string;
};

/** The subject's area of each market of a version, for the ±20 % rule of buildings. */
async function subjectAreas(versionId: number) {
  const markets = await prisma.enfoqueMercado.findMany({
    where: { IdVersionAvaluo: versionId },
    select: { NSuperficieSujeto: true, tipoComparable: { select: { SClave: true } } },
  });
  return new Map(markets.map((market) => [market.tipoComparable.SClave as ComparableType, decimal(market.NSuperficieSujeto)]));
}

const warningsOf = (
  comparable: ComparableDto, type: ComparableType, subjectArea: number | null, today: string, months: number, validity?: ComparableValidity,
) =>
  comparableWarnings({
    ...comparable,
    hasScreenshot: Boolean(comparable.screenshot),
    validity: validity ?? (comparable.updatedOn ? comparableValidity(comparable.updatedOn, today, comparable.validityMonths ?? months) : null),
  }, { type, subjectArea, today, offerMaxAgeMonths: comparable.validityMonths ?? months });

/** The card of a comparable of the firm's base, by the id of one of its captures. */
export async function getComparableCard(comparableId: string, organizationId: number): Promise<ComparableCardDto> {
  const row = await prisma.comparableAvaluo.findFirst({
    where: { UIdentificadorPublico: comparableId, ...inFirmBase(organizationId) },
    include: {
      ...comparableInclude,
      tipoComparable: { select: { SClave: true } },
      avaluo: { select: { UIdentificadorPublico: true, SFolio: true, STitulo: true, SNombreCliente: true } },
    },
  });
  if (!row) throw new ValuationWorkflowError("Comparable no encontrado", 404);
  const type = row.tipoComparable.SClave as ComparableType;
  const comparable = await toComparableDto(row, true);
  const folio = row.propiedad.IFolioComparable;
  // The same comparable of the base, in the version each valuation shows today.
  const captures = folio
    ? await prisma.comparableAvaluo.findMany({
      where: { propiedad: { IdOrganizacion: organizationId, IFolioComparable: folio }, ...inFirmBase(organizationId) },
      select: {
        IdVersionAvaluo: true, IReferencia: true, IOrden: true, DFechaSeleccion: true, DFechaActualizacionDatos: true,
        tipoComparable: { select: { SClave: true } },
        avaluo: { select: { UIdentificadorPublico: true, SFolio: true, STitulo: true, SNombreCliente: true, IdVersionTrabajo: true, IdVersionFinal: true } },
      },
      orderBy: { DFechaSeleccion: "desc" },
    })
    : [];
  // Captures in the base without a valuation count for its date, not as uses.
  const current = captures.filter((capture) => !capture.avaluo
    || capture.IdVersionAvaluo === (capture.avaluo.IdVersionTrabajo ?? capture.avaluo.IdVersionFinal));
  const uses = current.flatMap((capture): ComparableUseDto[] => (capture.avaluo ? [{
    valuationId: capture.avaluo.UIdentificadorPublico,
    folio: capture.avaluo.SFolio,
    title: capture.avaluo.STitulo,
    client: capture.avaluo.SNombreCliente,
    type: capture.tipoComparable.SClave as ComparableType,
    reference: capture.IReferencia ?? capture.IOrden + 1,
    addedOn: capture.DFechaSeleccion.toISOString().slice(0, 10),
  }] : []));
  // The comparable of the base is as recent as its latest capture or update, in any valuation.
  const dataUpdatedAt = current.reduce((latest, capture) => (capture.DFechaActualizacionDatos > latest ? capture.DFechaActualizacionDatos : latest),
    row.DFechaActualizacionDatos);
  const today = todayInMexico();
  const months = await firmComparableMonths(prisma, organizationId);
  const validity = comparableValidity(dataUpdatedAt, today, comparable.validityMonths ?? months);
  const areas = row.IdVersionAvaluo ? await subjectAreas(row.IdVersionAvaluo) : new Map<ComparableType, number | null>();
  const avaluo = row.avaluo;
  return {
    comparable,
    type,
    valuation: avaluo ? { id: avaluo.UIdentificadorPublico, folio: avaluo.SFolio, title: avaluo.STitulo } : null,
    validity,
    warnings: warningsOf(comparable, type, areas.get(type) ?? null, today, months, validity),
    uses: uses.length || !avaluo ? uses : [{
      valuationId: avaluo.UIdentificadorPublico, folio: avaluo.SFolio, title: avaluo.STitulo, client: avaluo.SNombreCliente, type,
      reference: comparable.reference, addedOn: row.DFechaSeleccion.toISOString().slice(0, 10),
    }],
  };
}

/** "Posible duplicado de C-00012 (avalúo VLO-1): mismo teléfono y superficie." */
function duplicateWarning(match: DuplicateMatchDto): ComparableWarning {
  const where = match.sameValuation ? "este avalúo" : match.valuation ? `avalúo ${match.valuation.folio}` : "base general";
  return {
    key: "DUPLICATE",
    message: `Posible duplicado de ${formatComparableId(match.folio) ?? "un comparable sin número"} (${where}): `
      + `${match.reasons.map((reason) => DUPLICATE_REASON_LABELS[reason]).join(", ")}.`,
  };
}

/**
 * "Revisión de comparables": every comparable of the version the editor
 * shows, across its markets, with its review and its warnings.
 */
export async function getValuationReview(publicId: string, organizationId: number): Promise<ReviewRowDto[]> {
  const avaluo = await findValuation(prisma, publicId, organizationId);
  const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
  if (!versionId) return [];
  const [rows, areas] = await Promise.all([
    prisma.comparableAvaluo.findMany({
      where: { IdVersionAvaluo: versionId, BIncluido: true },
      include: { ...comparableInclude, tipoComparable: { select: { SClave: true } } },
      orderBy: [{ IOrden: "asc" }, { IdComparableAvaluo: "asc" }],
    }),
    subjectAreas(versionId),
  ]);
  const today = todayInMexico();
  const months = await firmComparableMonths(prisma, organizationId);
  const reviewed = await Promise.all(rows.map(async (row) => {
    const type = row.tipoComparable.SClave as ComparableType;
    const comparable = await toComparableDto(row, true);
    // The same property already in the firm's base (this valuation included) is a warning too, as when it was captured.
    const duplicates = await findDuplicates(publicId, organizationId, duplicateProbeOf(comparable), {
      exclude: { comparableId: comparable.id, folio: comparable.folio ?? null }, thumbnails: false,
    });
    return {
      comparable,
      type,
      warnings: [...warningsOf(comparable, type, areas.get(type) ?? null, today, months), ...duplicates.slice(0, 3).map(duplicateWarning)],
    };
  }));
  return reviewed.sort((a, b) => COMPARABLE_TYPES.indexOf(a.type) - COMPARABLE_TYPES.indexOf(b.type) || a.comparable.reference - b.comparable.reference);
}

type CandidateRow = {
  id: string;
  organizationId: number;
  valuationId: string | null;
  valuationFolio: string | null;
  valuationInternalId: number | null;
  comparableFolio: number | null;
  type: string;
  area: Prisma.Decimal | null;
  price: Prisma.Decimal | null;
  publication: Prisma.JsonValue | null;
  address: Prisma.JsonValue;
  photos: Prisma.JsonValue | null;
  dataUpdatedAt: Date;
};

const MAX_CANDIDATES = 500;
const MAX_MATCHES = 10;
const textOf = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * The comparables of the firm's base that are the same property as the one
 * being captured: by its number, by portal and publication id, by listing
 * URL, by address, or by phone and price (±1 %). One match per comparable of
 * the base, its latest capture; those of the valuation itself come too,
 * marked. `publicId` is null for an import to the base without a valuation.
 */
export async function findDuplicates(
  publicId: string | null,
  organizationId: number,
  probe: DuplicateProbe,
  options: { exclude?: { comparableId: string; folio: number | null }; thumbnails?: boolean } = {},
): Promise<DuplicateMatchDto[]> {
  const avaluo = publicId ? await findValuation(prisma, publicId, organizationId) : null;
  const url = canonicalUrlKey(probe.url);
  const phone = phoneKey(probe.contactPhone);
  const address = addressKey(probe);
  const number = address?.street.split(" ").find((word) => /\d/.test(word));
  // A coarse filter in the database; duplicateReasons decides.
  const publicationId = probe.publicationId?.trim().toLowerCase();
  const hints = [
    ...(probe.folio ? [Prisma.sql`p."IFolioComparable" = ${probe.folio}`] : []),
    ...(publicationId ? [Prisma.sql`lower(c."JPublicacionSnapshot"->'details'->>'publicationId') = ${publicationId}`] : []),
    ...(url ? [Prisma.sql`lower(c."JPublicacionSnapshot"->>'url') LIKE ${likePattern(url)}`] : []),
    ...(phone ? [Prisma.sql`regexp_replace(COALESCE(c."JPublicacionSnapshot"->>'contactPhone', ''), '\\D', '', 'g') LIKE ${likePattern(phone)}`] : []),
    ...(number ? [Prisma.sql`concat_ws(' ', c."JDireccionSnapshot"->>'location', c."JDireccionSnapshot"->>'street', c."JDireccionSnapshot"->>'number') LIKE ${likePattern(number)}`] : []),
    // The same area (±1 %), for a match on the place or the phone with another price; duplicateReasons decides.
    ...(probe.area ? [Prisma.sql`${AREA} BETWEEN ${probe.area * (1 - PRICE_TOLERANCE)} AND ${probe.area * (1 + PRICE_TOLERANCE)}`] : []),
  ];
  if (!hints.length) return [];
  const rows = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
    SELECT
      c."UIdentificadorPublico"::text AS "id",
      COALESCE(a."IdOrganizacion", c."IdOrganizacion") AS "organizationId",
      a."UIdentificadorPublico"::text AS "valuationId",
      a."SFolio" AS "valuationFolio",
      a."IdAvaluo" AS "valuationInternalId",
      p."IFolioComparable" AS "comparableFolio",
      t."SClave" AS "type",
      COALESCE(c."NSuperficieTerrenoCapturada", c."NSuperficieConstruccionCapturada", c."NSuperficieRentableCapturada") AS "area",
      c."NPrecioCapturado" AS "price",
      c."JPublicacionSnapshot" AS "publication",
      c."JDireccionSnapshot" AS "address",
      c."JImagenesSnapshot" AS "photos",
      c."DFechaActualizacionDatos" AS "dataUpdatedAt"
    ${FIRM_BASE_FROM}
    WHERE ${firmBaseCondition(organizationId)}
      AND (${Prisma.join(hints, " OR ")})
    ORDER BY c."DFechaActualizacionDatos" DESC, c."DFechaSeleccion" DESC, c."IdComparableAvaluo" DESC
    LIMIT ${MAX_CANDIDATES}
  `);
  if (rows.some((row) => row.organizationId !== organizationId)) throw new Error("Duplicate check read a row of another organization.");

  const seen = new Set<string>();
  const matches: Array<Omit<DuplicateMatchDto, "thumbnailUrl"> & { photoKey: string | null }> = [];
  for (const row of rows) {
    const publication = asRecord(row.publication);
    const stored = asRecord(row.address);
    const candidate: DuplicateProbe = {
      url: textOf(publication.url),
      location: textOf(stored.location) ?? "",
      address: addressFromRecord(stored),
      contactPhone: textOf(publication.contactPhone),
      price: decimal(row.price),
      area: decimal(row.area),
      publicationId: textOf(asRecord((publication.details ?? null) as Prisma.JsonValue).publicationId),
      sourceName: textOf(publication.sourceName),
      folio: row.comparableFolio,
    };
    // A comparable is not a duplicate of itself, nor of the other captures of its number.
    if (options.exclude && (row.id === options.exclude.comparableId || (options.exclude.folio && row.comparableFolio === options.exclude.folio))) continue;
    const reasons = duplicateReasons(probe, candidate);
    if (!reasons.length) continue;
    // The same comparable of the base repeats across valuations: the latest capture stands for it.
    const identity = row.comparableFolio ? `f:${row.comparableFolio}` : `c:${row.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const firstPhoto = Array.isArray(row.photos) ? asRecord(row.photos[0] as Prisma.JsonValue) : {};
    matches.push({
      comparableId: row.id,
      folio: row.comparableFolio,
      type: row.type as ComparableType,
      location: candidate.location || formatAddress(candidate.address),
      area: decimal(row.area),
      price: candidate.price,
      url: candidate.url,
      contactPhone: candidate.contactPhone,
      valuation: row.valuationId && row.valuationFolio ? { id: row.valuationId, folio: row.valuationFolio } : null,
      sameValuation: Boolean(avaluo && row.valuationInternalId === avaluo.IdAvaluo),
      reasons,
      updatedOn: todayInMexico(row.dataUpdatedAt),
      photoKey: typeof firstPhoto.key === "string" && firstPhoto.key ? firstPhoto.key : null,
    });
    if (matches.length >= MAX_MATCHES) break;
  }
  return Promise.all(matches.map(async ({ photoKey, ...match }) => ({
    ...match,
    thumbnailUrl: photoKey && options.thumbnails !== false ? await stableDownloadUrl(photoKey).catch(() => null) : null,
  })));
}
