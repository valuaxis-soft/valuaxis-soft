/**
 * Comparables and market approach of a valuation version: capture, photos,
 * settings, and the stored result with its trace. Reads and writes the version
 * the editor shows (working version, or the final one once concluded).
 */
import { randomUUID } from "node:crypto";
import { machineryDetailsOf, type ComparableMachineryDetails } from "./comparable-machinery";
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { saveUpload } from "@/features/files/services/upload";
import { prisma } from "@/infrastructure/database/prisma-client";
import { stableDownloadUrl } from "@/infrastructure/storage/stable-url";
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import { buildComparableAssetKey } from "@/infrastructure/storage/storage-keys";
import { ENGINE_VERSION } from "../engine/config";
import { computeMarketApproach } from "../engine/market";
import { Trace } from "../engine/trace";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";
import { readStoredImageFraming, type ImageFraming } from "../services/image-framing";
import {
  asRecord, catalogId, decimal, findValuation, firmComparableMonths, formulasOrThrow, inFirmBase, versionPrecision, writableVersion, type Tx,
} from "./access";
import { propertyTypeKeyOf } from "./comparable-master";
import { withOfferInPesos } from "./comparable-currency";
import { kindOfComparable, propertyTypeKeyOfKind, withKindDetails } from "./comparable-kinds";
import { COMPARABLE_CLASS_LABELS, comparableClassOf } from "./comparable-classes";
import { storedFormulas, type CapturedFormulas } from "./captured-formulas";
import { matchOption, optionJustification, optionsFor, resolveFactorCatalog } from "./factor-catalog";
import { recomputeCosts } from "./cost.service";
import { recomputeConclusion } from "./conclusion.service";
import { recomputeIncome } from "./income.service";
import { withProvenance } from "../comparable-search/normalize";
import {
  addressFromRecord,
  coordinatesError,
  todayInMexico,
  type ComparableAddress,
  type ComparableListingDetails,
  type ComparablePropertyDetails,
  type OperationType,
  type UrbanProximity,
} from "./comparable-card";
import { addMonths, comparableDataChanged } from "./comparable-validity";
import { PENDING_REVIEW, isBuiltInStatus, reviewStatusOf, type ComparableReviewDto } from "./comparable-review";
import { checklistFor, labelsForReview, reviewStatusKeySchema } from "./comparable-review-checklist";
import { FIRM_BASE_FROM, firmBaseCondition } from "../comparable-search/own-base-sql";
import { approximateQueryOf, forgetApproximate, pinOf, shareComparablePin } from "../comparable-base/comparable-location.service";
import { getComparableReviewSettings } from "@/features/firm/comparable-review-settings.service";
import type { ComparableBulkReviewPayload, ComparableInputPayload, ComparableReviewPayload, MarketSettingsPayload } from "./market-schemas";
import {
  COMPARABLE_TYPES,
  CUSTOM_FACTOR_KEY,
  OFFER_LEVELS,
  cleanAttributes,
  comparableFormValues,
  comparableFormulaValues,
  defaultMarketSettings,
  factorCountAllowed,
  factorKey,
  FACTOR_LIMIT_MESSAGE,
  homologationBasisOf,
  isLandComparableType,
  isRentComparableType,
  MAX_COMPARABLE_PHOTOS,
  marketEngineConfig,
  offerMarkOf,
  toMarketEngineInput,
  type ComparableAttribute,
  type ComparableDto,
  type ComparableType,
  type FactorSlotConfig,
  type FactorType,
  type MarketCalculationDto,
  type MarketSettingsDto,
} from "./market-types";


const MAX_PHOTOS_PER_COMPARABLE = MAX_COMPARABLE_PHOTOS;
const COMPARABLE_ENTITY = "ComparableAvaluo";

/** A stored photo; `framing` is its place and zoom in its frame of the dictamen (absent: whole and centered). */
type PhotoSnapshot = { id: string; key: string; title: string; framing?: unknown; main?: boolean };
/** A stored photo of a comparable, as another comparable may take it. */
export type StoredComparablePhoto = Omit<PhotoSnapshot, "id" | "framing">;
type PropertySnapshot = {
  /** Formulas typed in the comparable's numeric fields and factors, by path. */
  formulas?: CapturedFormulas;
  landUse: string | null;
  landUseKey: string | null;
  shape: string | null;
  zone: string | null;
  frontCount: number | null;
  frontage: number | null;
  depth: number | null;
  topography: string | null;
  services: string | null;
  conservation: string | null;
  quality: string | null;
  notes: string | null;
  extra?: Record<string, string>;
  characteristicsText?: string | null;
  attributes?: ComparableAttribute[];
  factorJustification?: string | null;
  regressionExcluded?: boolean;
  urbanProximity?: UrbanProximity | null;
  operationType?: OperationType | null;
  landArea?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  constructionType?: string | null;
  /** The master workbook's property facts. */
  details?: ComparablePropertyDetails | null;
  /** The machine's data of a machinery comparable (comparable-machinery.ts). */
  machinery?: ComparableMachineryDetails | null;
  /**
   * The firm's own factors of the comparable («custom:fondo»), each with its
   * key. They are all of type OTRO and devpware_factores_homologacion keeps one
   * factor per type and comparable (its unique key, which is not altered), so
   * a comparable with two of them could not be saved (FAL-04, 23 Nov 2026).
   * Absent in comparables saved before: their own factor is still a row there.
   */
  ownFactors?: StoredOwnFactor[];
};
type StoredOwnFactor = {
  key: string;
  value: number | null;
  subjectRating: number | null;
  comparableRating: number | null;
  justification: string | null;
};
/** JDireccionSnapshot: the line the dictamen prints and, when captured, its parts. */
type AddressSnapshot = { location: string } & ComparableAddress;
/** JUbicacionSnapshot: decimal degrees, null until captured. */
type LocationSnapshot = { latitude: number | null; longitude: number | null };
/** JRevision: the review of the comparable in this valuation, with who made it. */
export type ReviewSnapshot = ComparableReviewDto & { reviewedById: number | null };
/** What JConfiguracion keeps of the settings; the rest has its own columns. */
type StoredConfiguration = Partial<Pick<MarketSettingsDto,
  | "factorSlots" | "adoptedUnitValue" | "rounding" | "offerLevel" | "offerLabels" | "offerMark" | "offerIntro" | "homologationBasis"
  | "typicalFrontage" | "typicalDepth" | "characteristicFields" | "subjectCharacteristics" | "showFactorJustification"
  | "regression" | "showHomologationTable" | "showHomologationNote" | "homologationNote" | "homologate" | "additionalAmountInCalculation"
  | "showAdditionalAmount" | "printedStatistics" | "fieldLabels" | "linkedColumns">> & {
  /**
   * The lote tipo captured, kept while the homologation is against the
   * subject: NSuperficieBase holds it only against the lote tipo, so the cost
   * approach, which reads that column, homologates its land the same way.
   */
  loteTipo?: number | null;
  /** Formulas typed in the numeric fields of the settings, by path. */
  formulas?: CapturedFormulas;
};
type PublicationSnapshot = {
  sourceName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  url: string | null;
  offerDate: string | null;
  consultedOn?: string | null;
  validUntil?: string | null;
  /** "Vigencia" captured in months (1 to 12), from the day of consultation. */
  validityMonths?: number | null;
  listingText?: string | null;
  /** "Pantalla de referencia": a stored image apart from the photos. */
  screenshot?: PhotoSnapshot | null;
  /** The master workbook's listing facts (id in the portal, currency, verification). */
  details?: ComparableListingDetails | null;
};

/**
 * What a comparable brought from the firm's base keeps of it: its images, its
 * number and the date of its data (its validity is not renewed by using it).
 */
export type ReusedComparableEvidence = {
  photos?: StoredComparablePhoto[];
  screenshot?: StoredComparablePhoto | null;
  folio?: number | null;
  dataUpdatedAt?: Date | null;
};


export async function comparableTypeId(tx: Tx, type: ComparableType) {
  const row = await tx.tipoComparable.findUnique({ where: { SClave: type }, select: { IdTipoComparable: true } });
  if (!row) throw new ValuationWorkflowError(`Falta el tipo de comparable ${type} en el catálogo.`, 500);
  return row.IdTipoComparable;
}

/* ------------------------------------------------------------------ */
/*  Reading                                                            */
/* ------------------------------------------------------------------ */

export const comparableInclude = {
  factoresHomologacion: { include: { tipoFactorHomologacion: { select: { SClave: true } } }, orderBy: { IOrden: "asc" } },
  propiedad: true,
} satisfies Prisma.ComparableAvaluoInclude;

export type ComparableRow = Prisma.ComparableAvaluoGetPayload<{ include: typeof comparableInclude }>;

const stringOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);
const numberOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const addressOf = (snapshot: Partial<AddressSnapshot>): ComparableAddress | null => addressFromRecord(snapshot);

/** The stored review, or "por revisar" when there is none. */
function reviewOf(stored: Prisma.JsonValue | null): ComparableReviewDto {
  const review = asRecord(stored) as Partial<ReviewSnapshot>;
  // A built-in state or one of the firm's («custom-…»): a state the firm deleted keeps reading with its saved name.
  if (!review.status || !(isBuiltInStatus(review.status) || reviewStatusKeySchema.safeParse(review.status).success)) return PENDING_REVIEW;
  return {
    status: review.status,
    ...(typeof review.statusLabel === "string" && review.statusLabel ? { statusLabel: review.statusLabel } : {}),
    ...(typeof review.statusTone === "string" && review.statusTone ? { statusTone: review.statusTone } : {}),
    checks: review.checks ?? {},
    ...(review.labels && typeof review.labels === "object" ? { labels: review.labels } : {}),
    notes: review.notes ?? null,
    reviewedBy: review.reviewedBy ?? null,
    reviewedAt: review.reviewedAt ?? null,
  };
}

/** Stored details without their empty fields; null when none is captured. */
function detailsOf<T extends object>(stored: T | null | undefined): T | null {
  const kept = Object.entries(asRecord((stored ?? null) as Prisma.JsonValue)).filter(([, value]) => value !== null && value !== undefined && value !== "");
  return kept.length ? (Object.fromEntries(kept) as T) : null;
}

const imageUrl = (key: string, withUrls: boolean) => (withUrls ? stableDownloadUrl(key).catch(() => "") : Promise.resolve(""));

/** The screenshot of a stored comparable, when it has one. */
export function storedScreenshot(publicationSnapshot: Prisma.JsonValue | null): PhotoSnapshot | null {
  const screenshot = (asRecord(publicationSnapshot) as Partial<PublicationSnapshot>).screenshot;
  return screenshot?.key ? screenshot : null;
}

