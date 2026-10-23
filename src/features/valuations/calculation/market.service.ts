/**
 * Comparables and market approach of a valuation version: capture, photos,
 * settings, and the stored result with its trace. Reads and writes the version
 * the editor shows (working version, or the final one once concluded).
 */
import { randomUUID } from "node:crypto";
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
import { asRecord, catalogId, decimal, findValuation, formulasOrThrow, writableVersion, type Tx } from "./access";
import { storedFormulas, type CapturedFormulas } from "./captured-formulas";
import { matchOption, optionJustification, optionsFor, resolveFactorCatalog } from "./factor-catalog";
import { recomputeCosts } from "./cost.service";
import { recomputeConclusion } from "./conclusion.service";
import { recomputeIncome } from "./income.service";
import { computeMarketRegression, type MarketRegressionResult } from "./market-regression";
import { withProvenance } from "../comparable-search/normalize";
import { coordinatesError, type ComparableAddress, type OperationType, type UrbanProximity } from "./comparable-card";
import { PENDING_REVIEW, REVIEW_STATUSES, type ComparableReviewDto } from "./comparable-review";
import type { ComparableInputPayload, ComparableReviewPayload, MarketSettingsPayload } from "./market-schemas";
import {
  CUSTOM_FACTOR_KEY,
  OFFER_LEVELS,
  comparableFormValues,
  comparableFormulaValues,
  defaultMarketSettings,
  factorKey,
  homologationBasisOf,
  isLandComparableType,
  isRentComparableType,
  marketEngineConfig,
  offerMarkOf,
  toMarketEngineInput,
  type ComparableDto,
  type ComparableType,
  type FactorSlotConfig,
  type FactorType,
  type MarketCalculationDto,
  type MarketSettingsDto,
} from "./market-types";


const MAX_PHOTOS_PER_COMPARABLE = 6;
const COMPARABLE_ENTITY = "ComparableAvaluo";

type PhotoSnapshot = { id: string; key: string; title: string };
/** A stored photo of a comparable, as another comparable may take it. */
export type StoredComparablePhoto = Omit<PhotoSnapshot, "id">;
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
  factorJustification?: string | null;
  regressionExcluded?: boolean;
  urbanProximity?: UrbanProximity | null;
  operationType?: OperationType | null;
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
  | "regression" | "showHomologationNote" | "homologationNote">> & {
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
  listingText?: string | null;
  /** "Pantalla de referencia": a stored image apart from the photos. */
  screenshot?: PhotoSnapshot | null;
};

/** What a comparable brought from the firm's base keeps of it: its images and its number. */
export type ReusedComparableEvidence = {
  photos?: StoredComparablePhoto[];
  screenshot?: StoredComparablePhoto | null;
  folio?: number | null;
};


async function comparableTypeId(tx: Tx, type: ComparableType) {
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

function addressOf(snapshot: Partial<AddressSnapshot>): ComparableAddress | null {
  const address: ComparableAddress = {
    state: stringOrNull(snapshot.state), municipality: stringOrNull(snapshot.municipality), postalCode: stringOrNull(snapshot.postalCode),
    neighborhood: stringOrNull(snapshot.neighborhood), street: stringOrNull(snapshot.street), number: stringOrNull(snapshot.number),
  };
  return Object.values(address).some(Boolean) ? address : null;
}

/** The stored review, or "por revisar" when there is none. */
function reviewOf(stored: Prisma.JsonValue | null): ComparableReviewDto {
  const review = asRecord(stored) as Partial<ReviewSnapshot>;
  if (!review.status || !(REVIEW_STATUSES as readonly string[]).includes(review.status)) return PENDING_REVIEW;
  return {
    status: review.status,
    checks: review.checks ?? {},
    notes: review.notes ?? null,
    reviewedBy: review.reviewedBy ?? null,
    reviewedAt: review.reviewedAt ?? null,
  };
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
    listingText: publication.listingText ?? null,
    address: addressOf(address),
    urbanProximity: property.urbanProximity ?? null,
    operationType: property.operationType ?? null,
    latitude: numberOrNull(coordinates.latitude),
    longitude: numberOrNull(coordinates.longitude),
    photos: await Promise.all(photos.map(async (photo) => ({
      id: photo.id,
      title: photo.title,
      url: await imageUrl(photo.key, withPhotoUrls),
    }))),
    folio: row.propiedad.IFolioComparable ?? null,
    screenshot: screenshot ? { id: screenshot.id, title: screenshot.title, url: await imageUrl(screenshot.key, withPhotoUrls) } : null,
    review: reviewOf(row.JRevision),
    factors: row.factoresHomologacion.map((factor) => ({
      type: factor.tipoFactorHomologacion.SClave as FactorType,
      // A factor the firm created keeps its key in the name; the others are named by their type.
      ...(CUSTOM_FACTOR_KEY.test(factor.SNombre) ? { key: factor.SNombre } : {}),
      value: decimal(factor.NValor),
      subjectRating: decimal(factor.NCalificacionSujeto),
      comparableRating: decimal(factor.NCalificacionComparable),
      justification: factor.SJustificacion,
    })),
  };
}

