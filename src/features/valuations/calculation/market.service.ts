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
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import { buildComparableAssetKey } from "@/infrastructure/storage/storage-keys";
import { DEFAULT_ENGINE_CONFIG, ENGINE_VERSION } from "../engine/config";
import { computeMarketApproach } from "../engine/market";
import { Trace } from "../engine/trace";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";
import { asRecord, catalogId, decimal, findValuation, writableVersion, type Tx } from "./access";
import { recomputeCosts } from "./cost.service";
import type { ComparableInputPayload, MarketSettingsPayload } from "./market-schemas";
import {
  defaultMarketSettings,
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
type PropertySnapshot = {
  landUse: string | null;
  shape: string | null;
  zone: string | null;
  frontage: number | null;
  depth: number | null;
  topography: string | null;
  services: string | null;
  notes: string | null;
};
type PublicationSnapshot = {
  sourceName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  url: string | null;
  offerDate: string | null;
};


async function comparableTypeId(tx: Tx, type: ComparableType) {
  const row = await tx.tipoComparable.findUnique({ where: { SClave: type }, select: { IdTipoComparable: true } });
  if (!row) throw new ValuationWorkflowError(`Falta el tipo de comparable ${type} en el catálogo.`, 500);
  return row.IdTipoComparable;
}

/* ------------------------------------------------------------------ */
/*  Reading                                                            */
/* ------------------------------------------------------------------ */

const comparableInclude = {
  factoresHomologacion: { include: { tipoFactorHomologacion: { select: { SClave: true } } }, orderBy: { IOrden: "asc" } },
  propiedad: true,
} satisfies Prisma.ComparableAvaluoInclude;

type ComparableRow = Prisma.ComparableAvaluoGetPayload<{ include: typeof comparableInclude }>;

async function toComparableDto(row: ComparableRow, withPhotoUrls: boolean): Promise<ComparableDto> {
  const property = asRecord(row.JPropiedadSnapshot) as Partial<PropertySnapshot>;
  const publication = asRecord(row.JPublicacionSnapshot) as Partial<PublicationSnapshot>;
  const address = asRecord(row.JDireccionSnapshot) as { location?: string };
  const photos = Array.isArray(row.JImagenesSnapshot) ? (row.JImagenesSnapshot as PhotoSnapshot[]) : [];
  return {
    id: row.UIdentificadorPublico,
    reference: row.IReferencia ?? row.IOrden + 1,
    location: address.location ?? row.propiedad.SNombre ?? "",
    area: decimal(row.NSuperficieTerrenoCapturada ?? row.NSuperficieConstruccionCapturada ?? row.NSuperficieRentableCapturada),
    price: decimal(row.NPrecioCapturado),
    landUse: property.landUse ?? null,
    shape: property.shape ?? null,
    zone: property.zone ?? null,
    frontage: property.frontage ?? null,
    depth: property.depth ?? null,
    topography: property.topography ?? null,
    services: property.services ?? null,
    notes: property.notes ?? null,
    sourceName: publication.sourceName ?? null,
    contactName: publication.contactName ?? null,
    contactPhone: publication.contactPhone ?? null,
    url: publication.url ?? null,
    offerDate: publication.offerDate ?? null,
    photos: await Promise.all(photos.map(async (photo) => ({
      id: photo.id,
      title: photo.title,
      url: withPhotoUrls ? await storageProvider.getPrivateDownloadUrl(photo.key).catch(() => "") : "",
    }))),
    factors: row.factoresHomologacion.map((factor) => ({
      type: factor.tipoFactorHomologacion.SClave as FactorType,
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
  const configuration = asRecord(approach?.JConfiguracion ?? null) as { factorSlots?: FactorSlotConfig[]; adoptedUnitValue?: number | null };
  const settings: MarketSettingsDto = approach
    ? {
        comparableType: type,
        subjectArea: decimal(approach.NSuperficieSujeto),
        baseArea: decimal(approach.NSuperficieBase),
        surfacePower: decimal(approach.NPotenciaSuperficie) ?? defaults.surfacePower,
        adoptedUnitValue: configuration.adoptedUnitValue ?? null,
        justification: approach.SJustificacionValor,
        additionalAmount: decimal(approach.NMontoAdicional) ?? 0,
        factorSlots: configuration.factorSlots?.length ? configuration.factorSlots : defaults.factorSlots,
      }
    : defaults;
  const comparables = await Promise.all(rows.map((row) => toComparableDto(row, withPhotoUrls)));
  return { typeId, settings, comparables };
}

export async function getMarketCalculation(publicId: string, organizationId: number, type: ComparableType): Promise<MarketCalculationDto> {
  return prisma.$transaction(async (tx) => {
    const avaluo = await findValuation(tx, publicId, organizationId);
    const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
    if (!versionId) return { settings: defaultMarketSettings(type), comparables: [], locked: avaluo.BBloqueado };
    const { settings, comparables } = await loadCalculation(tx, versionId, type, true);
    return { settings, comparables, locked: avaluo.BBloqueado };
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
  const result = engineInput.ok ? computeMarketApproach(engineInput.input, DEFAULT_ENGINE_CONFIG, trace) : null;
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
      JConfiguracion: { factorSlots: settings.factorSlots, adoptedUnitValue: settings.adoptedUnitValue },
      ...resultColumns,
    },
    update: resultColumns,
  });
  if (!engineInput.ok) {
    if (type === "TERRENO_VENTA") await recomputeCosts(tx, versionId);
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
      JValoresSalida: { value: result?.value ?? null, adoptedUnitValue: result?.adoptedUnitValue ?? null, stats: result?.homologation.stats ?? null } as Prisma.InputJsonValue,
      SPoliticaRedondeo: JSON.stringify(DEFAULT_ENGINE_CONFIG.rounding.market),
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
  // The cost approach values the land with the unit value adopted here.
  if (type === "TERRENO_VENTA") await recomputeCosts(tx, versionId);
}

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */

export async function saveMarketSettings(publicId: string, user: AuthUser, payload: MarketSettingsPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const typeId = await comparableTypeId(tx, payload.comparableType);
    const data = {
      NSuperficieSujeto: payload.subjectArea,
      NSuperficieBase: payload.baseArea,
      NPotenciaSuperficie: payload.surfacePower,
      NMontoAdicional: payload.additionalAmount,
      SJustificacionValor: payload.justification,
      JConfiguracion: { factorSlots: payload.factorSlots, adoptedUnitValue: payload.adoptedUnitValue },
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

function snapshots(payload: ComparableInputPayload) {
  const property: PropertySnapshot = {
    landUse: payload.landUse,
    shape: payload.shape,
    zone: payload.zone,
    frontage: payload.frontage,
    depth: payload.depth,
    topography: payload.topography,
    services: payload.services,
    notes: payload.notes,
  };
  const publication: PublicationSnapshot = {
    sourceName: payload.sourceName,
    contactName: payload.contactName,
    contactPhone: payload.contactPhone,
    url: payload.url,
    offerDate: payload.offerDate,
  };
  return {
    JPropiedadSnapshot: property as Prisma.InputJsonValue,
    JPublicacionSnapshot: publication as Prisma.InputJsonValue,
    JDireccionSnapshot: { location: payload.location } as Prisma.InputJsonValue,
    // No coordinates yet: geocoding comes with the comparable search.
    JUbicacionSnapshot: { latitude: null, longitude: null } as Prisma.InputJsonValue,
  };
}

function areaColumns(type: ComparableType, area: number | null) {
  return {
    NSuperficieTerrenoCapturada: type === "TERRENO_VENTA" ? area : null,
    NSuperficieConstruccionCapturada: type === "INMUEBLE_VENTA" ? area : null,
    NSuperficieRentableCapturada: type === "INMUEBLE_RENTA" ? area : null,
  };
}

function propertyColumns(type: ComparableType, payload: ComparableInputPayload) {
  return {
    SNombre: payload.location.slice(0, 180),
    NSuperficieTerreno: type === "TERRENO_VENTA" ? payload.area : null,
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
  };
  if (input.current) {
    await tx.publicacionPropiedad.update({ where: { IdPublicacionPropiedad: input.current }, data });
    return input.current;
  }
  const [operation, state] = await Promise.all([
    catalogId((key) => tx.tipoOperacion.findUnique({ where: { SClave: key } }), input.type === "INMUEBLE_RENTA" ? "RENTA" : "VENTA", (row) => row.IdTipoOperacion),
    catalogId((key) => tx.estadoPublicacion.findUnique({ where: { SClave: key } }), "ACTIVA", (row) => row.IdEstadoPublicacion),
  ]);
  const created = await tx.publicacionPropiedad.create({
    data: { ...data, IdPropiedad: input.propertyId, IdTipoOperacion: operation, IdEstadoPublicacion: state },
  });
  return created.IdPublicacionPropiedad;
}

async function replaceFactors(tx: Tx, comparableId: bigint, payload: ComparableInputPayload) {
  await tx.factorHomologacion.deleteMany({ where: { IdComparableAvaluo: comparableId } });
  const captured = payload.factors.filter((factor) => factor.type !== "SUPERFICIE");
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
        SNombre: factor.type,
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

export async function createComparable(publicId: string, user: AuthUser, type: ComparableType, payload: ComparableInputPayload) {
  return prisma.$transaction(async (tx) => {
    const { avaluo, versionId } = await writableVersion(tx, publicId, user);
    const typeId = await comparableTypeId(tx, type);
    const last = await tx.comparableAvaluo.aggregate({
      where: { IdVersionAvaluo: versionId, IdTipoComparable: typeId },
      _max: { IReferencia: true, IOrden: true },
    });
    const property = await tx.propiedad.create({
      data: { IdOrganizacion: user.organizationId, IdTipoInmueble: avaluo.IdTipoInmueble, ...propertyColumns(type, payload) },
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
        ...snapshots(payload),
        JImagenesSnapshot: [],
      },
    });
    await replaceFactors(tx, comparable.IdComparableAvaluo, payload);
    await recompute(tx, versionId, type);
    return comparable.UIdentificadorPublico;
  });
}

export async function updateComparable(publicId: string, user: AuthUser, comparableId: string, payload: ComparableInputPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const current = await findComparable(tx, versionId, comparableId);
    const type = current.tipoComparable.SClave as ComparableType;
    await tx.propiedad.update({ where: { IdPropiedad: current.IdPropiedad }, data: propertyColumns(type, payload) });
    const publicationId = await syncPublication(tx, {
      propertyId: current.IdPropiedad,
      current: current.IdPublicacionPropiedad,
      type,
      payload,
    });
    await tx.comparableAvaluo.update({
      where: { IdComparableAvaluo: current.IdComparableAvaluo },
      data: {
        IdPublicacionPropiedad: publicationId,
        NPrecioCapturado: payload.price,
        ...areaColumns(type, payload.area),
        NValorUnitarioCapturado: payload.price && payload.area ? payload.price / payload.area : null,
        ...snapshots(payload),
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

export async function addComparablePhoto(publicId: string, user: AuthUser, comparableId: string, file: File) {
  const { avaluo, versionId, comparable } = await prisma.$transaction(async (tx) => {
    const access = await writableVersion(tx, publicId, user);
    const row = await findComparable(tx, access.versionId, comparableId);
    const photos = Array.isArray(row.JImagenesSnapshot) ? row.JImagenesSnapshot : [];
    if (photos.length >= MAX_PHOTOS_PER_COMPARABLE) {
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
          JMetadatos: { uso: "FOTO_COMPARABLE" },
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
      const photos = Array.isArray(current.JImagenesSnapshot) ? (current.JImagenesSnapshot as PhotoSnapshot[]) : [];
      const title = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Fotografía";
      await tx.comparableAvaluo.update({
        where: { IdComparableAvaluo: comparable.IdComparableAvaluo, IdVersionAvaluo: versionId },
        data: { JImagenesSnapshot: [...photos, { id: fileId, key: upload.key, title }] as Prisma.InputJsonValue },
      });
    });
  } catch (error) {
    await storageProvider.deleteObject(upload.key).catch(() => undefined);
    throw error;
  }
}

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