export async function toComparableDto(row: ComparableRow, withPhotoUrls: boolean): Promise<ComparableDto> {
  const property = asRecord(row.JPropiedadSnapshot) as Partial<PropertySnapshot>;
  const publication = asRecord(row.JPublicacionSnapshot) as Partial<PublicationSnapshot>;
  const address = asRecord(row.JDireccionSnapshot) as Partial<AddressSnapshot>;
  const coordinates = asRecord(row.JUbicacionSnapshot) as Partial<LocationSnapshot>;
  const photos = Array.isArray(row.JImagenesSnapshot) ? (row.JImagenesSnapshot as PhotoSnapshot[]) : [];
  const screenshot = storedScreenshot(row.JPublicacionSnapshot);
  return {
    id: row.UIdentificadorPublico,
    reference: row.IReferencia ?? row.IOrden + 1,
    location: address.location ?? row.propiedad.SNombre ?? "",
    area: decimal(row.NSuperficieTerrenoCapturada ?? row.NSuperficieConstruccionCapturada ?? row.NSuperficieRentableCapturada),
    price: decimal(row.NPrecioCapturado),
    landUse: property.landUse ?? null,
    landUseKey: property.landUseKey ?? null,
    shape: property.shape ?? null,
    zone: property.zone ?? null,
    frontCount: property.frontCount ?? null,
    frontage: property.frontage ?? null,
    depth: property.depth ?? null,
    topography: property.topography ?? null,
    services: property.services ?? null,
    conservation: property.conservation ?? null,
    quality: property.quality ?? null,
    notes: property.notes ?? null,
    extra: property.extra ?? {},
    characteristicsText: property.characteristicsText ?? null,
    attributes: cleanAttributes(property.attributes),
    factorJustification: property.factorJustification ?? null,
    ...(property.regressionExcluded ? { regressionExcluded: true } : {}),
    formulas: storedFormulas(property.formulas),
    sourceName: publication.sourceName ?? null,
    contactName: publication.contactName ?? null,
    contactPhone: publication.contactPhone ?? null,
    url: publication.url ?? null,
    offerDate: publication.offerDate ?? null,
    consultedOn: publication.consultedOn ?? null,
    validUntil: publication.validUntil ?? null,
    validityMonths: publication.validityMonths ?? null,
    listingText: publication.listingText ?? null,
    address: addressOf(address),
    urbanProximity: property.urbanProximity ?? null,
    operationType: property.operationType ?? null,
    latitude: numberOrNull(coordinates.latitude),
    longitude: numberOrNull(coordinates.longitude),
    landArea: numberOrNull(property.landArea),
    bedrooms: numberOrNull(property.bedrooms),
    bathrooms: numberOrNull(property.bathrooms),
    constructionType: stringOrNull(property.constructionType),
    propertyDetails: detailsOf(property.details),
    listingDetails: detailsOf(publication.details),
    machinery: machineryDetailsOf(property.machinery),
    updatedOn: todayInMexico(row.DFechaActualizacionDatos),
    photos: await Promise.all(photos.map(async (photo) => {
      const framing = readStoredImageFraming(photo.framing);
      return {
        id: photo.id,
        title: photo.title,
        url: await imageUrl(photo.key, withPhotoUrls),
        ...(framing ? { framing } : {}),
        ...(photo.main === true ? { main: true } : {}),
      };
    })),
    folio: row.propiedad.IFolioComparable ?? null,
    screenshot: screenshot ? { id: screenshot.id, title: screenshot.title, url: await imageUrl(screenshot.key, withPhotoUrls) } : null,
    review: reviewOf(row.JRevision),
    factors: comparableFactors(row, property),
  };
}

/** The firm's own factors kept in the property snapshot, the well-formed ones. */
function storedOwnFactors(property: Partial<PropertySnapshot>): StoredOwnFactor[] | null {
  if (!Array.isArray(property.ownFactors)) return null;
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return property.ownFactors.flatMap((item) => {
    const record = asRecord(item);
    return typeof record.key === "string" && CUSTOM_FACTOR_KEY.test(record.key)
      ? [{
          key: record.key,
          value: number(record.value),
          subjectRating: number(record.subjectRating),
          comparableRating: number(record.comparableRating),
          justification: typeof record.justification === "string" ? record.justification : null,
        }]
      : [];
  });
}

/**
 * The factors of a comparable: its rows in devpware_factores_homologacion and
 * the firm's own factors of its snapshot. A comparable saved before keeps its
 * own factor as a row, named by its key, until it is saved again.
 */
function comparableFactors(row: Pick<ComparableRow, "factoresHomologacion">, property: Partial<PropertySnapshot>): ComparableDto["factors"] {
  const own = storedOwnFactors(property);
  const rows = row.factoresHomologacion
    // Once the snapshot holds the firm's own factors, a row of before is not one of them any more.
    .filter((factor) => !(own && CUSTOM_FACTOR_KEY.test(factor.SNombre)))
    .map((factor) => ({
      type: factor.tipoFactorHomologacion.SClave as FactorType,
      // A factor the firm created keeps its key in the name; the others are named by their type.
      ...(CUSTOM_FACTOR_KEY.test(factor.SNombre) ? { key: factor.SNombre } : {}),
      value: decimal(factor.NValor),
      subjectRating: decimal(factor.NCalificacionSujeto),
      comparableRating: decimal(factor.NCalificacionComparable),
      justification: factor.SJustificacion,
    }));
  return [...rows, ...(own ?? []).map((factor) => ({ type: "OTRO" as const, ...factor }))];
}

/** The firm's own factors of a payload as the snapshot keeps them, with the value they count as. */
function ownFactorsOf(payload: ComparableInputPayload): StoredOwnFactor[] {
  return payload.factors.filter((factor) => factor.key).map((factor) => ({
    key: factor.key!,
    value: factorValueOf(factor),
    subjectRating: factor.subjectRating,
    comparableRating: factor.comparableRating,
    justification: factor.justification,
  }));
}

/** What a captured factor is worth: the ratio of its ratings, or the value typed (1 when none). */
const factorValueOf = (factor: ComparableInputPayload["factors"][number]) =>
  factor.subjectRating && factor.comparableRating ? factor.subjectRating / factor.comparableRating : factor.value ?? 1;

async function loadCalculation(tx: Tx, versionId: number, type: ComparableType, withPhotoUrls: boolean) {
  const typeId = await comparableTypeId(tx, type);
  const [approach, rows, precision] = await Promise.all([
    tx.enfoqueMercado.findUnique({ where: { IdVersionAvaluo_IdTipoComparable: { IdVersionAvaluo: versionId, IdTipoComparable: typeId } } }),
    tx.comparableAvaluo.findMany({
      where: { IdVersionAvaluo: versionId, IdTipoComparable: typeId, BIncluido: true },
      include: comparableInclude,
      orderBy: [{ IOrden: "asc" }, { IdComparableAvaluo: "asc" }],
    }),
    versionPrecision(tx, versionId),
  ]);
  const defaults = defaultMarketSettings(type);
  const configuration = asRecord(approach?.JConfiguracion ?? null) as StoredConfiguration;
  const settings: MarketSettingsDto = approach
    ? {
        comparableType: type,
        subjectArea: decimal(approach.NSuperficieSujeto),
        baseArea: decimal(approach.NSuperficieBase) ?? configuration.loteTipo ?? null,
        surfacePower: decimal(approach.NPotenciaSuperficie) ?? defaults.surfacePower,
        adoptedUnitValue: configuration.adoptedUnitValue ?? null,
        justification: approach.SJustificacionValor,
        additionalAmount: decimal(approach.NMontoAdicional) ?? 0,
        factorSlots: configuration.factorSlots?.length ? configuration.factorSlots : defaults.factorSlots,
        ...(configuration.rounding === undefined ? {} : { rounding: configuration.rounding }),
        ...offerCaptures(configuration),
        homologationBasis: homologationBasisOf({ comparableType: type, homologationBasis: configuration.homologationBasis, baseArea: decimal(approach.NSuperficieBase) }),
        typicalFrontage: configuration.typicalFrontage ?? null,
        typicalDepth: configuration.typicalDepth ?? null,
        characteristicFields: configuration.characteristicFields ?? null,
        subjectCharacteristics: configuration.subjectCharacteristics ?? {},
        showFactorJustification: configuration.showFactorJustification ?? true,
        regression: configuration.regression ?? null,
        showHomologationTable: configuration.showHomologationTable ?? true,
        showHomologationNote: configuration.showHomologationNote ?? true,
        homologationNote: configuration.homologationNote ?? null,
        printedStatistics: configuration.printedStatistics ?? null,
        fieldLabels: configuration.fieldLabels ?? null,
        linkedColumns: configuration.linkedColumns ?? null,
        ...(configuration.homologate === undefined ? {} : { homologate: configuration.homologate }),
        ...(configuration.additionalAmountInCalculation === undefined ? {} : { additionalAmountInCalculation: configuration.additionalAmountInCalculation }),
        ...(configuration.showAdditionalAmount === undefined ? {} : { showAdditionalAmount: configuration.showAdditionalAmount }),
        formulas: storedFormulas(configuration.formulas),
      }
    : { ...defaults, formulas: {} };
  const comparables = await Promise.all(rows.map((row) => toComparableDto(row, withPhotoUrls)));
  return { typeId, settings, comparables, configured: approach !== null, precision };
}

/**
 * The offer level grid as stored: its options, the mark and the sentence. A
 * capture of before keeps the six options of the format and its offer level;
 * the level stays readable while the options are those six.
 */
function offerCaptures(stored: StoredConfiguration) {
  const offerLabels = stored.offerLabels?.length ? stored.offerLabels : null;
  const offerMark = offerMarkOf({ offerMark: stored.offerMark, offerLevel: stored.offerLevel, offerLabels });
  return {
    offerLevel: !offerLabels && offerMark !== null ? OFFER_LEVELS[offerMark] : null,
    offerLabels,
    offerMark,
    offerIntro: stored.offerIntro ?? null,
  };
}

/** A market of a version as the statistical methods read its regression of before (no photo URLs). */
export async function loadMarketForStatistics(tx: Tx, versionId: number, type: ComparableType) {
  const { settings, comparables } = await loadCalculation(tx, versionId, type, false);
  return { settings, comparables };
}

/** Every market captured in a version, as the conclude check reads its adopted value (no photo URLs). */
export async function loadVersionMarkets(tx: Tx, versionId: number) {
  const captured = await tx.enfoqueMercado.findMany({ where: { IdVersionAvaluo: versionId }, select: { tipoComparable: { select: { SClave: true } } } });
  const types = new Set(captured.map((market) => market.tipoComparable.SClave));
  const markets = [];
  for (const type of COMPARABLE_TYPES) {
    if (!types.has(type)) continue;
    const { settings, comparables, precision } = await loadCalculation(tx, versionId, type, false);
    markets.push({ settings, comparables, precision });
  }
  return markets;
}

/** The rent market of a version as the income approach needs it (no photo URLs). */
export async function loadRentMarket(tx: Tx, versionId: number) {
  const { settings, comparables } = await loadCalculation(tx, versionId, "INMUEBLE_RENTA", false);
  return { settings, comparables };
}