async function loadCalculation(tx: Tx, versionId: number, type: ComparableType, withPhotoUrls: boolean) {
  const typeId = await comparableTypeId(tx, type);
  const [approach, rows] = await Promise.all([
    tx.enfoqueMercado.findUnique({ where: { IdVersionAvaluo_IdTipoComparable: { IdVersionAvaluo: versionId, IdTipoComparable: typeId } } }),
    tx.comparableAvaluo.findMany({
      where: { IdVersionAvaluo: versionId, IdTipoComparable: typeId, BIncluido: true },
      include: comparableInclude,
      orderBy: [{ IOrden: "asc" }, { IdComparableAvaluo: "asc" }],
    }),
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
        homologationBasis: homologationBasisOf({ homologationBasis: configuration.homologationBasis, baseArea: decimal(approach.NSuperficieBase) }),
        typicalFrontage: configuration.typicalFrontage ?? null,
        typicalDepth: configuration.typicalDepth ?? null,
        characteristicFields: configuration.characteristicFields ?? null,
        subjectCharacteristics: configuration.subjectCharacteristics ?? {},
        showFactorJustification: configuration.showFactorJustification ?? true,
        regression: configuration.regression ?? null,
        showHomologationNote: configuration.showHomologationNote ?? true,
        homologationNote: configuration.homologationNote ?? null,
        formulas: storedFormulas(configuration.formulas),
      }
    : { ...defaults, formulas: {} };
  const comparables = await Promise.all(rows.map((row) => toComparableDto(row, withPhotoUrls)));
  return { typeId, settings, comparables, configured: approach !== null };
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
    const { settings, comparables, configured } = await loadCalculation(tx, versionId, type, true);
    return { settings, comparables, locked: avaluo.BBloqueado, configured };
  });
}

/* ------------------------------------------------------------------ */
/*  Result and trace                                                   */
/* ------------------------------------------------------------------ */

