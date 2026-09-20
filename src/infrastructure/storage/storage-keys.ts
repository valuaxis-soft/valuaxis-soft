export type OrganizationAssetArea = "perfil" | "usuarios" | "avaluos" | "compartidos";
export type ComparableAssetArea = "imagenes" | "documentos";
export type ValuationExportFormat = "pdf" | "word" | "excel";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function buildOrganizationAssetKey(
  organizationUuid: string,
  area: OrganizationAssetArea,
  assetSegments: readonly string[],
  archivoUuid: string,
  extension: string,
) {
  return buildStorageKey(
    "organizaciones",
    organizationUuid,
    area,
    ...assetSegments,
    buildFileSegment(archivoUuid, extension),
  );
}

export function buildValuationAssetKey(
  organizationUuid: string,
  valuationUuid: string,
  assetSegments: readonly string[],
  archivoUuid: string,
  extension: string,
) {
  return buildOrganizationAssetKey(
    organizationUuid,
    "avaluos",
    [valuationUuid, ...assetSegments],
    archivoUuid,
    extension,
  );
}

export function buildValuationCoverImageKey(
  organizationUuid: string,
  valuationUuid: string,
  archivoUuid: string,
) {
  return buildValuationAssetKey(
    organizationUuid,
    valuationUuid,
    ["caratula", "imagen-principal"],
    archivoUuid,
    "jpg",
  );
}

export function buildValuationDocumentHeaderImageKey(
  organizationUuid: string,
  valuationUuid: string,
  archivoUuid: string,
) {
  return buildValuationAssetKey(
    organizationUuid,
    valuationUuid,
    ["encabezado"],
    archivoUuid,
    "jpg",
  );
}

export function buildValuationDatosImageKey(
  organizationUuid: string,
  valuationUuid: string,
  blockUuid: string,
  subBlockUuid: string | null,
  archivoUuid: string,
) {
  const location = ["secciones", "datos", "bloques", blockUuid];
  if (subBlockUuid) location.push("subbloques", subBlockUuid);
  location.push("imagenes");
  return buildValuationAssetKey(
    organizationUuid,
    valuationUuid,
    location,
    archivoUuid,
    "jpg",
  );
}

export function buildValuationTerrainSketchKey(
  organizationUuid: string,
  valuationUuid: string,
  slot: "macro" | "micro",
  archivoUuid: string,
) {
  return buildValuationAssetKey(
    organizationUuid,
    valuationUuid,
    ["secciones", "info-terreno", "croquis", slot],
    archivoUuid,
    "jpg",
  );
}

export function buildComparableAssetKey(
  organizationUuid: string,
  valuationUuid: string,
  comparableUuid: string,
  area: ComparableAssetArea,
  archivoUuid: string,
  extension: string,
) {
  return buildValuationAssetKey(
    organizationUuid,
    valuationUuid,
    ["comparables", comparableUuid, area],
    archivoUuid,
    extension,
  );
}

export function buildValuationExportKey(
  organizationUuid: string,
  valuationUuid: string,
  format: ValuationExportFormat,
  archivoUuid: string,
  extension: string = format,
) {
  return buildValuationAssetKey(
    organizationUuid,
    valuationUuid,
    ["exportaciones", format],
    archivoUuid,
    extension,
  );
}

function buildStorageKey(...segments: string[]) {
  return segments.map(normalizeStorageSegment).join("/");
}

function buildFileSegment(archivoUuid: string, extension: string) {
  const safeFileUuid = normalizeStorageSegment(archivoUuid);
  const safeExtension = normalizeExtension(extension);
  return `${safeFileUuid}.${safeExtension}`;
}

function normalizeStorageSegment(rawSegment: string) {
  const segment = rawSegment.normalize("NFKC");
  if (!segment) throw new Error("Los segmentos de almacenamiento no pueden estar vacios.");
  if (segment === "." || segment.includes("..")) {
    throw new Error("Los segmentos de almacenamiento no permiten path traversal.");
  }
  if (segment.includes("/") || segment.includes("\\")) {
    throw new Error("Cada segmento de almacenamiento debe ser una sola parte de la ruta.");
  }
  if (/\s/.test(segment)) {
    throw new Error("Los segmentos de almacenamiento no permiten espacios.");
  }
  if (!SAFE_SEGMENT.test(segment)) {
    throw new Error("El segmento de almacenamiento contiene caracteres no permitidos.");
  }
  return segment;
}

function normalizeExtension(rawExtension: string) {
  const extension = rawExtension.startsWith(".") ? rawExtension.slice(1) : rawExtension;
  return normalizeStorageSegment(extension).toLowerCase();
}