export async function getMarketCalculation(publicId: string, organizationId: number, type: ComparableType): Promise<MarketCalculationDto> {
  return prisma.$transaction(async (tx) => {
    const avaluo = await findValuation(tx, publicId, organizationId);
    const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
    if (!versionId) return { settings: defaultMarketSettings(type), comparables: [], locked: avaluo.BBloqueado, configured: false };
    const [{ settings, comparables, configured, precision }, comparableValidityMonths, cover] = await Promise.all([
      loadCalculation(tx, versionId, type, true),
      firmComparableMonths(tx, organizationId),
      tx.caratulaAvaluo.findUnique({ where: { IdVersionAvaluo: versionId }, select: { DFechaAvaluo: true } }),
    ]);
    return {
      settings, comparables, locked: avaluo.BBloqueado, configured, precision, comparableValidityMonths,
      // The day of the valuation, for the age of a comparable from its year; missing, the card counts to today.
      ...(cover?.DFechaAvaluo ? { valuationDate: todayInMexico(cover.DFechaAvaluo) } : {}),
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Result and trace                                                   */
/* ------------------------------------------------------------------ */

/** Recomputes the approach with the engine and stores the result and its trace. */
async function recompute(tx: Tx, versionId: number, type: ComparableType) {
  const { typeId, settings, comparables, precision } = await loadCalculation(tx, versionId, type, false);
  const engineInput = toMarketEngineInput({ settings, comparables });
  const calculationKey = `MOTOR.MERCADO.${type}`;
  await tx.ejecucionCalculo.deleteMany({ where: { IdVersionAvaluo: versionId, SClaveCalculo: calculationKey } });

  const trace = new Trace();
  const config = marketEngineConfig(settings, precision);
  const result = engineInput.ok ? computeMarketApproach(engineInput.input, config, trace) : null;
  // The regression is the statistical methods' own apartado now (statistical.service), with its own run.
  const resultColumns = {
    NSuperficieSujeto: settings.subjectArea,
    NValorPromedioHomologado: result?.homologation.stats.mean ?? null,
    NValorHomologadoUtilizado: result?.adoptedUnitValue ?? null,
    NValorMercado: result?.value ?? null,
  };
  await tx.enfoqueMercado.upsert({
    where: { IdVersionAvaluo_IdTipoComparable: { IdVersionAvaluo: versionId, IdTipoComparable: typeId } },
    create: {
      IdVersionAvaluo: versionId,
      IdTipoComparable: typeId,
      NPotenciaSuperficie: settings.surfacePower,
      JConfiguracion: storedConfiguration(settings),
      ...resultColumns,
    },
    update: resultColumns,
  });
  if (!engineInput.ok) {
    await recomputeDependents(tx, versionId, type);
    return;
  }

  const calculation = await catalogId(
    (key) => tx.calculoPermitido.findUnique({ where: { SClave: key } }),
    "VALOR_HOMOLOGADO",
    (row) => row.IdCalculoPermitido,
  );
  await tx.ejecucionCalculo.create({
    data: {
      IdVersionAvaluo: versionId,
      IdCalculoPermitido: calculation,
      SClaveCalculo: calculationKey,
      SVersionCalculo: ENGINE_VERSION,
      JValoresEntrada: engineInput.input as unknown as Prisma.InputJsonValue,
      JValoresSalida: {
        value: result?.value ?? null,
        adoptedUnitValue: result?.adoptedUnitValue ?? null,
        stats: result?.homologation.stats ?? null,
      } as Prisma.InputJsonValue,
      SPoliticaRedondeo: JSON.stringify(config.rounding.market),
      BExitoso: true,
      resultados: {
        create: trace.steps.map((step, index) => ({
          SClaveResultado: step.key.slice(0, 120),
          NValorNumerico: Number.isFinite(step.value) ? step.value : null,
          IOrden: index,
        })),
      },
    },
  });
  await recomputeDependents(tx, versionId, type);
}

/**
 * Every market of a version captured so far, recomputed with what is stored
 * (after its precision changes), and what depends on them: costs, income and
 * the conclusion.
 */
export async function recomputeMarkets(tx: Tx, versionId: number) {
  const markets = await tx.enfoqueMercado.findMany({ where: { IdVersionAvaluo: versionId }, select: { tipoComparable: { select: { SClave: true } } } });
  const captured = new Set(markets.map((market) => market.tipoComparable.SClave));
  for (const type of COMPARABLE_TYPES) if (captured.has(type)) await recompute(tx, versionId, type);
  await recomputeCosts(tx, versionId);
  await recomputeIncome(tx, versionId);
}

/**
 * The cost approach values the land with the land sale market, and the income
 * approach the rent with the buildings' rent market; the conclusion takes the
 * sale market value. The land rent market feeds no other approach.
 */
async function recomputeDependents(tx: Tx, versionId: number, type: ComparableType) {
  if (type === "TERRENO_VENTA") await recomputeCosts(tx, versionId);
  if (type === "INMUEBLE_RENTA") await recomputeIncome(tx, versionId);
  // A sale market value is one of the approaches of the conclusion.
  if (!isRentComparableType(type)) await recomputeConclusion(tx, versionId);
}

/** The value sent, or the stored one when the client left the field out. */
const unlessOmitted = <T>(sent: T | undefined, stored: T | null | undefined) => (sent === undefined ? stored ?? null : sent);

function storedConfiguration(settings: StoredConfiguration) {
  return {
    factorSlots: settings.factorSlots,
    adoptedUnitValue: settings.adoptedUnitValue,
    ...(settings.rounding === undefined ? {} : { rounding: settings.rounding }),
    offerLevel: settings.offerLevel ?? null,
    offerLabels: settings.offerLabels ?? null,
    offerMark: settings.offerMark ?? null,
    offerIntro: settings.offerIntro ?? null,
    homologationBasis: settings.homologationBasis ?? null,
    loteTipo: settings.loteTipo ?? null,
    typicalFrontage: settings.typicalFrontage ?? null,
    typicalDepth: settings.typicalDepth ?? null,
    characteristicFields: settings.characteristicFields ?? null,
    subjectCharacteristics: settings.subjectCharacteristics ?? {},
    ...(settings.showFactorJustification === undefined ? {} : { showFactorJustification: settings.showFactorJustification }),
    regression: settings.regression ?? null,
    ...(settings.showHomologationTable === undefined ? {} : { showHomologationTable: settings.showHomologationTable }),
    ...(settings.showHomologationNote === undefined ? {} : { showHomologationNote: settings.showHomologationNote }),
    homologationNote: settings.homologationNote ?? null,
    printedStatistics: settings.printedStatistics ?? null,
    fieldLabels: settings.fieldLabels ?? null,
    linkedColumns: settings.linkedColumns ?? null,
    ...(settings.homologate === undefined ? {} : { homologate: settings.homologate }),
    ...(settings.additionalAmountInCalculation === undefined ? {} : { additionalAmountInCalculation: settings.additionalAmountInCalculation }),
    // Out of the calculation, the additional amount does not print either.
    ...(settings.showAdditionalAmount === undefined ? {} : { showAdditionalAmount: settings.showAdditionalAmount && settings.additionalAmountInCalculation !== false }),
    formulas: settings.formulas ?? {},
  } as Prisma.InputJsonValue;
}

/**
 * The offer level grid to store. A client that sends only the offer level (of
 * before) marks that option of the six of the format; one that sends nothing
 * leaves the grid as it was.
 */
function offerToStore(payload: MarketSettingsPayload, stored: StoredConfiguration) {
  const offerLabels = unlessOmitted(payload.offerLabels, stored.offerLabels);
  const fromLevel = payload.offerLevel === undefined ? undefined : payload.offerLevel ? OFFER_LEVELS.indexOf(payload.offerLevel) : null;
  const offerMark = payload.offerMark !== undefined ? payload.offerMark
    : fromLevel !== undefined ? fromLevel
      : offerMarkOf({ offerMark: stored.offerMark, offerLevel: stored.offerLevel, offerLabels: stored.offerLabels });
  return {
    offerLabels: offerLabels?.length ? offerLabels : null,
    offerMark,
    offerLevel: !offerLabels?.length && offerMark !== null ? OFFER_LEVELS[offerMark] : null,
    offerIntro: unlessOmitted(payload.offerIntro, stored.offerIntro),
  };
}

// The ±30 % of the homologated mean and median does not stop saving: the value
// is stored as captured (observations of 13–14 Oct 2026). Since observation 4.12
// (29 Oct 2026) it stops concluding while the market is in the dictamen
// (adopted-value-check, checked by concludeValuation).

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */

/**
 * The subject's rating of a factor is chosen once for all comparables: when it
 * changes, comparables rated with the previous catalog option follow it.
 * Factors typed by hand, with other ratings, are left as they are.
 */
async function followSubjectRatings(
  tx: Tx,
  input: { versionId: number; typeId: number; organizationId: number; previous: FactorSlotConfig[]; next: FactorSlotConfig[] },
) {
  const changed = input.next.filter((slot) => {
    const before = input.previous.find((item) => item.type === slot.type)?.subjectOption ?? null;
    return before && slot.subjectOption && before !== slot.subjectOption;
  });
  if (!changed.length) return;
  const organization = await tx.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: input.organizationId }, select: { JCatalogoFactores: true } });
  const catalog = resolveFactorCatalog(organization.JCatalogoFactores);
  for (const slot of changed) {
    const options = optionsFor(catalog, slot.type);
    const from = options.find((option) => option.label === input.previous.find((item) => item.type === slot.type)?.subjectOption);
    const to = options.find((option) => option.label === slot.subjectOption);
    if (!from || !to) continue;
    const rows = await tx.factorHomologacion.findMany({
      where: {
        tipoFactorHomologacion: { SClave: slot.type },
        NCalificacionSujeto: from.value,
        NCalificacionComparable: { not: null },
        comparableAvaluo: { IdVersionAvaluo: input.versionId, IdTipoComparable: input.typeId },
      },
    });
    for (const row of rows) {
      const comparableRating = Number(row.NCalificacionComparable);
      await tx.factorHomologacion.update({
        where: { IdFactorHomologacion: row.IdFactorHomologacion },
        data: {
          NCalificacionSujeto: to.value,
          NValor: to.value / comparableRating,
          SJustificacion: optionJustification(slot.type, slot.label, to, matchOption(options, comparableRating)) ?? row.SJustificacion,
        },
      });
    }
  }
}

export async function saveMarketSettings(publicId: string, user: AuthUser, payload: MarketSettingsPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const typeId = await comparableTypeId(tx, payload.comparableType);
    const current = await tx.enfoqueMercado.findUnique({
      where: { IdVersionAvaluo_IdTipoComparable: { IdVersionAvaluo: versionId, IdTipoComparable: typeId } },
      select: { JConfiguracion: true },
    });
    const stored = asRecord(current?.JConfiguracion ?? null) as StoredConfiguration;
    const { settings: previous } = await loadCalculation(tx, versionId, payload.comparableType, false);
    const formulas = formulasOrThrow({ next: payload, sent: payload.formulas, previous, previousFormulas: previous.formulas ?? {} });
    const previousSlots = stored.factorSlots ?? [];
    // Six factors; one saved with seven or eight keeps them but takes no more (video 8.13, 18:01).
    if (!factorCountAllowed(payload.factorSlots.length, previousSlots.length)) throw new ValuationWorkflowError(FACTOR_LIMIT_MESSAGE, 400);
    await followSubjectRatings(tx, { versionId, typeId, organizationId: user.organizationId, previous: previousSlots, next: payload.factorSlots });
    const homologationBasis = unlessOmitted(payload.homologationBasis, stored.homologationBasis);
    const againstBase = homologationBasisOf({ comparableType: payload.comparableType, homologationBasis, baseArea: payload.baseArea }) === "LOTE_TIPO";
    const data = {
      NSuperficieSujeto: payload.subjectArea,
      // Against the subject the lote tipo is kept aside, and neither this market nor the cost approach uses it.
      NSuperficieBase: againstBase ? payload.baseArea : null,
      NPotenciaSuperficie: payload.surfacePower,
      NMontoAdicional: payload.additionalAmount,
      SJustificacionValor: payload.justification,
      // A client that does not send the captures of the appraiser's format leaves them as they were.
      JConfiguracion: storedConfiguration({
        ...payload,
        ...offerToStore(payload, stored),
        homologationBasis,
        loteTipo: payload.baseArea,
        typicalFrontage: unlessOmitted(payload.typicalFrontage, stored.typicalFrontage),
        typicalDepth: unlessOmitted(payload.typicalDepth, stored.typicalDepth),
        characteristicFields: unlessOmitted(payload.characteristicFields, stored.characteristicFields),
        subjectCharacteristics: payload.subjectCharacteristics ?? stored.subjectCharacteristics,
        showFactorJustification: payload.showFactorJustification ?? stored.showFactorJustification,
        regression: unlessOmitted(payload.regression, stored.regression),
        showHomologationTable: payload.showHomologationTable ?? stored.showHomologationTable,
        showHomologationNote: payload.showHomologationNote ?? stored.showHomologationNote,
        homologationNote: unlessOmitted(payload.homologationNote, stored.homologationNote),
        printedStatistics: unlessOmitted(payload.printedStatistics, stored.printedStatistics),
        fieldLabels: unlessOmitted(payload.fieldLabels, stored.fieldLabels),
        linkedColumns: unlessOmitted(payload.linkedColumns, stored.linkedColumns),
        homologate: payload.homologate ?? stored.homologate,
        additionalAmountInCalculation: payload.additionalAmountInCalculation ?? stored.additionalAmountInCalculation,
        showAdditionalAmount: payload.showAdditionalAmount ?? stored.showAdditionalAmount,
        formulas,
      }),
    };
    await tx.enfoqueMercado.upsert({
      where: { IdVersionAvaluo_IdTipoComparable: { IdVersionAvaluo: versionId, IdTipoComparable: typeId } },
      create: { IdVersionAvaluo: versionId, IdTipoComparable: typeId, ...data },
      update: data,
    });
    await recompute(tx, versionId, payload.comparableType);
  });
}