/** Recomputes the approach with the engine and stores the result and its trace. */
async function recompute(tx: Tx, versionId: number, type: ComparableType) {
  const { typeId, settings, comparables } = await loadCalculation(tx, versionId, type, false);
  const engineInput = toMarketEngineInput({ settings, comparables });
  const calculationKey = `MOTOR.MERCADO.${type}`;
  await tx.ejecucionCalculo.deleteMany({ where: { IdVersionAvaluo: versionId, SClaveCalculo: calculationKey } });

  const trace = new Trace();
  const config = marketEngineConfig(settings);
  const result = engineInput.ok ? computeMarketApproach(engineInput.input, config, trace) : null;
  // The regression is a reference: its steps join the trace, its value changes nothing of the market's.
  const regressionTrace = new Trace();
  const regression = computeMarketRegression({ settings, comparables }, regressionTrace);
  if (regression?.ok) trace.steps.push(...regressionTrace.steps);
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
        ...(regression?.ok ? { regression: regressionSummary(regression.result) } : {}),
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

/** What the execution keeps of the regression: the reference values, not the data the trace already has. */
function regressionSummary({ fit, unitValue, value }: MarketRegressionResult) {
  return {
    method: fit.method,
    n: fit.n,
    coefficients: fit.coefficients,
    estimate: fit.estimate,
    unitValue,
    value,
    rSquared: fit.rSquared,
    standardError: fit.standardError,
  };
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
    ...(settings.showHomologationNote === undefined ? {} : { showHomologationNote: settings.showHomologationNote }),
    homologationNote: settings.homologationNote ?? null,
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

// The ±30 % of the homologated mean and median is a warning, not a lock: the
// appraiser answers for the value adopted (his observations of 13–14 Oct 2026). The panel and the
// engine's `adoptedOutsideLimits` flag it; the value is stored as captured.

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
    await followSubjectRatings(tx, { versionId, typeId, organizationId: user.organizationId, previous: previousSlots, next: payload.factorSlots });
    const homologationBasis = unlessOmitted(payload.homologationBasis, stored.homologationBasis);
    const againstBase = homologationBasisOf({ homologationBasis, baseArea: payload.baseArea }) === "LOTE_TIPO";
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
        showHomologationNote: payload.showHomologationNote ?? stored.showHomologationNote,
        homologationNote: unlessOmitted(payload.homologationNote, stored.homologationNote),
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

/* ------------------------------------------------------------------ */
/*  Comparables                                                        */
/* ------------------------------------------------------------------ */

/**
 * The formulas to keep with a comparable: each one sent must give its field's
 * value; without them, the stored ones of the values that did not change.
 */
function comparableFormulas(payload: ComparableInputPayload, previous: ComparableDto | null) {
  return formulasOrThrow({
    next: comparableFormulaValues(payload),
    sent: payload.formulas,
    previous: previous ? comparableFormulaValues(previous) : {},
    previousFormulas: previous?.formulas ?? {},
  });
}

type StoredSnapshots = {
  property?: Partial<PropertySnapshot>;
  publication?: Partial<PublicationSnapshot>;
  address?: Partial<AddressSnapshot>;
  coordinates?: Partial<LocationSnapshot>;
};

/** The snapshots of a stored comparable, to build on when it is edited. */
const storedSnapshots = (row: Pick<ComparableRow, "JPropiedadSnapshot" | "JPublicacionSnapshot" | "JDireccionSnapshot" | "JUbicacionSnapshot">): StoredSnapshots => ({
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
function snapshots(payload: ComparableInputPayload, formulas: CapturedFormulas, storedRows: StoredSnapshots = {}) {
  const stored = storedRows.property ?? {};
  const storedPublication = storedRows.publication ?? {};
  const coordinates: LocationSnapshot = {
    latitude: unlessOmitted(payload.latitude, numberOrNull(storedRows.coordinates?.latitude)),
    longitude: unlessOmitted(payload.longitude, numberOrNull(storedRows.coordinates?.longitude)),
  };
  const coordinatesProblem = coordinatesError(coordinates.latitude, coordinates.longitude);
  if (coordinatesProblem) throw new ValuationWorkflowError(coordinatesProblem, 400);
  const address = unlessOmitted(payload.address, storedRows.address ? addressOf(storedRows.address) : null);
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
    factorJustification: unlessOmitted(payload.factorJustification, stored.factorJustification),
    ...((payload.regressionExcluded ?? stored.regressionExcluded) ? { regressionExcluded: true } : {}),
    urbanProximity: unlessOmitted(payload.urbanProximity, stored.urbanProximity),
    operationType: unlessOmitted(payload.operationType, stored.operationType),
  };
  const publication: PublicationSnapshot = {
    sourceName: payload.sourceName,
    contactName: payload.contactName,
    contactPhone: payload.contactPhone,
    url: payload.url,
    offerDate: payload.offerDate,
    consultedOn: unlessOmitted(payload.consultedOn, storedPublication.consultedOn),
    validUntil: unlessOmitted(payload.validUntil, storedPublication.validUntil),
    listingText: unlessOmitted(payload.listingText, storedPublication.listingText),
    screenshot: storedPublication.screenshot ?? null,
  };
  return {
    JPropiedadSnapshot: property as Prisma.InputJsonValue,
    JPublicacionSnapshot: publication as Prisma.InputJsonValue,
    // The single line stays what the dictamen prints; the parts travel beside it.
    JDireccionSnapshot: { location: payload.location, ...(address ?? {}) } as Prisma.InputJsonValue,
    // Typed by hand until a map places them.
    JUbicacionSnapshot: coordinates as Prisma.InputJsonValue,
  };
}

/** Land comparables, for sale or rent, carry the land area; buildings the built or the rentable one. */
function areaColumns(type: ComparableType, area: number | null) {
  return {
    NSuperficieTerrenoCapturada: isLandComparableType(type) ? area : null,
    NSuperficieConstruccionCapturada: type === "INMUEBLE_VENTA" ? area : null,
    NSuperficieRentableCapturada: type === "INMUEBLE_RENTA" ? area : null,
  };
}

function propertyColumns(type: ComparableType, payload: ComparableInputPayload) {
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
async function syncPublication(tx: Tx, input: {
  propertyId: number;
  current: bigint | null;
  type: ComparableType;
  payload: ComparableInputPayload;
}) {
  const { payload } = input;
  if (!payload.url) return null;
  const sourceName = (payload.sourceName ?? "Captura manual").slice(0, 180);
  const source = await tx.fuenteInmobiliaria.upsert({ where: { SNombre: sourceName }, create: { SNombre: sourceName }, update: {} });
  const data = {
    IdFuenteInmobiliaria: source.IdFuenteInmobiliaria,
    SURL: payload.url,
    STitulo: payload.location.slice(0, 180),
    NPrecio: payload.price,
    SNombreContacto: payload.contactName,
    STelefonoContacto: payload.contactPhone,
    DFechaPublicacion: payload.offerDate ? new Date(`${payload.offerDate}T12:00:00Z`) : null,
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

async function replaceFactors(tx: Tx, comparableId: bigint, payload: ComparableInputPayload) {
  await tx.factorHomologacion.deleteMany({ where: { IdComparableAvaluo: comparableId } });
  // A surface factor is stored only when the appraiser typed one; otherwise the formula computes it.
  const captured = payload.factors.filter((factor) => factor.type !== "SUPERFICIE" || (factor.value ?? 0) > 0);
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
      const value = factor.subjectRating && factor.comparableRating
        ? factor.subjectRating / factor.comparableRating
        : factor.value ?? 1;
      return {
        IdComparableAvaluo: comparableId,
        IdTipoFactorHomologacion: typeId,
        // The firm's own factors are of type OTRO; the name keeps which one.
        SNombre: factorKey(factor),
        NValor: value,
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
 * Adds one comparable after the last of its type; the caller recomputes.
 * `reused` comes with a comparable brought from the firm's base (a search, a
 * duplicate): it keeps that one's number, and its photos and screenshot share
 * the stored files, as a reopened version shares them, since removing an
 * image never deletes its file. Without it the comparable gets a new number.
 */
async function insertComparable(
  tx: Tx,
  context: { avaluo: { IdAvaluo: number; IdTipoInmueble: number }; versionId: number; typeId: number },
  user: AuthUser,
  type: ComparableType,
  payload: ComparableInputPayload,
  reused: ReusedComparableEvidence = {},
) {
  const { avaluo, versionId, typeId } = context;
  const screenshot = reused.screenshot ? { id: randomUUID(), key: reused.screenshot.key, title: reused.screenshot.title } : null;
  const captured = snapshots(payload, comparableFormulas(payload, null), screenshot ? { publication: { screenshot } } : {});
  const last = await tx.comparableAvaluo.aggregate({
    where: { IdVersionAvaluo: versionId, IdTipoComparable: typeId },
    _max: { IReferencia: true, IOrden: true },
  });
  const property = await tx.propiedad.create({
    data: {
      IdOrganizacion: user.organizationId,
      IdTipoInmueble: avaluo.IdTipoInmueble,
      IFolioComparable: reused.folio ?? await nextComparableFolio(tx, user.organizationId),
      ...propertyColumns(type, payload),
    },
  });
  const publicationId = await syncPublication(tx, { propertyId: property.IdPropiedad, current: null, type, payload });
  const comparable = await tx.comparableAvaluo.create({
    data: {
      IdAvaluo: avaluo.IdAvaluo,
      IdVersionAvaluo: versionId,
      IdPropiedad: property.IdPropiedad,
      IdPublicacionPropiedad: publicationId,
      IdUsuarioSeleccion: user.id,
      IdTipoComparable: typeId,
      IReferencia: (last._max.IReferencia ?? 0) + 1,
      IOrden: (last._max.IOrden ?? -1) + 1,
      NPrecioCapturado: payload.price,
      ...areaColumns(type, payload.area),
      NValorUnitarioCapturado: payload.price && payload.area ? payload.price / payload.area : null,
      ...captured,
      JImagenesSnapshot: (reused.photos ?? []).slice(0, MAX_PHOTOS_PER_COMPARABLE)
        .map((photo) => ({ id: randomUUID(), key: photo.key, title: photo.title })) as Prisma.InputJsonValue,
    },
  });
  await replaceFactors(tx, comparable.IdComparableAvaluo, payload);
  return comparable.UIdentificadorPublico;
}

export async function createComparable(publicId: string, user: AuthUser, type: ComparableType, payload: ComparableInputPayload) {
  return prisma.$transaction(async (tx) => {
    const { avaluo, versionId } = await writableVersion(tx, publicId, user);
    const typeId = await comparableTypeId(tx, type);
    const id = await insertComparable(tx, { avaluo, versionId, typeId }, user, type, payload);
    await recompute(tx, versionId, type);
    return id;
  });
}

/** What a comparable brought from it keeps of a stored one: its photos, screenshot and number. */
export function reusedEvidenceOf(row: {
  JImagenesSnapshot: Prisma.JsonValue | null;
  JPublicacionSnapshot: Prisma.JsonValue | null;
  propiedad: { IFolioComparable: number | null };
}): ReusedComparableEvidence {
  const photos = (Array.isArray(row.JImagenesSnapshot) ? row.JImagenesSnapshot : []).flatMap((item) => {
    const photo = asRecord(item as Prisma.JsonValue);
    return typeof photo.key === "string" && photo.key
      ? [{ key: photo.key, title: typeof photo.title === "string" && photo.title ? photo.title : "Fotografía" }]
      : [];
  });
  const screenshot = storedScreenshot(row.JPublicacionSnapshot);
  return { photos, screenshot: screenshot ? { key: screenshot.key, title: screenshot.title } : null, folio: row.propiedad.IFolioComparable };
}

/**
 * "Usar el existente": adds to the valuation a comparable of the firm's base
 * as it was captured, with its photos, screenshot and number, and the note of
 * where it came from. The source is read only within the user's organization;
 * factors depend on the subject and are rated again.
 */
async function reusedInput(tx: Tx, organizationId: number, sourceId: string) {
  const source = await tx.comparableAvaluo.findFirst({
    where: { UIdentificadorPublico: sourceId, avaluo: { IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null } },
    include: { ...comparableInclude, avaluo: { select: { SFolio: true } } },
  });
  if (!source) throw new ValuationWorkflowError("Comparable no encontrado", 404);
  const { formulas, ...values } = comparableFormValues(await toComparableDto(source, false));
  const payload: ComparableInputPayload = {
    ...withProvenance(values, "Comparables del despacho", `avalúo ${source.avaluo.SFolio}`),
    // The factors stay behind, and so do their formulas.
    formulas: Object.fromEntries(Object.entries(formulas ?? {}).filter(([path]) => !path.startsWith("factors."))),
    factors: [],
  };
  return { payload, reused: reusedEvidenceOf(source) };
}

export async function reuseComparable(publicId: string, user: AuthUser, type: ComparableType, sourceId: string) {
  return prisma.$transaction(async (tx) => {
    const { avaluo, versionId } = await writableVersion(tx, publicId, user);
    const { payload, reused } = await reusedInput(tx, user.organizationId, sourceId);
    const typeId = await comparableTypeId(tx, type);
    const id = await insertComparable(tx, { avaluo, versionId, typeId }, user, type, payload, reused);
    await recompute(tx, versionId, type);
    return id;
  });
}

/**
 * Adds many comparables at once (Excel import, comparables found in a search)
 * and recomputes once; all or none. A found comparable may bring its photos.
 */
export async function importComparables(
  publicId: string,
  user: AuthUser,
  type: ComparableType,
  payloads: Array<(ComparableInputPayload & { reused?: ReusedComparableEvidence }) | { reuseFrom: string }>,
) {
  return prisma.$transaction(async (tx) => {
    const { avaluo, versionId } = await writableVersion(tx, publicId, user);
    const typeId = await comparableTypeId(tx, type);
    for (const entry of payloads) {
      // A row of an import the appraiser answered with "Usar el existente".
      const { payload, reused } = "reuseFrom" in entry
        ? await reusedInput(tx, user.organizationId, entry.reuseFrom)
        : (({ reused: evidence, ...captured }) => ({ payload: captured, reused: evidence }))(entry);
      await insertComparable(tx, { avaluo, versionId, typeId }, user, type, payload, reused);
    }
    await recompute(tx, versionId, type);
    return payloads.length;
  }, { timeout: 60_000 });
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

export async function updateComparable(publicId: string, user: AuthUser, comparableId: string, payload: ComparableInputPayload) {
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
      },
    });
    await replaceFactors(tx, current.IdComparableAvaluo, payload);
    await recompute(tx, versionId, type);
  });
}

export async function deleteComparable(publicId: string, user: AuthUser, comparableId: string) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const current = await findComparable(tx, versionId, comparableId);
    await tx.comparableAvaluo.delete({ where: { IdComparableAvaluo: current.IdComparableAvaluo } });
    // Keep references 1..n in capture order, as the dictamen numbers them.
    const remaining = await tx.comparableAvaluo.findMany({
      where: { IdVersionAvaluo: versionId, IdTipoComparable: current.IdTipoComparable },
      orderBy: [{ IOrden: "asc" }, { IdComparableAvaluo: "asc" }],
      select: { IdComparableAvaluo: true },
    });
    for (const [index, row] of remaining.entries()) {
      await tx.comparableAvaluo.update({ where: { IdComparableAvaluo: row.IdComparableAvaluo }, data: { IReferencia: index + 1, IOrden: index } });
    }
    await recompute(tx, versionId, current.tipoComparable.SClave as ComparableType);
  });
}