/**
 * Takes a market out of the valuation: its settings and its stored result.
 * Only an empty one (no comparables), so nothing captured is lost; one with
 * comparables is emptied first, comparable by comparable.
 */
/** Why the comparables of a market taken out wait aside (the table asks for a date and a reason when one is not included). */
const MARKET_REMOVED_REASON = "Mercado quitado del avalúo («Quitar este mercado»); se puede deshacer.";

/**
 * "Quitar este mercado": the market leaves the valuation with its settings,
 * also when it has comparables (video 6.3, 06:35). Its comparables are only
 * set aside (`BIncluido` false), so `restoreMarket` brings them back with
 * their factors, photos and review: the removal is undone, as every deletion.
 * Returns the comparables set aside.
 */
export async function deleteMarket(publicId: string, user: AuthUser, type: ComparableType) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const typeId = await comparableTypeId(tx, type);
    const comparables = await tx.comparableAvaluo.findMany({
      where: { IdVersionAvaluo: versionId, IdTipoComparable: typeId, BIncluido: true },
      select: { UIdentificadorPublico: true, IdComparableAvaluo: true },
    });
    if (comparables.length) {
      await tx.comparableAvaluo.updateMany({ where: { IdVersionAvaluo: versionId, IdTipoComparable: typeId, BIncluido: true }, data: { BIncluido: false, DFechaExclusion: new Date(), SMotivoExclusion: MARKET_REMOVED_REASON } });
      await keepInFirmBase(tx, user, comparables.map((row) => row.IdComparableAvaluo));
    }
    await tx.enfoqueMercado.deleteMany({ where: { IdVersionAvaluo: versionId, IdTipoComparable: typeId } });
    await tx.ejecucionCalculo.deleteMany({ where: { IdVersionAvaluo: versionId, SClaveCalculo: `MOTOR.MERCADO.${type}` } });
    await recomputeDependents(tx, versionId, type);
    return { comparableIds: comparables.map((row) => row.UIdentificadorPublico) };
  });
}

/**
 * Undoes "Quitar este mercado": the comparables set aside come back after the
 * ones captured since, in their order. The settings come back with
 * `saveMarketSettings`, as the panel had them.
 */
export async function restoreMarket(publicId: string, user: AuthUser, type: ComparableType, comparableIds: string[]) {
  await prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const typeId = await comparableTypeId(tx, type);
    const aside = await tx.comparableAvaluo.findMany({
      where: { IdVersionAvaluo: versionId, IdTipoComparable: typeId, BIncluido: false, UIdentificadorPublico: { in: comparableIds } },
      orderBy: [{ IOrden: "asc" }, { IdComparableAvaluo: "asc" }],
      select: { IdComparableAvaluo: true },
    });
    const included = await tx.comparableAvaluo.count({ where: { IdVersionAvaluo: versionId, IdTipoComparable: typeId, BIncluido: true } });
    for (const [index, row] of aside.entries()) {
      await tx.comparableAvaluo.update({
        where: { IdComparableAvaluo: row.IdComparableAvaluo },
        data: { BIncluido: true, DFechaExclusion: null, SMotivoExclusion: null, IReferencia: included + index + 1, IOrden: included + index },
      });
    }
    await recompute(tx, versionId, type);
  });
}

/* ------------------------------------------------------------------ */
/*  Comparables                                                        */
/* ------------------------------------------------------------------ */

/**
 * The formulas to keep with a comparable: each one sent must give its field's
 * value; without them, the stored ones of the values that did not change.
 */
export function comparableFormulas(payload: ComparableInputPayload, previous: ComparableDto | null) {
  return formulasOrThrow({
    next: comparableFormulaValues(payload),
    sent: payload.formulas,
    previous: previous ? comparableFormulaValues(previous) : {},
    previousFormulas: previous?.formulas ?? {},
  });
}

/** The day a comparable stops being valid: its day of consultation plus its months, or the day typed before months existed. */
function validUntilOf(payload: ComparableInputPayload, stored: Partial<PublicationSnapshot>) {
  const months = unlessOmitted(payload.validityMonths, stored.validityMonths);
  const consulted = unlessOmitted(payload.consultedOn, stored.consultedOn);
  if (months) return addMonths(consulted ?? todayInMexico(), months);
  return unlessOmitted(payload.validUntil, stored.validUntil);
}

type StoredSnapshots = {
  property?: Partial<PropertySnapshot>;
  publication?: Partial<PublicationSnapshot>;
  address?: Partial<AddressSnapshot>;
  coordinates?: Partial<LocationSnapshot>;
};

/** The snapshots of a stored comparable, to build on when it is edited. */
export const storedSnapshots = (row: Pick<ComparableRow, "JPropiedadSnapshot" | "JPublicacionSnapshot" | "JDireccionSnapshot" | "JUbicacionSnapshot">): StoredSnapshots => ({
  property: asRecord(row.JPropiedadSnapshot) as Partial<PropertySnapshot>,
  publication: asRecord(row.JPublicacionSnapshot) as Partial<PublicationSnapshot>,
  address: asRecord(row.JDireccionSnapshot) as Partial<AddressSnapshot>,
  coordinates: asRecord(row.JUbicacionSnapshot) as Partial<LocationSnapshot>,
});

/**
 * `stored` holds the snapshots being replaced: fields the client left out stay
 * as they were, and so does the screenshot, which has its own upload.
 * Coordinates go both or none, each within its range.
 */
export function snapshots(payload: ComparableInputPayload, formulas: CapturedFormulas, storedRows: StoredSnapshots = {}) {
  const stored = storedRows.property ?? {};
  const storedPublication = storedRows.publication ?? {};
  const coordinates: LocationSnapshot = {
    latitude: unlessOmitted(payload.latitude, numberOrNull(storedRows.coordinates?.latitude)),
    longitude: unlessOmitted(payload.longitude, numberOrNull(storedRows.coordinates?.longitude)),
  };
  const coordinatesProblem = coordinatesError(coordinates.latitude, coordinates.longitude);
  if (coordinatesProblem) throw new ValuationWorkflowError(coordinatesProblem, 400);
  const storedAddress = storedRows.address ? addressOf(storedRows.address) : null;
  const sentAddress = unlessOmitted(payload.address, storedAddress);
  // «Tipo de vialidad» (with which «Otro») and «Esquina con» left out (the master workbook has no column for them) keep the stored ones.
  const keepType = Boolean(payload.address && payload.address.streetType === undefined && storedAddress?.streetType);
  const keepCorner = Boolean(payload.address && payload.address.crossStreet === undefined && storedAddress?.crossStreet);
  const address = sentAddress && (keepType || keepCorner)
    ? {
      ...sentAddress,
      ...(keepType ? { streetType: storedAddress?.streetType, streetTypeOther: storedAddress?.streetTypeOther ?? null } : {}),
      ...(keepCorner ? { crossStreet: storedAddress?.crossStreet } : {}),
    }
    : sentAddress;
  const property: PropertySnapshot = {
    formulas,
    landUse: payload.landUse,
    landUseKey: unlessOmitted(payload.landUseKey, stored.landUseKey),
    shape: payload.shape,
    zone: payload.zone,
    frontCount: unlessOmitted(payload.frontCount, stored.frontCount),
    frontage: payload.frontage,
    depth: payload.depth,
    topography: payload.topography,
    services: payload.services,
    conservation: unlessOmitted(payload.conservation, stored.conservation),
    quality: unlessOmitted(payload.quality, stored.quality),
    notes: payload.notes,
    extra: payload.extra ?? stored.extra ?? {},
    characteristicsText: unlessOmitted(payload.characteristicsText, stored.characteristicsText),
    attributes: cleanAttributes(payload.attributes ?? stored.attributes),
    factorJustification: unlessOmitted(payload.factorJustification, stored.factorJustification),
    ...((payload.regressionExcluded ?? stored.regressionExcluded) ? { regressionExcluded: true } : {}),
    urbanProximity: unlessOmitted(payload.urbanProximity, stored.urbanProximity),
    operationType: unlessOmitted(payload.operationType, stored.operationType),
    landArea: unlessOmitted(payload.landArea, stored.landArea),
    bedrooms: unlessOmitted(payload.bedrooms, stored.bedrooms),
    bathrooms: unlessOmitted(payload.bathrooms, stored.bathrooms),
    constructionType: unlessOmitted(payload.constructionType, stored.constructionType),
    ...machineYear(unlessOmitted(payload.propertyDetails, stored.details), unlessOmitted(payload.machinery, stored.machinery)),
    ownFactors: ownFactorsOf(payload),
  };
  const publication: PublicationSnapshot = {
    sourceName: payload.sourceName,
    contactName: payload.contactName,
    contactPhone: payload.contactPhone,
    url: payload.url,
    offerDate: payload.offerDate,
    consultedOn: unlessOmitted(payload.consultedOn, storedPublication.consultedOn),
    validityMonths: unlessOmitted(payload.validityMonths, storedPublication.validityMonths),
    // Captured in months, the validity is the day of consultation plus them; otherwise the day typed (comparables of before).
    validUntil: validUntilOf(payload, storedPublication),
    listingText: unlessOmitted(payload.listingText, storedPublication.listingText),
    screenshot: storedPublication.screenshot ?? null,
    details: unlessOmitted(payload.listingDetails, storedPublication.details),
  };
  return {
    JPropiedadSnapshot: property as Prisma.InputJsonValue,
    JPublicacionSnapshot: publication as Prisma.InputJsonValue,
    // The single line stays what the dictamen prints; the parts travel beside it.
    JDireccionSnapshot: { location: payload.location, ...(address ?? {}) } as Prisma.InputJsonValue,
    // Typed by hand until a map places them: the valuer's own data. Nothing derived from Google is kept here (V8.13).
    JUbicacionSnapshot: coordinates as Prisma.InputJsonValue,
  };
}

/** Land comparables, for sale or rent, carry the land area; buildings the built or the rentable one. */
export function areaColumns(type: ComparableType, area: number | null) {
  return {
    NSuperficieTerrenoCapturada: isLandComparableType(type) ? area : null,
    NSuperficieConstruccionCapturada: type === "INMUEBLE_VENTA" ? area : null,
    NSuperficieRentableCapturada: type === "INMUEBLE_RENTA" ? area : null,
  };
}

export function propertyColumns(type: ComparableType, payload: ComparableInputPayload) {
  return {
    SNombre: payload.location.slice(0, 180),
    NSuperficieTerreno: isLandComparableType(type) ? payload.area : null,
    NSuperficieConstruccion: type === "INMUEBLE_VENTA" ? payload.area : null,
    NSuperficieRentable: type === "INMUEBLE_RENTA" ? payload.area : null,
    NFrente: payload.frontage,
    NFondo: payload.depth,
    SForma: payload.shape,
    STopografia: payload.topography,
    SUsoSuelo: payload.landUse,
    SZona: payload.zone,
  };
}

/** A publication is kept only when there is a link: the table requires one. */
export async function syncPublication(tx: Tx, input: {
  propertyId: number;
  current: bigint | null;
  type: ComparableType;
  payload: ComparableInputPayload;
}) {
  const { payload } = input;
  if (!payload.url) return null;
  const sourceName = (payload.sourceName ?? "Captura manual").slice(0, 180);
  const source = await tx.fuenteInmobiliaria.upsert({ where: { SNombre: sourceName }, create: { SNombre: sourceName }, update: {} });
  // A portal's id is unique per source across every firm: the same listing captured again (another valuation,
  // another firm) keeps its id in the comparable's snapshot, and the column stays with the publication that has it.
  const externalId = payload.listingDetails?.publicationId?.slice(0, 220) || null;
  const idTaken = externalId
    ? await tx.publicacionPropiedad.findFirst({
      where: {
        IdFuenteInmobiliaria: source.IdFuenteInmobiliaria, SIdentificadorExterno: externalId,
        ...(input.current ? { NOT: { IdPublicacionPropiedad: input.current } } : {}),
      },
      select: { IdPublicacionPropiedad: true },
    })
    : null;
  const data = {
    IdFuenteInmobiliaria: source.IdFuenteInmobiliaria,
    SURL: payload.url,
    STitulo: payload.location.slice(0, 180),
    NPrecio: payload.price,
    SNombreContacto: payload.contactName,
    STelefonoContacto: payload.contactPhone,
    DFechaPublicacion: payload.offerDate ? new Date(`${payload.offerDate}T12:00:00Z`) : null,
    // The listing's id in the portal and its currency, when the master workbook brings them.
    ...(externalId && !idTaken ? { SIdentificadorExterno: externalId } : {}),
    ...(payload.listingDetails?.currency ? { SMoneda: payload.listingDetails.currency } : {}),
    // The pasted listing is the publication's text as the appraiser saw it.
    ...(payload.listingText === undefined ? {} : { SDescripcion: payload.listingText }),
  };
  if (input.current) {
    await tx.publicacionPropiedad.update({ where: { IdPublicacionPropiedad: input.current }, data });
    return input.current;
  }
  const [operation, state] = await Promise.all([
    catalogId(
      (key) => tx.tipoOperacion.findUnique({ where: { SClave: key } }),
      payload.operationType ?? (isRentComparableType(input.type) ? "RENTA" : "VENTA"),
      (row) => row.IdTipoOperacion,
    ),
    catalogId((key) => tx.estadoPublicacion.findUnique({ where: { SClave: key } }), "ACTIVA", (row) => row.IdEstadoPublicacion),
  ]);
  // The day the appraiser consulted the listing; the snapshot keeps later changes of it.
  const consulted = payload.consultedOn ? new Date(`${payload.consultedOn}T12:00:00Z`) : null;
  const created = await tx.publicacionPropiedad.create({
    data: {
      ...data, IdPropiedad: input.propertyId, IdTipoOperacion: operation, IdEstadoPublicacion: state,
      ...(consulted ? { DFechaPrimeraConsulta: consulted, DFechaUltimaConsulta: consulted } : {}),
    },
  });
  return created.IdPublicacionPropiedad;
}

export async function replaceFactors(tx: Tx, comparableId: bigint, payload: ComparableInputPayload) {
  await tx.factorHomologacion.deleteMany({ where: { IdComparableAvaluo: comparableId } });
  // A surface factor is stored only when the appraiser typed one; otherwise the formula computes it.
  // The firm's own factors go in the property snapshot (`ownFactors`): one row per type fits only one of them.
  const captured = payload.factors.filter((factor) => !factor.key && (factor.type !== "SUPERFICIE" || (factor.value ?? 0) > 0));
  if (!captured.length) return;
  const [types, origin] = await Promise.all([
    tx.tipoFactorHomologacion.findMany({ where: { SClave: { in: captured.map((factor) => factor.type) } } }),
    catalogId((key) => tx.origenDato.findUnique({ where: { SClave: key } }), "USUARIO", (row) => row.IdOrigenDato),
  ]);
  const typeIds = new Map(types.map((type) => [type.SClave, type.IdTipoFactorHomologacion]));
  await tx.factorHomologacion.createMany({
    data: captured.map((factor, index) => {
      const typeId = typeIds.get(factor.type);
      if (!typeId) throw new ValuationWorkflowError(`Falta el factor ${factor.type} en el catálogo.`, 500);
      return {
        IdComparableAvaluo: comparableId,
        IdTipoFactorHomologacion: typeId,
        SNombre: factorKey(factor),
        NValor: factorValueOf(factor),
        NCalificacionSujeto: factor.subjectRating,
        NCalificacionComparable: factor.comparableRating,
        SJustificacion: factor.justification,
        IdOrigenDato: origin,
        IOrden: index,
      };
    }),
  });
}

async function findComparable(tx: Tx, versionId: number, comparableId: string) {
  const row = await tx.comparableAvaluo.findFirst({
    where: { UIdentificadorPublico: comparableId, IdVersionAvaluo: versionId },
    include: { tipoComparable: { select: { SClave: true } } },
  });
  if (!row) throw new ValuationWorkflowError("Comparable no encontrado", 404);
  return row;
}

/** The next number of the firm's base: the counter only grows, so a number is never given twice. */
async function nextComparableFolio(tx: Tx, organizationId: number) {
  const organization = await tx.organizacion.update({
    where: { IdOrganizacion: organizationId },
    data: { IUltimoFolioComparable: { increment: 1 } },
    select: { IUltimoFolioComparable: true },
  });
  return organization.IUltimoFolioComparable;
}

/**
 * Where a new comparable goes: after the last of its type in a version of a
 * valuation, or into the firm's base without a valuation (migration 048),
 * where its property takes the type of inmueble its capture says.
 */
export type InsertTarget =
  | { kind: "valuation"; avaluo: { IdAvaluo: number; IdTipoInmueble: number }; versionId: number; typeId: number }
  | { kind: "base"; typeId: number; propertyTypeId: number };

/**
 * Adds one comparable; the caller recomputes.
 * `reused` comes with a comparable brought from the firm's base (a search, a
 * duplicate): it keeps that one's number, and its photos and screenshot share
 * the stored files, as a reopened version shares them, since removing an
 * image never deletes its file. Without it the comparable gets a new number.
 * `review` is the one an import brings (por revisar when absent).
 */
export async function insertComparable(
  tx: Tx,
  target: InsertTarget,
  user: Pick<AuthUser, "id" | "organizationId">,
  type: ComparableType,
  payload: ComparableInputPayload,
  reused: ReusedComparableEvidence = {},
  review: ReviewSnapshot | null = null,
) {
  payload = savedPayload(payload);
  if (target.kind === "valuation") assertRealEstate(payload);
  const screenshot = reused.screenshot ? { id: randomUUID(), key: reused.screenshot.key, title: reused.screenshot.title } : null;
  const captured = snapshots(payload, comparableFormulas(payload, null), screenshot ? { publication: { screenshot } } : {});
  const last = target.kind === "valuation"
    ? await tx.comparableAvaluo.aggregate({
      // Among the comparables in the market: the ones of a market taken out wait aside for an undo.
      where: { IdVersionAvaluo: target.versionId, IdTipoComparable: target.typeId, BIncluido: true },
      _max: { IReferencia: true, IOrden: true },
    })
    : null;
  const property = await tx.propiedad.create({
    data: {
      IdOrganizacion: user.organizationId,
      IdTipoInmueble: target.kind === "valuation" ? target.avaluo.IdTipoInmueble : target.propertyTypeId,
      IFolioComparable: reused.folio ?? await nextComparableFolio(tx, user.organizationId),
      ...propertyColumns(type, payload),
    },
  });
  const publicationId = await syncPublication(tx, { propertyId: property.IdPropiedad, current: null, type, payload });
  const comparable = await tx.comparableAvaluo.create({
    data: {
      ...(target.kind === "valuation"
        ? {
          IdAvaluo: target.avaluo.IdAvaluo,
          IdVersionAvaluo: target.versionId,
          IReferencia: (last?._max.IReferencia ?? 0) + 1,
          IOrden: (last?._max.IOrden ?? -1) + 1,
        }
        : { IdOrganizacion: user.organizationId }),
      IdPropiedad: property.IdPropiedad,
      IdPublicacionPropiedad: publicationId,
      IdUsuarioSeleccion: user.id,
      IdTipoComparable: target.typeId,
      NPrecioCapturado: payload.price,
      ...areaColumns(type, payload.area),
      NValorUnitarioCapturado: payload.price && payload.area ? payload.price / payload.area : null,
      ...captured,
      ...(review ? { JRevision: review as Prisma.InputJsonValue } : {}),
      // A comparable brought from the base as it was keeps the date of its data; a capture is new data.
      DFechaActualizacionDatos: reused.dataUpdatedAt ?? new Date(),
      JImagenesSnapshot: (reused.photos ?? []).slice(0, MAX_PHOTOS_PER_COMPARABLE)
        .map((photo) => ({ id: randomUUID(), key: photo.key, title: photo.title })) as Prisma.InputJsonValue,
    },
  });
  await replaceFactors(tx, comparable.IdComparableAvaluo, payload);
  return comparable.UIdentificadorPublico;
}

/**
 * `mergeInto` is the answer «Es el mismo: actualizar los datos de su ficha» to
 * a possible duplicate (V8.12): the comparable keeps the number, photos and
 * screenshot of that one of the base and the data the appraiser captures now
 * become its card for this valuation and the ones to come (the base shows its
 * most recent capture). A concluded valuation keeps its own capture as it was.
 */
export async function createComparable(
  publicId: string,
  user: AuthUser,
  type: ComparableType,
  payload: ComparableInputPayload,
  options: { mergeInto?: string } = {},
) {
  return prisma.$transaction(async (tx) => {
    const { avaluo, versionId } = await writableVersion(tx, publicId, user);
    const typeId = await comparableTypeId(tx, type);
    const merged = options.mergeInto ? await mergedInput(tx, user.organizationId, options.mergeInto, payload, { update: true }) : { payload, reused: {} };
    const id = await insertComparable(tx, { kind: "valuation", avaluo, versionId, typeId }, user, type, merged.payload, merged.reused);
    await recompute(tx, versionId, type);
    return id;
  });
}

/** What a comparable brought from it keeps of a stored one: its photos, screenshot and number. */
export function reusedEvidenceOf(row: {
  JImagenesSnapshot: Prisma.JsonValue | null;
  JPublicacionSnapshot: Prisma.JsonValue | null;
  DFechaActualizacionDatos: Date;
  propiedad: { IFolioComparable: number | null };
}): ReusedComparableEvidence {
  const photos = (Array.isArray(row.JImagenesSnapshot) ? row.JImagenesSnapshot : []).flatMap((item) => {
    const photo = asRecord(item as Prisma.JsonValue);
    return typeof photo.key === "string" && photo.key
      ? [{ key: photo.key, title: typeof photo.title === "string" && photo.title ? photo.title : "Fotografía" }]
      : [];
  });
  const screenshot = storedScreenshot(row.JPublicacionSnapshot);
  return {
    photos,
    screenshot: screenshot ? { key: screenshot.key, title: screenshot.title } : null,
    folio: row.propiedad.IFolioComparable,
    dataUpdatedAt: row.DFechaActualizacionDatos,
  };
}