/* ------------------------------------------------------------------ */
/*  Photos                                                             */
/* ------------------------------------------------------------------ */

/** A photo of the property, or the "pantalla de referencia": the screenshot of the listing. */
type ImageSlot = "photo" | "screenshot";
const IMAGE_USES: Record<ImageSlot, string> = { photo: "FOTO_COMPARABLE", screenshot: "PANTALLA_REFERENCIA" };

/** Stores an image of a comparable: a photo after the others, or the screenshot in place of the one it had. */
async function addComparableImage(publicId: string, user: AuthUser, comparableId: string, file: File, slot: ImageSlot) {
  const { avaluo, versionId, comparable } = await prisma.$transaction(async (tx) => {
    const access = await writableVersion(tx, publicId, user);
    const row = await findComparable(tx, access.versionId, comparableId);
    const photos = Array.isArray(row.JImagenesSnapshot) ? row.JImagenesSnapshot : [];
    if (slot === "photo" && photos.length >= MAX_PHOTOS_PER_COMPARABLE) {
      throw new ValuationWorkflowError(`Cada comparable admite hasta ${MAX_PHOTOS_PER_COMPARABLE} fotografías.`, 400);
    }
    return { ...access, comparable: row };
  });

  const fileId = randomUUID();
  const key = buildComparableAssetKey(avaluo.organizacion.UIdentificadorPublico, publicId, comparableId, "imagenes", fileId, "jpg");
  const upload = await saveUpload(file, { key, generateDownloadUrl: false });

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
      const current = await tx.comparableAvaluo.findUniqueOrThrow({ where: { IdComparableAvaluo: comparable.IdComparableAvaluo } });
      const where = { IdComparableAvaluo: comparable.IdComparableAvaluo, IdVersionAvaluo: versionId };
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
export async function saveComparableReview(publicId: string, user: AuthUser, comparableId: string, payload: ComparableReviewPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const current = await findComparable(tx, versionId, comparableId);
    const review: ReviewSnapshot = {
      status: payload.status,
      checks: payload.checks,
      notes: payload.notes,
      reviewedBy: user.name,
      reviewedById: user.id,
      reviewedAt: new Date().toISOString(),
    };
    await tx.comparableAvaluo.update({
      where: { IdComparableAvaluo: current.IdComparableAvaluo },
      data: { JRevision: review as Prisma.InputJsonValue },
    });
    return reviewOf(review as unknown as Prisma.JsonValue);
  });
}