/**
 * "Usar el existente": adds to the valuation a comparable of the firm's base
 * as it was captured, with its photos, screenshot and number, and the note of
 * where it came from. The source is read only within the user's organization;
 * factors depend on the subject and are rated again.
 */
async function reusedInput(tx: Tx, organizationId: number, sourceId: string) {
  const source = await tx.comparableAvaluo.findFirst({
    where: { UIdentificadorPublico: sourceId, ...inFirmBase(organizationId) },
    include: { ...comparableInclude, avaluo: { select: { SFolio: true } } },
  });
  if (!source) throw new ValuationWorkflowError("Comparable no encontrado", 404);
  const { formulas, ...values } = comparableFormValues(await toComparableDto(source, false));
  const payload: ComparableInputPayload = {
    ...withProvenance(values, "Comparables del despacho", source.avaluo ? `avalúo ${source.avaluo.SFolio}` : null),
    // The factors stay behind, and so do their formulas.
    formulas: Object.fromEntries(Object.entries(formulas ?? {}).filter(([path]) => !path.startsWith("factors."))),
    factors: [],
  };
  return { payload, reused: reusedEvidenceOf(source) };
}

/** The day a capture's data is from: when its listing was consulted, else its offer, else today. */
export const capturedDay = (payload: Pick<ComparableInputPayload, "consultedOn" | "offerDate">) =>
  payload.consultedOn ?? payload.offerDate ?? todayInMexico();

/**
 * "Es el mismo: se deja el más actualizado". The capture and the comparable of
 * the base are one property: the capture's data, newer, stays under the base's
 * number with its photos and screenshot (a screenshot taken now replaces it),
 * and its validity starts again. When the base's data is the more recent
 * (an import of an older offer), the base's comparable is used as it is.
 */
async function mergedInput(tx: Tx, organizationId: number, sourceId: string, payload: ComparableInputPayload, options: { update?: boolean } = {}) {
  const source = await tx.comparableAvaluo.findFirst({
    where: { UIdentificadorPublico: sourceId, ...inFirmBase(organizationId) },
    include: { propiedad: { select: { IFolioComparable: true } } },
  });
  if (!source) throw new ValuationWorkflowError("Comparable no encontrado", 404);
  // An import keeps the most recent; «actualizar los datos de su ficha», chosen in the card, always takes the capture.
  if (!options.update && todayInMexico(source.DFechaActualizacionDatos) > capturedDay(payload)) return reusedInput(tx, organizationId, sourceId);
  const { dataUpdatedAt: _kept, ...evidence } = reusedEvidenceOf(source);
  return { payload, reused: evidence };
}

export async function reuseComparable(publicId: string, user: AuthUser, type: ComparableType, sourceId: string) {
  return prisma.$transaction(async (tx) => {
    const { avaluo, versionId } = await writableVersion(tx, publicId, user);
    const { payload, reused } = await reusedInput(tx, user.organizationId, sourceId);
    const typeId = await comparableTypeId(tx, type);
    const id = await insertComparable(tx, { kind: "valuation", avaluo, versionId, typeId }, user, type, payload, reused);
    await recompute(tx, versionId, type);
    return id;
  });
}

/** A comparable to import: as captured, or the answer to a possible duplicate. The review is the one the file brings. */
export type ImportEntry =
  | (ComparableInputPayload & { reused?: ReusedComparableEvidence; review?: ReviewSnapshot | null })
  | { reuseFrom: string }
  | { mergeInto: string; payload: ComparableInputPayload; review?: ReviewSnapshot | null };

/**
 * Adds many comparables at once (Excel import, comparables found in a search)
 * and recomputes once; all or none. A found comparable may bring its photos.
 */
export async function importComparables(publicId: string, user: AuthUser, type: ComparableType, payloads: ImportEntry[]) {
  return (await importComparableIds(publicId, user, type, payloads)).length;
}

/** The same, answering the id of the comparable each entry became, in order: «Crear fichas» attaches its images to them. */
export async function importComparableIds(publicId: string, user: AuthUser, type: ComparableType, payloads: ImportEntry[]) {
  return prisma.$transaction(async (tx) => {
    const { avaluo, versionId } = await writableVersion(tx, publicId, user);
    const typeId = await comparableTypeId(tx, type);
    const ids: string[] = [];
    for (const entry of payloads) {
      // A row of an import the appraiser answered with "Usar el existente" or "Es el mismo".
      const { payload, reused, review } = "reuseFrom" in entry
        ? { ...await reusedInput(tx, user.organizationId, entry.reuseFrom), review: null }
        : "mergeInto" in entry
          ? { ...await mergedInput(tx, user.organizationId, entry.mergeInto, entry.payload), review: entry.review ?? null }
          : (({ reused: evidence, review: brought, ...captured }) => ({ payload: captured, reused: evidence, review: brought ?? null }))(entry);
      ids.push(await insertComparable(tx, { kind: "valuation", avaluo, versionId, typeId }, user, type, payload, reused, review));
    }
    await recompute(tx, versionId, type);
    return ids;
  }, { timeout: 60_000 });
}

/** A comparable to keep in the firm's base without a valuation; `mergeInto` answers "es el mismo" to one of the base. */
export type BaseImportEntry = {
  type: ComparableType;
  payload: ComparableInputPayload;
  review?: ReviewSnapshot | null;
  mergeInto?: string;
};

/** What an import to the base did with each entry, in order. */
export type BaseImportOutcome = "CREATED" | "UPDATED" | "KEPT";
/** The outcome of each entry and the comparable of the base that stands for it now (its most recent capture). */
export type BaseImportResult = { outcome: BaseImportOutcome; id: string };

/**
 * "Solo base general": comparables of the firm's base that belong to no
 * valuation, all or none. A new one gets its number. "Es el mismo" keeps the
 * number of the one of the base: a comparable of the base without a valuation
 * takes the newer data in place; one captured in a valuation, whose capture
 * belongs to that valuation, gets a newer capture in the base under its number.
 * When the base's data is the more recent, it stays as it is.
 */
export async function importToFirmBase(user: AuthUser, entries: BaseImportEntry[]): Promise<BaseImportResult[]> {
  return prisma.$transaction(async (tx) => {
    const results: BaseImportResult[] = [];
    const typeIds = new Map<ComparableType, number>();
    const typeIdOf = async (type: ComparableType) => {
      const known = typeIds.get(type);
      if (known) return known;
      const id = await comparableTypeId(tx, type);
      typeIds.set(type, id);
      return id;
    };
    for (const entry of entries) {
      const typeId = await typeIdOf(entry.type);
      const propertyTypeId = await basePropertyTypeId(tx, entry.type, entry.payload);
      const review = entry.review ?? null;
      if (!entry.mergeInto) {
        const id = await insertComparable(tx, { kind: "base", typeId, propertyTypeId }, user, entry.type, entry.payload, {}, review);
        results.push({ outcome: "CREATED", id });
        continue;
      }
      const source = await tx.comparableAvaluo.findFirst({
        where: { UIdentificadorPublico: entry.mergeInto, ...inFirmBase(user.organizationId) },
        include: { ...comparableInclude, tipoComparable: { select: { SClave: true } } },
      });
      if (!source) throw new ValuationWorkflowError("Comparable no encontrado", 404);
      if (todayInMexico(source.DFechaActualizacionDatos) > capturedDay(entry.payload)) {
        results.push({ outcome: "KEPT", id: source.UIdentificadorPublico });
        continue;
      }
      if (source.IdAvaluo === null) {
        await updateBaseCapture(tx, source, { type: entry.type, typeId, payload: entry.payload, review });
        results.push({ outcome: "UPDATED", id: source.UIdentificadorPublico });
        continue;
      }
      const { dataUpdatedAt: _kept, ...evidence } = reusedEvidenceOf(source);
      const id = await insertComparable(tx, { kind: "base", typeId, propertyTypeId }, user, entry.type, entry.payload, evidence, review);
      results.push({ outcome: "UPDATED", id });
    }
    return results;
  }, { timeout: 60_000 });
}

/** The type of inmueble a comparable of the base is filed under: what its kind says, or its kind of construction. */
export const basePropertyTypeId = (tx: Tx, type: ComparableType, payload: Pick<ComparableInputPayload, "constructionType" | "propertyDetails">) => {
  const kind = kindOfComparable({ type, constructionType: payload.constructionType ?? null, propertyDetails: withKindDetails(payload.propertyDetails ?? {}) });
  return catalogId(
    (key) => tx.tipoInmueble.findUnique({ where: { SClave: key } }),
    kind ? propertyTypeKeyOfKind(kind) : propertyTypeKeyOf(type, payload.constructionType ?? null),
    (row) => row.IdTipoInmueble,
  );
};

/**
 * A comparable as it is stored: an offer in dollars takes its price in pesos
 * (comparable-currency) and a kind takes its class (comparable-kinds).
 */
export function savedPayload(payload: ComparableInputPayload): ComparableInputPayload {
  const offer = withOfferInPesos(payload);
  return offer.propertyDetails ? { ...offer, propertyDetails: withKindDetails(offer.propertyDetails) } : offer;
}

/**
 * A machine has one «Año», the one of its data (`machinery.year`, #160): a
 * year that comes with the property's details (the master workbook) goes
 * there, keeping the rest of the machine's data. A client that does not send
 * the machine's data (the master workbook, a client of before) keeps the
 * stored ones.
 */
function machineYear(details: PropertySnapshot["details"], machinery: PropertySnapshot["machinery"]) {
  const machine = comparableClassOf({ assetClass: details?.assetClass }) === "MAQUINARIA";
  if (!machine || !details?.year) return { details, machinery };
  return { details: { ...details, year: null }, machinery: { ...(machinery ?? {}), year: details.year } };
}

/**
 * The markets of a valuation are of real estate: a comparable of machinery
 * and equipment never goes into one (24 Nov 2026, «no se van a mezclar»).
 */
function assertRealEstate(payload: ComparableInputPayload) {
  const kindClass = comparableClassOf({ assetClass: payload.propertyDetails?.assetClass, constructionType: payload.constructionType });
  if (kindClass !== "INMUEBLE") {
    throw new ValuationWorkflowError(`Un comparable de ${COMPARABLE_CLASS_LABELS[kindClass].toLowerCase()} no va en un mercado de inmuebles.`, 400);
  }
}

/**
 * Replaces in place the data of a comparable kept in the base without a
 * valuation (nothing else shows it): its property, publication, snapshots and
 * factors; its validity starts again when its data changed, as in a valuation.
 */
export async function updateBaseCapture(
  tx: Tx,
  source: ComparableRow,
  input: { type: ComparableType; typeId: number; payload: ComparableInputPayload; review?: ReviewSnapshot | null; renew?: boolean },
) {
  const { type, typeId, review } = input;
  const payload = savedPayload(input.payload);
  const previous = await toComparableDto(source, false);
  const formulas = comparableFormulas(payload, previous);
  await tx.propiedad.update({ where: { IdPropiedad: source.IdPropiedad }, data: propertyColumns(type, payload) });
  const publicationId = await syncPublication(tx, { propertyId: source.IdPropiedad, current: source.IdPublicacionPropiedad, type, payload });
  const renew = input.renew ?? true;
  await tx.comparableAvaluo.update({
    where: { IdComparableAvaluo: source.IdComparableAvaluo },
    data: {
      IdTipoComparable: typeId,
      IdPublicacionPropiedad: publicationId,
      NPrecioCapturado: payload.price,
      ...areaColumns(type, payload.area),
      NValorUnitarioCapturado: payload.price && payload.area ? payload.price / payload.area : null,
      ...snapshots(payload, formulas, storedSnapshots(source)),
      ...(review ? { JRevision: review as Prisma.InputJsonValue } : {}),
      ...(renew || comparableDataChanged(previous, payload) ? { DFechaActualizacionDatos: new Date() } : {}),
    },
  });
  await replaceFactors(tx, source.IdComparableAvaluo, payload);
  // V8.13: a pin placed in the base reaches every capture of its number.
  const pin = pinOf({ latitude: payload.latitude ?? null, longitude: payload.longitude ?? null });
  if (pin && source.IdOrganizacion !== null && (pin.latitude !== previous.latitude || pin.longitude !== previous.longitude)) {
    await shareComparablePin(tx, source.IdOrganizacion, source.propiedad.IFolioComparable, pin, source.IdComparableAvaluo);
  }
  if (source.IdOrganizacion !== null) await forgetApproximate(tx, source.IdOrganizacion, source.UIdentificadorPublico);
}

/**
 * Reopening copies comparables pointing at the same property and publication
 * as the concluded version. Before editing, a comparable that shares them gets
 * its own copies, so the concluded version keeps what it showed.
 */
async function ownPropertyRows(tx: Tx, comparable: { IdComparableAvaluo: bigint; IdPropiedad: number; IdPublicacionPropiedad: bigint | null }) {
  const others = { NOT: { IdComparableAvaluo: comparable.IdComparableAvaluo } };
  const propertyShared = await tx.comparableAvaluo.count({ where: { IdPropiedad: comparable.IdPropiedad, ...others } }) > 0;
  const publicationShared = comparable.IdPublicacionPropiedad !== null
    && await tx.comparableAvaluo.count({ where: { IdPublicacionPropiedad: comparable.IdPublicacionPropiedad, ...others } }) > 0;

  let propertyId = comparable.IdPropiedad;
  if (propertyShared) {
    const {
      IdPropiedad: _id, UIdentificadorPublico: _publicId, DFechaCreacion: _created, DFechaModificacion: _modified,
      JCaracteristicas, ...columns
    } = await tx.propiedad.findUniqueOrThrow({ where: { IdPropiedad: comparable.IdPropiedad } });
    const copy = await tx.propiedad.create({ data: { ...columns, JCaracteristicas: JCaracteristicas ?? undefined } });
    propertyId = copy.IdPropiedad;
  }
  // A new property needs its own publication too; syncPublication creates it when `current` is null.
  const publicationId = propertyShared || publicationShared ? null : comparable.IdPublicacionPropiedad;
  return { propertyId, publicationId };
}

export async function updateComparable(publicId: string, user: AuthUser, comparableId: string, sent: ComparableInputPayload) {
  const payload = savedPayload(sent);
  assertRealEstate(payload);
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const current = await findComparable(tx, versionId, comparableId);
    const type = current.tipoComparable.SClave as ComparableType;
    const previous = await toComparableDto(
      await tx.comparableAvaluo.findUniqueOrThrow({ where: { IdComparableAvaluo: current.IdComparableAvaluo }, include: comparableInclude }),
      false,
    );
    const formulas = comparableFormulas(payload, previous);
    const { propertyId, publicationId: ownPublication } = await ownPropertyRows(tx, current);
    await tx.propiedad.update({ where: { IdPropiedad: propertyId }, data: propertyColumns(type, payload) });
    const publicationId = await syncPublication(tx, {
      propertyId,
      current: ownPublication,
      type,
      payload,
    });
    await tx.comparableAvaluo.update({
      where: { IdComparableAvaluo: current.IdComparableAvaluo },
      data: {
        IdPropiedad: propertyId,
        IdPublicacionPropiedad: publicationId,
        NPrecioCapturado: payload.price,
        ...areaColumns(type, payload.area),
        NValorUnitarioCapturado: payload.price && payload.area ? payload.price / payload.area : null,
        ...snapshots(payload, formulas, storedSnapshots(current)),
        // Updating its data renews its validity; rating its factors does not.
        ...(comparableDataChanged(previous, payload) ? { DFechaActualizacionDatos: new Date() } : {}),
      },
    });
    await replaceFactors(tx, current.IdComparableAvaluo, payload);
    // V8.13: the pin placed here is the comparable's in the whole firm, also in the search of another valuation.
    const saved = await tx.comparableAvaluo.findUniqueOrThrow({
      where: { IdComparableAvaluo: current.IdComparableAvaluo },
      select: { JUbicacionSnapshot: true, JDireccionSnapshot: true, propiedad: { select: { IFolioComparable: true } } },
    });
    const pin = pinOf(saved.JUbicacionSnapshot);
    if (pin && (pin.latitude !== previous.latitude || pin.longitude !== previous.longitude)) {
      await shareComparablePin(tx, user.organizationId, saved.propiedad.IFolioComparable, pin, current.IdComparableAvaluo);
    }
    // Another address (or a pin): the temporary approximate answer of the old one no longer applies.
    if (pin || approximateQueryOf(saved.JDireccionSnapshot) !== approximateQueryOf(current.JDireccionSnapshot)) {
      await forgetApproximate(tx, user.organizationId, current.UIdentificadorPublico);
    }
    await recompute(tx, versionId, type);
  });
}

const COMPARABLE_REMOVED_REASON = "Comparable quitado del mercado; se puede deshacer.";

/**
 * "Eliminar comparable" of a market: it is set aside (`BIncluido` false, with
 * its factors, photos and what the appraiser wrote in its rows of the
 * dictamen), so «Deshacer» brings it back with `restoreMarket`, as every
 * deletion; the rest are numbered 1..n again.
 */
export async function deleteComparable(publicId: string, user: AuthUser, comparableId: string) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const current = await findComparable(tx, versionId, comparableId);
    await tx.comparableAvaluo.update({
      where: { IdComparableAvaluo: current.IdComparableAvaluo },
      data: { BIncluido: false, DFechaExclusion: new Date(), SMotivoExclusion: COMPARABLE_REMOVED_REASON },
    });
    await keepInFirmBase(tx, user, [current.IdComparableAvaluo]);
    // Keep references 1..n in capture order, as the dictamen numbers them.
    const remaining = await tx.comparableAvaluo.findMany({
      where: { IdVersionAvaluo: versionId, IdTipoComparable: current.IdTipoComparable, BIncluido: true },
      orderBy: [{ IOrden: "asc" }, { IdComparableAvaluo: "asc" }],
      select: { IdComparableAvaluo: true },
    });
    for (const [index, row] of remaining.entries()) {
      await tx.comparableAvaluo.update({ where: { IdComparableAvaluo: row.IdComparableAvaluo }, data: { IReferencia: index + 1, IOrden: index } });
    }
    await recompute(tx, versionId, current.tipoComparable.SClave as ComparableType);
  });
}

/**
 * A comparable taken out of a market stays in the firm's base (V8.8, 14:23:
 * «si ya eligieron crear ficha… ya se les guarda como comparables y los pueden
 * reutilizar», C-00144 to C-00147): when nothing else of the base holds its
 * number, a copy of its card is kept in the base without a valuation, with the
 * same number, photos and screenshot, and without factors. Numbers are never
 * given again: the copy keeps the one it had.
 */
export async function keepInFirmBase(tx: Tx, user: Pick<AuthUser, "id" | "organizationId">, comparableIds: bigint[]): Promise<number> {
  let kept = 0;
  for (const id of comparableIds) {
    const source = await tx.comparableAvaluo.findUniqueOrThrow({
      where: { IdComparableAvaluo: id },
      include: { ...comparableInclude, tipoComparable: { select: { SClave: true } } },
    });
    const folio = source.propiedad.IFolioComparable;
    if (folio !== null) {
      const held = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT c."IdComparableAvaluo" AS "id" ${FIRM_BASE_FROM}
        WHERE ${firmBaseCondition(user.organizationId)} AND p."IFolioComparable" = ${folio} AND c."IdComparableAvaluo" <> ${id}
        LIMIT 1`);
      if (held.length) continue;
    }
    const type = source.tipoComparable.SClave as ComparableType;
    const { formulas, ...values } = comparableFormValues(await toComparableDto(source, false));
    const payload: ComparableInputPayload = {
      ...values,
      // The factors are of the valuation it left, and so are their formulas.
      formulas: Object.fromEntries(Object.entries(formulas ?? {}).filter(([path]) => !path.startsWith("factors."))),
      factors: [],
    };
    const typeId = await comparableTypeId(tx, type);
    const propertyTypeId = await basePropertyTypeId(tx, type, payload);
    await insertComparable(tx, { kind: "base", typeId, propertyTypeId }, user, type, payload, reusedEvidenceOf(source));
    kept += 1;
  }
  return kept;
}

/** Why a comparable was set aside: taken out of its market, or with its whole market. */
export const SET_ASIDE_REASONS = [COMPARABLE_REMOVED_REASON, MARKET_REMOVED_REASON];

/**
 * The comparables of a market in the order the appraiser gave them (V7.2-14:
 * dragged, or sorted by their unit value): references 1..n and the capture
 * order follow it, and the dictamen numbers them so. The list must be the
 * market's comparables, each once: a list of before (another tab added or
 * removed one) is refused and nothing moves.
 */
export async function reorderComparables(publicId: string, user: AuthUser, type: ComparableType, comparableIds: string[]) {
  await prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const typeId = await comparableTypeId(tx, type);
    const rows = await tx.comparableAvaluo.findMany({
      where: { IdVersionAvaluo: versionId, IdTipoComparable: typeId, BIncluido: true },
      select: { IdComparableAvaluo: true, UIdentificadorPublico: true },
    });
    const position = new Map(comparableIds.map((id, index) => [id, index]));
    if (position.size !== comparableIds.length || rows.length !== comparableIds.length || rows.some((row) => !position.has(row.UIdentificadorPublico))) {
      throw new ValuationWorkflowError("La lista de comparables cambió mientras la ordenabas. Vuelve a abrir el mercado e inténtalo de nuevo.", 409);
    }
    const ordered = [...rows].sort((a, b) => (position.get(a.UIdentificadorPublico) ?? 0) - (position.get(b.UIdentificadorPublico) ?? 0));
    for (const [index, row] of ordered.entries()) {
      await tx.comparableAvaluo.update({ where: { IdComparableAvaluo: row.IdComparableAvaluo }, data: { IReferencia: index + 1, IOrden: index } });
    }
    await recompute(tx, versionId, type);
  });
}

/* ------------------------------------------------------------------ */
/*  Photos                                                             */
/* ------------------------------------------------------------------ */

/** A photo of the property, or the "pantalla de referencia": the screenshot of the listing. */
export type ImageSlot = "photo" | "screenshot";
const IMAGE_USES: Record<ImageSlot, string> = { photo: "FOTO_COMPARABLE", screenshot: "PANTALLA_REFERENCIA" };

/** A comparable may carry a photo more; the caller checked it may be written. */
export function assertRoomForPhoto(row: { JImagenesSnapshot: Prisma.JsonValue | null }, slot: ImageSlot) {
  const photos = Array.isArray(row.JImagenesSnapshot) ? row.JImagenesSnapshot : [];
  if (slot === "photo" && photos.length >= MAX_PHOTOS_PER_COMPARABLE) {
    throw new ValuationWorkflowError(`Cada comparable admite hasta ${MAX_PHOTOS_PER_COMPARABLE} fotografías.`, 400);
  }
}

/** Stores an image of a comparable: a photo after the others, or the screenshot in place of the one it had. */
async function addComparableImage(publicId: string, user: AuthUser, comparableId: string, file: File, slot: ImageSlot) {
  const { avaluo, versionId, comparable } = await prisma.$transaction(async (tx) => {
    const access = await writableVersion(tx, publicId, user);
    const row = await findComparable(tx, access.versionId, comparableId);
    assertRoomForPhoto(row, slot);
    return { ...access, comparable: row };
  });
  const fileId = randomUUID();
  const key = buildComparableAssetKey(avaluo.organizacion.UIdentificadorPublico, publicId, comparableId, "imagenes", fileId, "jpg");
  await storeComparableImage(user, { comparableId, where: { IdComparableAvaluo: comparable.IdComparableAvaluo, IdVersionAvaluo: versionId }, fileId, key, file, slot });
}

/**
 * Uploads the image under `key` and records it on the comparable `where`
 * points to (already checked by the caller): the file row, its relation to
 * the comparable, and the snapshot of its photos or its screenshot. The file
 * is removed when the record fails.
 */
export async function storeComparableImage(user: AuthUser, input: {
  comparableId: string;
  where: Prisma.ComparableAvaluoWhereUniqueInput;
  fileId: string;
  key: string;
  file: File;
  slot: ImageSlot;
}) {
  const { comparableId, where, fileId, file, slot } = input;
  const upload = await saveUpload(file, { key: input.key, generateDownloadUrl: false });

  try {
    await prisma.$transaction(async (tx) => {
      const [fileType, relationType] = await Promise.all([
        catalogId((k) => tx.tipoArchivo.findUnique({ where: { SClave: k } }), "IMAGEN_COMPARABLE", (row) => row.IdTipoArchivo),
        catalogId((k) => tx.tipoRelacionArchivo.findUnique({ where: { SClave: k } }), "COMPARABLE", (row) => row.IdTipoRelacionArchivo),
      ]);
      const stored = await tx.archivo.create({
        data: {
          UIdentificadorPublico: fileId,
          IdOrganizacion: user.organizationId,
          IdUsuarioCarga: user.id,
          IdTipoArchivo: fileType,
          SBucket: upload.bucket,
          SClaveObjeto: upload.key,
          SNombreOriginal: upload.filename,
          SNombreAlmacenado: upload.storedFilename,
          STipoMime: upload.mimeType,
          SExtension: ".jpg",
          ITamanoBytes: BigInt(upload.size),
          SChecksum: upload.checksum,
          BPrivado: true,
          JMetadatos: { uso: IMAGE_USES[slot] },
        },
      });
      await tx.relacionArchivo.create({
        data: {
          IdArchivo: stored.IdArchivo,
          IdTipoRelacionArchivo: relationType,
          SEntidad: COMPARABLE_ENTITY,
          SIdentificadorEntidad: comparableId,
          BPrincipal: false,
          IOrden: 0,
        },
      });
      const current = await tx.comparableAvaluo.findUniqueOrThrow({ where });
      if (slot === "screenshot") {
        // A pasted screenshot comes as "image.png": it is named for what it is.
        const title = "Pantalla de referencia";
        const publication = asRecord(current.JPublicacionSnapshot);
        await tx.comparableAvaluo.update({
          where,
          data: { JPublicacionSnapshot: { ...publication, screenshot: { id: fileId, key: upload.key, title } } as Prisma.InputJsonValue },
        });
        return;
      }
      const photos = Array.isArray(current.JImagenesSnapshot) ? (current.JImagenesSnapshot as PhotoSnapshot[]) : [];
      const title = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Fotografía";
      await tx.comparableAvaluo.update({
        where,
        data: { JImagenesSnapshot: [...photos, { id: fileId, key: upload.key, title }] as Prisma.InputJsonValue },
      });
    });
  } catch (error) {
    await storageProvider.deleteObject(upload.key).catch(() => undefined);
    throw error;
  }
}

export const addComparablePhoto = (publicId: string, user: AuthUser, comparableId: string, file: File) =>
  addComparableImage(publicId, user, comparableId, file, "photo");

/** "Pantalla de referencia": one per comparable; a new one takes the place of the one before. */
export const setComparableScreenshot = (publicId: string, user: AuthUser, comparableId: string, file: File) =>
  addComparableImage(publicId, user, comparableId, file, "screenshot");

/**
 * Removes a photo from this version. The file stays: a concluded version that
 * was copied on reopen may still show it.
 */
export async function removeComparablePhoto(publicId: string, user: AuthUser, comparableId: string, photoId: string) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const current = await findComparable(tx, versionId, comparableId);
    const photos = Array.isArray(current.JImagenesSnapshot) ? (current.JImagenesSnapshot as PhotoSnapshot[]) : [];
    await tx.comparableAvaluo.update({
      where: { IdComparableAvaluo: current.IdComparableAvaluo },
      data: { JImagenesSnapshot: photos.filter((photo) => photo.id !== photoId) as Prisma.InputJsonValue },
    });
  });
}

/**
 * The place and zoom of a photo in its frame of the dictamen, as every image
 * of the document has them («Encuadre» and «Zoom»). Kept in the photo's entry
 * of the comparable's snapshot (no migration); the default framing is not
 * stored. Nothing of the calculation reads it.
 */
export async function setComparablePhotoFraming(publicId: string, user: AuthUser, comparableId: string, photoId: string, framing: ImageFraming | null) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const current = await findComparable(tx, versionId, comparableId);
    const photos = Array.isArray(current.JImagenesSnapshot) ? (current.JImagenesSnapshot as PhotoSnapshot[]) : [];
    if (!photos.some((photo) => photo.id === photoId)) throw new ValuationWorkflowError("Fotografía no encontrada", 404);
    const stored = framing ? readStoredImageFraming(framing) : undefined;
    await tx.comparableAvaluo.update({
      where: { IdComparableAvaluo: current.IdComparableAvaluo },
      data: {
        JImagenesSnapshot: photos.map((photo) => {
          if (photo.id !== photoId) return photo;
          const { framing: _previous, ...rest } = photo;
          return stored ? { ...rest, framing: stored } : rest;
        }) as Prisma.InputJsonValue,
      },
    });
  });
}

/**
 * Video 8.14: the comparable's main photo, the one its ficha prints in
 * «Croquis y fotografías de comparables»; the others keep their place in
 * the gallery. Only one is marked.
 */
export async function setComparableMainPhoto(publicId: string, user: AuthUser, comparableId: string, photoId: string) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const current = await findComparable(tx, versionId, comparableId);
    const photos = Array.isArray(current.JImagenesSnapshot) ? (current.JImagenesSnapshot as PhotoSnapshot[]) : [];
    if (!photos.some((photo) => photo.id === photoId)) throw new ValuationWorkflowError("Fotografía no encontrada", 404);
    await tx.comparableAvaluo.update({
      where: { IdComparableAvaluo: current.IdComparableAvaluo },
      data: {
        JImagenesSnapshot: photos.map((photo) => {
          const { main: _previous, ...rest } = photo;
          return photo.id === photoId ? { ...rest, main: true } : rest;
        }) as Prisma.InputJsonValue,
      },
    });
  });
}

/** Removes the screenshot from this version; as with photos, the file stays. */
export async function removeComparableScreenshot(publicId: string, user: AuthUser, comparableId: string) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const current = await findComparable(tx, versionId, comparableId);
    const publication = asRecord(current.JPublicacionSnapshot);
    await tx.comparableAvaluo.update({
      where: { IdComparableAvaluo: current.IdComparableAvaluo },
      data: { JPublicacionSnapshot: { ...publication, screenshot: null } as Prisma.InputJsonValue },
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Review                                                             */
/* ------------------------------------------------------------------ */

/**
 * The appraiser's review of a comparable in this valuation, with who made it
 * and when. It changes no calculation, so nothing is recomputed.
 */
/** The review as it is stored: the state's name and colour and each check's name as the firm has them today, and who saved it. */
function reviewSnapshotOf(
  payload: ComparableReviewPayload, checklist: Awaited<ReturnType<typeof getComparableReviewSettings>>, user: AuthUser,
): ReviewSnapshot {
  // V8.12: deleting a state or a check later changes no comparable; the review keeps reading the same.
  const status = reviewStatusOf(payload.status, checklist.statuses);
  return {
    status: payload.status,
    statusLabel: status.label,
    statusTone: status.tone,
    checks: payload.checks,
    labels: labelsForReview(payload.checks, checklist),
    notes: payload.notes,
    reviewedBy: user.name,
    reviewedById: user.id,
    reviewedAt: new Date().toISOString(),
  };
}

export async function saveComparableReview(publicId: string, user: AuthUser, comparableId: string, payload: ComparableReviewPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const current = await findComparable(tx, versionId, comparableId);
    const checklist = await getComparableReviewSettings(user.organizationId, tx);
    const review = reviewSnapshotOf(payload, checklist, user);
    await tx.comparableAvaluo.update({
      where: { IdComparableAvaluo: current.IdComparableAvaluo },
      data: { JRevision: review as Prisma.InputJsonValue },
    });
    return reviewOf(review as unknown as Prisma.JsonValue);
  });
}

/**
 * «Revisión en lote» (V8.13, 13:44 to 17:13: «seleccionar todos los de
 * terreno en venta… marcar todas las casillas… el estatus… y guardar
 * revisión», once): the comparables chosen take the same state and, with
 * `markAll`, every check of the firm's list that applies to their market;
 * each keeps its own notes unless notes are given. One transaction: all or none.
 */
export async function saveComparableReviews(publicId: string, user: AuthUser, payload: ComparableBulkReviewPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const checklist = await getComparableReviewSettings(user.organizationId, tx);
    const rows = await tx.comparableAvaluo.findMany({
      where: { UIdentificadorPublico: { in: payload.comparableIds }, IdVersionAvaluo: versionId, BIncluido: true },
      select: { IdComparableAvaluo: true, UIdentificadorPublico: true, JRevision: true, tipoComparable: { select: { SClave: true } } },
    });
    if (rows.length !== new Set(payload.comparableIds).size) throw new ValuationWorkflowError("Algún comparable ya no está en el avalúo; vuelve a abrir la revisión.", 409);
    const saved: Array<{ comparableId: string; review: ComparableReviewDto }> = [];
    for (const row of rows) {
      const before = reviewOf(row.JRevision);
      const type = row.tipoComparable.SClave as ComparableType;
      const kept = Object.fromEntries(Object.entries(before.checks).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
      const checks = payload.markAll ? { ...kept, ...Object.fromEntries(checklistFor(checklist, type).map((check) => [check.key, true])) } : kept;
      const review = reviewSnapshotOf({ status: payload.status, checks, notes: payload.notes === undefined ? before.notes : payload.notes }, checklist, user);
      await tx.comparableAvaluo.update({ where: { IdComparableAvaluo: row.IdComparableAvaluo }, data: { JRevision: review as Prisma.InputJsonValue } });
      saved.push({ comparableId: row.UIdentificadorPublico, review: reviewOf(review as unknown as Prisma.JsonValue) });
    }
    return saved;
  });
}
