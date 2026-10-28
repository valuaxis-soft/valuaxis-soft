/**
 * The master comparables workbook ("Plantilla maestra de comparables"): one
 * listing per row, of any type, in the columns the appraiser designed with
 * the firm (Valuaxis_Comparables_INICIO v1.1), to import into a valuation,
 * into the firm's base, or both, and to export back the same way. Pure: the
 * columns, the catalogs, reading a row into a comparable with its errors and
 * warnings, and writing a comparable back into a row. The files themselves
 * are in comparable-workbook.ts.
 *
 * The client's rule: compute and warn, never restrict. A row is skipped only
 * when it cannot be stored (no location, a value that is not a number, a
 * catalog value Valuaxis cannot map); everything else is a warning.
 */
import {
  CONSERVATION_OPTIONS,
  CONSTRUCTION_TYPE_SUGGESTIONS,
  DATA_VERIFIED_LABELS,
  OPERATION_TYPE_LABELS,
  QUALITY_OPTIONS,
  UNIT_BASIS_LABELS,
  URBAN_PROXIMITIES,
  URBAN_PROXIMITY_LABELS,
  coordinatesError,
  formatAddress,
  formatComparableId,
  hasAddress,
  parseComparableId,
  unitPriceByBasis,
  type ComparableAddress,
  type Currency,
  type DataVerified,
  type OperationType,
  type UnitBasis,
} from "./comparable-card";
import { canonicalUrlKey } from "./comparable-duplicates";
import { cellDate, cellNumber, cellText, friendlyMessage, MAX_IMPORT_ROWS, normalizeHeader, type CellValue } from "./comparable-import";
import { comparableInputSchema, type ComparableInputPayload } from "./market-schemas";
import { isLandComparableType, isRentComparableType, type ComparableDto, type ComparableType } from "./market-types";

/** Shown in the INICIO sheet and the DICCIONARIO; a file of another version still imports by its headers. */
export const MASTER_TEMPLATE_VERSION = "1.1";
export const MASTER_SHEET = "COMPARABLES";
export const START_SHEET = "INICIO";
/** Row of the headers in the COMPARABLES sheet, as in the appraiser's workbook (title, note, groups, headers). */
export const MASTER_HEADER_ROW = 6;

/* ------------------------------------------------------------------ */
/*  Destination                                                        */
/* ------------------------------------------------------------------ */

/** "¿Dónde se usarán estos registros?" of the INICIO sheet. */
export const IMPORT_DESTINATIONS = ["AMBOS", "AVALUO", "BASE"] as const;
export type ImportDestination = (typeof IMPORT_DESTINATIONS)[number];
export const IMPORT_DESTINATION_LABELS: Record<ImportDestination, string> = {
  AMBOS: "Ambos",
  AVALUO: "Solo avalúo",
  BASE: "Solo base general",
};

/** "Solo avalúo", "solo base general", "Ambos" (any case or accents) → the destination; anything else → null. */
export function parseDestination(text: string | null | undefined): ImportDestination | null {
  const key = normalizeHeader(text ?? "");
  if (key === "ambos") return "AMBOS";
  if (key === "soloavaluo" || key === "avaluo") return "AVALUO";
  if (key === "solobasegeneral" || key === "basegeneral" || key === "base") return "BASE";
  return null;
}

export const includesValuation = (destination: ImportDestination) => destination !== "BASE";
export const includesBase = (destination: ImportDestination) => destination !== "AVALUO";

/* ------------------------------------------------------------------ */
/*  Catalogs                                                           */
/* ------------------------------------------------------------------ */

/** "Estado de uso": the appraiser accepts or discards each listing; a discarded one is not imported. */
export const USE_STATUSES = ["PENDIENTE", "ACEPTADO", "DESCARTADO"] as const;
export type UseStatus = (typeof USE_STATUSES)[number];
export const USE_STATUS_LABELS: Record<UseStatus, string> = { PENDIENTE: "Pendiente", ACEPTADO: "Aceptado", DESCARTADO: "Descartado" };

export const RENT_PERIODS = ["NO_APLICA", "MENSUAL", "ANUAL"] as const;
export type RentPeriod = (typeof RENT_PERIODS)[number];
export const RENT_PERIOD_LABELS: Record<RentPeriod, string> = { NO_APLICA: "No aplica", MENSUAL: "Mensual", ANUAL: "Anual" };

/** "Terreno" for land; the rest are Valuaxis's types of construction, so a row maps 1:1 to a comparable type. */
export const PROPERTY_TYPE_OPTIONS = ["Terreno", ...CONSTRUCTION_TYPE_SUGGESTIONS, "Otro"];

/** A type of inmueble that is land: "Terreno", "Terreno rústico", "Lote", "Predio", "Rancho", "Parcela". */
export const isLandPropertyType = (text: string) => /^(terreno|lote|predio|rancho|parcela)/.test(normalizeHeader(text));

const MEXICAN_STATES = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas", "Chihuahua", "Ciudad de México", "Coahuila",
  "Colima", "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Estado de México", "Michoacán", "Morelos", "Nayarit",
  "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora", "Tabasco", "Tamaulipas",
  "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
];

/**
 * The lists of the CATALOGOS sheet. Valuaxis's own where it has one (types,
 * operation, proximity, conservation, unit basis, currency, review), so a row
 * maps 1:1; the appraiser's workbook for the rest, which Valuaxis keeps as
 * written (a value outside the list is accepted: `strict` is false).
 */
export const MASTER_CATALOGS = {
  useStatus: { title: "Estado de uso", options: USE_STATUSES.map((status) => USE_STATUS_LABELS[status]), strict: true },
  propertyType: { title: "Tipo de inmueble", options: PROPERTY_TYPE_OPTIONS, strict: false },
  operation: { title: "Operación", options: Object.values(OPERATION_TYPE_LABELS), strict: true },
  dataOrigin: { title: "Origen de dato", options: ["Manual", "Portal inmobiliario", "Corredor", "Visita de campo", "Base propia", "Otro"], strict: false },
  sourceName: {
    title: "Portal / fuente",
    options: ["Inmuebles24", "Mercado Libre", "Vivanuncios", "Lamudi", "Propiedades.com", "Facebook Marketplace", "Página inmobiliaria", "Anuncio físico", "Otro"],
    strict: false,
  },
  state: { title: "Estado", options: MEXICAN_STATES, strict: false },
  landUse: { title: "Uso de suelo", options: ["Habitacional", "Comercial", "Mixto", "Industrial", "Equipamiento", "Agrícola", "Ganadero", "Forestal", "Otro", "Sin dato"], strict: false },
  zone: { title: "Tipo de zona", options: ["Calle tipo", "Calle superior", "Calle inferior", "Avenida", "Esquina", "Zona consolidada", "En desarrollo", "Otro"], strict: false },
  urbanProximity: { title: "Proximidad urbana", options: URBAN_PROXIMITIES.map((item) => URBAN_PROXIMITY_LABELS[item]), strict: true },
  shape: { title: "Forma", options: ["Regular", "Irregular", "Trapezoidal", "Triangular", "Otra", "Sin dato"], strict: false },
  topography: { title: "Topografía", options: ["Plano (<6%)", "Lomerío suave (6%-12%)", "Lomerío fuerte (>12%)", "Accidentado", "Otro", "Sin dato"], strict: false },
  services: { title: "Servicios", options: ["Completos", "Incompletos", "Sin servicios", "Sin dato"], strict: false },
  paving: { title: "Pavimento", options: ["Concreto", "Asfalto", "Adoquín", "Empedrado", "Terracería", "Sin acceso", "Otro"], strict: false },
  blockPosition: { title: "Posición", options: ["Intermedio", "Esquina", "Cabecera", "Manzana completa", "Otra"], strict: false },
  quality: { title: "Calidad", options: QUALITY_OPTIONS, strict: false },
  conservation: { title: "Conservación", options: CONSERVATION_OPTIONS, strict: false },
  currency: { title: "Moneda", options: ["MXN", "USD"], strict: true },
  rentPeriod: { title: "Periodo renta", options: RENT_PERIODS.map((period) => RENT_PERIOD_LABELS[period]), strict: true },
  unitBasis: { title: "Base del unitario", options: Object.values(UNIT_BASIS_LABELS), strict: true },
  extractionConfidence: { title: "Confianza", options: ["Alta", "Media", "Baja", "No aplica"], strict: false },
  verified: { title: "Verificados", options: Object.values(DATA_VERIFIED_LABELS), strict: true },
} satisfies Record<string, { title: string; options: string[]; strict: boolean }>;
export type MasterCatalog = keyof typeof MASTER_CATALOGS;

/* ------------------------------------------------------------------ */
/*  Columns                                                            */
/* ------------------------------------------------------------------ */

export const MASTER_GROUPS = [
  "Control y trazabilidad", "Ubicación", "Terreno", "Construcciones", "Precio de oferta", "Publicación / fuente", "Control de calidad",
] as const;

type Kind = "text" | "number" | "integer" | "date" | "url" | "catalog" | "formula";
type Required = "Sí" | "No" | "Cond." | "Auto";

export type MasterColumn = {
  key: string;
  header: string;
  /** Index in MASTER_GROUPS. */
  group: number;
  /** The stable key of the DICCIONARIO sheet. */
  apiKey: string;
  kind: Kind;
  required: Required;
  rule: string;
  width: number;
  catalog?: MasterCatalog;
  /** Other headers that mean this column (normalized), from the per-market template and common wording. */
  aliases?: string[];
  /**
   * A column most captures leave empty: the workbook groups it with Excel's
   * outline, collapsed, so the sheet opens with the essential ones.
   */
  advanced?: boolean;
};

const column = (
  key: string, header: string, group: number, apiKey: string, kind: Kind, required: Required, rule: string,
  extra: Partial<Pick<MasterColumn, "catalog" | "aliases" | "width" | "advanced">> = {},
): MasterColumn => ({ key, header, group, apiKey, kind, required, rule, width: extra.width ?? (kind === "text" ? 20 : 14), ...extra });

export const MASTER_COLUMNS: MasterColumn[] = [
  column("ref", "REF / ID", 0, "comparable_id", "text", "No", "El número del comparable en Valuaxis (C-00123). Vacío en uno nuevo: Valuaxis le da uno al importarlo. Si trae el número, se ofrece unirlo con ese comparable.", { width: 11, aliases: ["ref", "id", "referencia"] }),
  column("valuationFolio", "Folio avalúo", 0, "avaluo_folio", "text", "No", "Folio del avalúo al que se asocia el comparable. Importando desde Comparables con destino «Ambos» o «Solo avalúo», el renglón se agrega a ese avalúo.", { width: 14, aliases: ["folio", "foliodelavaluo"] }),
  column("useStatus", "Estado de uso", 0, "estado_uso", "catalog", "Sí", "Pendiente se importa por revisar; Aceptado con datos verificados «Sí» se importa verificado si quien importa puede revisar comparables; Descartado no se importa.", { catalog: "useStatus", width: 13 }),
  column("propertyType", "Tipo de inmueble", 0, "tipo_inmueble", "catalog", "Cond.", "Terreno, o el tipo de construcción. Con la operación decide el mercado: terrenos o inmuebles, en venta o en renta. Importando desde un mercado, vacío es el de ese mercado.", { catalog: "propertyType", width: 18, aliases: ["tipodecomparable"] }),
  column("operation", "Operación", 0, "operacion", "catalog", "Cond.", "Venta o Renta.", { catalog: "operation", width: 11, aliases: ["tipodeoperacion"] }),
  column("dataOrigin", "Origen de dato", 0, "origen_dato", "catalog", "No", "Procedencia del registro. Si es «Portal inmobiliario», avisa cuando falta la URL.", { catalog: "dataOrigin", width: 16, advanced: true }),
  column("sourceName", "Portal / fuente", 0, "portal_fuente", "catalog", "No", "Portal, inmobiliaria o persona. Con el ID de publicación identifica el anuncio.", { catalog: "sourceName", width: 18, aliases: ["fuente", "portal"] }),
  column("publicationId", "ID publicación", 0, "id_publicacion", "text", "No", "Identificador del anuncio en el portal. El mismo portal con el mismo ID es el mismo comparable.", { width: 16, aliases: ["idanuncio", "iddepublicacion"], advanced: true }),
  column("consultedOn", "Fecha de consulta", 0, "fecha_consulta", "date", "No", "Día en que se consultó o verificó la oferta (dd/mm/aaaa).", { aliases: ["fechaconsulta"] }),
  column("offerDate", "Fecha publicación", 0, "fecha_publicacion", "date", "No", "Fecha del anuncio, si el portal la informa. Es la «fecha de la oferta» del comparable.", { aliases: ["fechadepublicacion", "fechadelaoferta", "fecha"] }),
  column("street", "Calle y número", 1, "ubicacion_calle", "text", "Cond.", "Calle y número. Con colonia, municipio y estado forma la ubicación si «Ubicación (como se imprime)» queda vacía.", { width: 30, aliases: ["ubicacioncalle", "calle", "callenumero"] }),
  column("neighborhood", "Colonia / localidad", 1, "colonia", "text", "No", "", { width: 20, aliases: ["colonia", "localidad"] }),
  column("subdivision", "Fraccionamiento", 1, "fraccionamiento", "text", "No", "Opcional. Con la colonia y el municipio sirve para encontrar duplicados y para buscar.", { width: 20, aliases: ["fracc", "fraccionamientoocoto", "coto"] }),
  column("municipality", "Municipio", 1, "municipio", "text", "No", "Sin municipio, la búsqueda por lugar no lo encuentra (aviso).", { width: 18, aliases: ["municipiooalcaldia", "alcaldia"] }),
  column("state", "Estado", 1, "estado", "catalog", "No", "Entidad federativa.", { catalog: "state", width: 16, aliases: ["entidad"] }),
  column("postalCode", "Código postal", 1, "codigo_postal", "text", "No", "Cinco dígitos; se guarda como texto para conservar los ceros.", { width: 11, aliases: ["cp"] }),
  column("latitude", "Latitud", 1, "latitud", "number", "No", "Grados decimales; latitud y longitud van juntas o ninguna.", { width: 11, advanced: true }),
  column("longitude", "Longitud", 1, "longitud", "number", "No", "Grados decimales, negativa en México.", { width: 11, advanced: true }),
  column("location", "Ubicación (como se imprime)", 1, "ubicacion_dictamen", "text", "Cond.", "La línea que imprime el dictamen. Vacía, Valuaxis la arma con las partes. Hace falta esta o la calle.", { width: 36, aliases: ["ubicacion", "direccion", "domicilio"] }),
  column("landUse", "Uso de suelo", 1, "uso_suelo", "catalog", "No", "El uso declarado o el del plan; no se confunde con la normativa verificada.", { catalog: "landUse", width: 16, aliases: ["uso"] }),
  column("landUseKey", "Clave de uso de suelo", 1, "clave_uso_suelo", "text", "No", "La clave del plan, por ejemplo AU-I/H-3.", { width: 14, aliases: ["clave"], advanced: true }),
  column("zone", "Tipo de zona", 1, "tipo_zona", "catalog", "No", "Calle tipo, superior, inferior…", { catalog: "zone", width: 15, aliases: ["zona"] }),
  column("urbanProximity", "Proximidad urbana (SHF)", 1, "proximidad_urbana", "catalog", "No", "1 Céntrica a 5 Rural, como las reglas de la SHF.", { catalog: "urbanProximity", width: 16, aliases: ["proximidadurbana"], advanced: true }),
  column("landArea", "Sup. terreno (m²)", 2, "superficie_terreno_m2", "number", "Cond.", "Requerida cuando el unitario es por terreno; en terrenos es la superficie del cálculo.", { aliases: ["superficiedelterrenom2", "superficiedeterrenom2", "supterreno", "superficieterreno"] }),
  column("frontage", "Frente (m)", 2, "frente_m", "number", "No", "Metros."),
  column("depth", "Fondo (m)", 2, "fondo_m", "number", "No", "Metros."),
  column("frontCount", "N.º de frentes", 2, "numero_frentes", "integer", "No", "Entero: 1, 2…", { aliases: ["numerodefrentes", "nfrentes"], advanced: true }),
  column("shape", "Forma", 2, "forma", "catalog", "No", "", { catalog: "shape" }),
  column("topography", "Topografía", 2, "topografia", "catalog", "No", "", { catalog: "topography", width: 18 }),
  column("services", "Servicios", 2, "servicios", "catalog", "No", "", { catalog: "services" }),
  column("paving", "Pavimento / acceso", 2, "pavimento", "catalog", "No", "", { catalog: "paving", advanced: true }),
  column("blockPosition", "Posición en manzana", 2, "posicion_manzana", "catalog", "No", "", { catalog: "blockPosition", advanced: true }),
  column("builtArea", "Sup. construcción (m²)", 3, "superficie_construccion_m2", "number", "Cond.", "Requerida cuando el unitario es por construcción; en inmuebles es la superficie del cálculo (en rentas, la rentable).", { aliases: ["superficieconstruidam2", "superficierentablem2", "supconstruccion"] }),
  column("age", "Edad (años)", 3, "edad_anos", "number", "No", "Declarada o estimada; no es la edad efectiva.", { aliases: ["edad"] }),
  column("quality", "Calidad", 3, "calidad_construccion", "catalog", "No", "", { catalog: "quality" }),
  column("conservation", "Conservación", 3, "estado_conservacion", "catalog", "No", "", { catalog: "conservation", aliases: ["estadodeconservacion"] }),
  column("levels", "Niveles", 3, "niveles", "integer", "No", "Entero.", { width: 10, advanced: true }),
  column("bedrooms", "Recámaras", 3, "recamaras", "integer", "No", "Entero.", { width: 11 }),
  column("bathrooms", "Baños", 3, "banos", "number", "No", "Enteros o medios: 2.5 para dos baños y medio.", { width: 10, aliases: ["banoscompletos"] }),
  column("parking", "Estacionamientos", 3, "estacionamientos", "integer", "No", "Entero.", { width: 12, advanced: true }),
  column("price", "Precio de oferta", 4, "precio_oferta", "number", "Sí", "Solo el número. En rentas, puedes usar «Renta mensual» o «Renta anual» en su lugar; si solo llenas este, es la renta del periodo indicado. Sin precio se importa, pero no entra al cálculo hasta completarlo (aviso).", { width: 16, aliases: ["precio", "preciodeoferta", "oferta"] }),
  column("monthlyRent", "Renta mensual", 4, "renta_mensual", "number", "Cond.", "En rentas: la renta de un mes. Si falta y hay renta anual, Valuaxis la calcula (anual entre 12). Es la que se guarda.", { width: 14, aliases: ["rentamensual"] }),
  column("annualRent", "Renta anual", 4, "renta_anual", "number", "Cond.", "En rentas: la renta de un año. Si falta y hay renta mensual, se calcula (mensual por 12). Si traen las dos y no cuadran, manda la mensual (aviso).", { width: 14, aliases: ["rentaanual"] }),
  column("currency", "Moneda", 4, "moneda", "catalog", "No", "MXN o USD; vacía es MXN. Se guarda como está, sin convertir; un precio en USD lleva aviso.", { catalog: "currency", width: 9, advanced: true }),
  column("rentPeriod", "Periodo renta", 4, "periodicidad_renta", "catalog", "Cond.", "En rentas, cuando la renta va en «Precio de oferta»: mensual o anual. Valuaxis guarda la renta mensual: una anual se divide entre 12 (aviso).", { catalog: "rentPeriod", width: 12, aliases: ["periododerenta"], advanced: true }),
  column("unitBasis", "Base del unitario", 4, "base_unitario", "catalog", "No", "Terreno m², Construcción m² o Terreno ha. Vacía: terreno m² en terrenos, construcción m² en inmuebles.", { catalog: "unitBasis", width: 15, advanced: true }),
  column("unitPrice", "Precio unitario (auto)", 4, "precio_unitario", "formula", "Auto", "Precio entre el área de la base. Es una ayuda: Valuaxis lo vuelve a calcular y no lee esta columna. No es homologación.", { width: 16 }),
  column("priceChangedOn", "Fecha cambio de precio", 4, "fecha_precio", "date", "No", "Última fecha comprobable en que cambió la oferta.", { advanced: true }),
  column("url", "URL de publicación", 5, "url_publicacion", "url", "Cond.", "Empieza con http:// o https://. Se compara sin parámetros ni fragmento para encontrar duplicados.", { width: 34, aliases: ["ligadelanuncio", "liga", "url", "enlace", "link"] }),
  column("photoUrl", "URL fotografía", 5, "url_fotografia", "url", "No", "Liga a la foto; no se descarga ni se incrusta.", { width: 26, advanced: true }),
  column("contactName", "Contacto / anunciante", 5, "contacto", "text", "No", "Dato sensible: solo lo exportan quienes pueden editar comparables y no entra a estadísticas.", { aliases: ["contacto", "anunciante", "oferente"] }),
  column("contactPhone", "Teléfono", 5, "telefono", "text", "No", "Dato sensible; se guarda como texto.", { width: 15, aliases: ["telefono", "tel", "celular"] }),
  column("description", "Descripción anunciada", 5, "descripcion_portal", "text", "No", "Resumen del anuncio; se guarda como el texto del anuncio del comparable.", { width: 34, aliases: ["descripcion"] }),
  column("notes", "Notas del perito", 5, "observaciones", "text", "No", "Aclaraciones verificadas, ofertas duplicadas, etc.", { width: 30, aliases: ["observaciones", "notas", "comentarios"] }),
  column("extractionConfidence", "Confianza extracción", 6, "confianza_extraccion", "catalog", "No", "Nivel técnico de la extracción, no calidad valuatoria.", { catalog: "extractionConfidence", advanced: true }),
  column("verified", "Datos verificados", 6, "datos_verificados", "catalog", "No", "Sí / No / Parcialmente.", { catalog: "verified", width: 12 }),
  column("reviewedBy", "Revisó", 6, "revisado_por", "text", "No", "Quien validó el registro.", { width: 16, advanced: true }),
  column("reviewedOn", "Fecha revisión", 6, "fecha_revision", "date", "No", "", { advanced: true }),
  column("control", "Control automático", 6, "control_automatico", "formula", "Auto", "Alerta mínima de captura; no sustituye la revisión del perito. Valuaxis repite estas alertas al importar.", { width: 20 }),
];

/** Spreadsheet column letters: 0 → A, 26 → AA. */
export function columnLetter(index: number): string {
  let letters = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  return letters;
}

export const masterLetter = (key: string) => columnLetter(MASTER_COLUMNS.findIndex((item) => item.key === key));

/** The unit price formula of one row, as the appraiser's workbook writes it. */
export function unitPriceFormula(row: number) {
  const [price, basis, land, built] = ["price", "unitBasis", "landArea", "builtArea"].map((key) => `${masterLetter(key)}${row}`);
  return `IF(OR(${price}="",${basis}=""),"",IF(${basis}="Construcción m²",IFERROR(${price}/${built},""),IF(${basis}="Terreno ha",IFERROR(${price}/(${land}/10000),""),IFERROR(${price}/${land},""))))`;
}

/** The "Control automático" formula of one row: the first thing missing, or OK. */
export function controlFormula(row: number) {
  const at = (key: string) => `${masterLetter(key)}${row}`;
  const [type, operation, street, location, price, basis, built, land, origin, url, verified] =
    ["propertyType", "operation", "street", "location", "price", "unitBasis", "builtArea", "landArea", "dataOrigin", "url", "verified"].map(at);
  return `IF(COUNTA(${type},${operation},${street},${location},${price})=0,"",IF(${type}="","FALTA TIPO",IF(${operation}="","FALTA OPERACIÓN",`
    + `IF(AND(${street}="",${location}=""),"FALTA UBICACIÓN",IF(${price}="","FALTA PRECIO",IF(${basis}="","FALTA BASE",`
    + `IF(AND(${basis}="Construcción m²",OR(${built}="",${built}<=0)),"REVISAR ÁREA CONST.",`
    + `IF(AND(${basis}<>"Construcción m²",OR(${land}="",${land}<=0)),"REVISAR ÁREA TERR.",`
    + `IF(AND(${origin}="Portal inmobiliario",${url}=""),"FALTA URL",IF(${verified}="","PENDIENTE VERIFICAR","OK"))))))))))`;
}

/* ------------------------------------------------------------------ */
/*  Reading                                                            */
/* ------------------------------------------------------------------ */

const headerKeys = new Map<string, string>();
for (const item of MASTER_COLUMNS) {
  for (const name of [normalizeHeader(item.header), ...(item.aliases ?? [])]) if (!headerKeys.has(name)) headerKeys.set(name, item.key);
}
/** Headers only the master workbook has: with three of them, a sheet is the master one. */
const MASTER_ONLY = new Set(["useStatus", "propertyType", "operation", "valuationFolio", "ref", "publicationId", "unitBasis", "verified", "builtArea", "currency"]);

/** Which column holds each field of the master workbook in a header row (each column once, first match wins). */
function masterPositions(headerRow: CellValue[]) {
  const positions = new Map<string, number>();
  headerRow.forEach((cell, index) => {
    const key = headerKeys.get(normalizeHeader(cellText(cell)));
    if (key && !positions.has(key)) positions.set(key, index);
  });
  return positions;
}

/** The index of the master workbook's header row among the first rows, or -1 when the sheet is not one. */
export function findMasterHeader(sheet: CellValue[][]) {
  for (let index = 0; index < Math.min(sheet.length, 15); index += 1) {
    const positions = masterPositions(sheet[index] ?? []);
    if ([...positions.keys()].filter((key) => MASTER_ONLY.has(key)).length >= 3) return index;
  }
  return -1;
}

/** One row of a sheet, read: a comparable ready to save (or why not), what to look at, and where it goes. */
export type SheetRow = {
  row: number;
  type: ComparableType | null;
  payload: ComparableInputPayload | null;
  errors: string[];
  warnings: string[];
  summary: { location: string; area: number | null; price: number | null; unitPrice: number | null; currency: Currency | null };
  /** "Folio avalúo" as written. */
  valuationFolio: string | null;
  /** The comparable's number in "REF / ID" (C-00123), when it is one. */
  folio: number | null;
  useStatus: UseStatus;
  verified: DataVerified | null;
  reviewedBy: string | null;
  reviewedOn: string | null;
};

export type MasterParse = { rows: SheetRow[]; tooManyRows: boolean };

const plain = (text: string) => normalizeHeader(text);

/** A catalog value read back to Valuaxis's key: by its label, its key, or a few common spellings. */
function catalogKey<K extends string>(text: string, labels: Record<K, string>, extra: Record<string, K> = {}): K | null {
  const wanted = plain(text);
  if (!wanted) return null;
  for (const [key, label] of Object.entries(labels) as Array<[K, string]>) {
    if (plain(label) === wanted || plain(key) === wanted) return key;
  }
  return extra[wanted] ?? null;
}

const OPERATION_EXTRA: Record<string, OperationType> = { arrendamiento: "RENTA", alquiler: "RENTA", compraventa: "VENTA" };
const VERIFIED_EXTRA: Record<string, DataVerified> = { si: "SI", parcial: "PARCIAL", yes: "SI" };

function proximityOf(text: string) {
  const wanted = plain(text);
  if (!wanted) return null;
  return URBAN_PROXIMITIES.find((key, index) => wanted === String(index + 1) || wanted === plain(key)
    || plain(URBAN_PROXIMITY_LABELS[key]) === wanted || plain(URBAN_PROXIMITY_LABELS[key]).slice(1) === wanted) ?? null;
}

/** Which market a row is: land or built, for sale or rent; what is missing is taken from the default (the market imported from). */
export function resolveComparableType(propertyType: string, operation: OperationType | null, defaultType: ComparableType | null): ComparableType | null {
  const land = propertyType ? isLandPropertyType(propertyType) : defaultType ? isLandComparableType(defaultType) : null;
  const rent = operation ? operation === "RENTA" : defaultType ? isRentComparableType(defaultType) : null;
  if (land === null || rent === null) return null;
  return land ? (rent ? "TERRENO_RENTA" : "TERRENO_VENTA") : (rent ? "INMUEBLE_RENTA" : "INMUEBLE_VENTA");
}

/** The catalog key of the inmueble a comparable's property is filed under (devpware_tipos_inmuebles). */
export function propertyTypeKeyOf(type: ComparableType, constructionType: string | null) {
  if (isLandComparableType(type)) return "TERRENO";
  const text = plain(constructionType ?? "");
  const rules: Array<[RegExp, string]> = [
    [/^casa/, "CASA_HABITACION"], [/^depa/, "DEPARTAMENTO"], [/^local/, "LOCAL_COMERCIAL"], [/^bodega/, "BODEGA"],
    [/^(oficina|consultorio)/, "OFICINA"], [/^(edificio|hotel)/, "EDIFICIO"], [/^(nave|industrial)/, "INDUSTRIAL"],
    [/^(rancho|rural)/, "RURAL"], [/^mixto/, "MIXTO"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? "OTRO";
}

/** A month within a cent of a twelfth of the year: the two columns agree. */
const RENT_TOLERANCE = 0.01;

/**
 * The monthly rent of a row, the one Valuaxis keeps: the "Renta mensual"
 * column; else "Renta anual" over 12; else the offer price by its period.
 * With both columns, the month rules and a mismatch is a warning.
 */
export function monthlyAndAnnualRent(input: { monthly: number | null; annual: number | null; price: number | null; period: RentPeriod | null }) {
  const warnings: string[] = [];
  if (input.monthly !== null) {
    if (input.annual !== null && Math.abs(input.monthly * 12 - input.annual) > RENT_TOLERANCE * 12) {
      warnings.push("La renta anual no es la mensual por 12: se tomó la mensual.");
    }
    return { monthly: input.monthly, annual: input.monthly * 12, warnings };
  }
  if (input.annual !== null) {
    warnings.push("Solo trae renta anual: la mensual se calculó entre 12.");
    return { monthly: input.annual / 12, annual: input.annual, warnings };
  }
  if (input.price !== null && input.period === "ANUAL") {
    warnings.push("Renta anual: Valuaxis guarda la renta mensual, así que se dividió entre 12.");
    return { monthly: input.price / 12, annual: input.price, warnings };
  }
  return { monthly: input.price, annual: input.price === null ? null : input.price * 12, warnings };
}

/** "1000" → "01000": Excel drops the leading zero of a postal code typed as a number. */
const postalCodeOf = (text: string) => (/^\d{4}$/.test(text) ? `0${text}` : text);

/**
 * Reads the master workbook's rows (from the header row on). `defaultType`
 * is the market imported from: rows without type or operation take it.
 */
export function parseMasterRows(sheet: CellValue[][], headerIndex: number, options: { defaultType: ComparableType | null }): MasterParse {
  const positions = masterPositions(sheet[headerIndex] ?? []);
  const header = (key: string) => MASTER_COLUMNS.find((item) => item.key === key)?.header ?? key;
  const formulaKeys = new Set(MASTER_COLUMNS.filter((item) => item.kind === "formula").map((item) => item.key));
  const formulaPositions = new Set([...positions].filter(([key]) => formulaKeys.has(key)).map(([, index]) => index));
  const dataRows = sheet
    .map((cells, index) => ({ cells: cells ?? [], row: index + 1 }))
    .slice(headerIndex + 1)
    // A row with only the template's formulas is empty.
    .filter(({ cells }) => cells.some((cell, index) => !formulaPositions.has(index) && cellText(cell).trim() !== ""));
  const tooManyRows = dataRows.length > MAX_IMPORT_ROWS;
  const seen = new Map<string, number>();

  const rows = dataRows.slice(0, MAX_IMPORT_ROWS).map(({ cells, row }): SheetRow => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const raw = (key: string) => {
      const position = positions.get(key);
      return position === undefined ? null : cells[position];
    };
    const textOf = (key: string, preferLink = false) => cellText(raw(key), preferLink).trim();
    const numberOf = (key: string, integer = false) => {
      const parsed = cellNumber(raw(key));
      if (parsed.error) errors.push(`${header(key)}: ${parsed.error}.`);
      else if (integer && parsed.value !== null && !Number.isInteger(parsed.value)) errors.push(`${header(key)}: debe ser un número entero.`);
      return parsed.error ? null : parsed.value;
    };
    const dateOf = (key: string) => {
      const parsed = cellDate(raw(key));
      if (parsed.error) errors.push(`${header(key)}: ${parsed.error}.`);
      return parsed.value;
    };
    const strict = <K extends string>(key: string, labels: Record<K, string>, extra?: Record<string, K>) => {
      const text = textOf(key);
      if (!text) return null;
      const value = catalogKey(text, labels, extra);
      if (!value) errors.push(`${header(key)}: «${text}» no es una opción (${Object.values<string>(labels).join(", ")}).`);
      return value;
    };

    const useStatus = strict<UseStatus>("useStatus", USE_STATUS_LABELS, { validado: "ACEPTADO", rechazado: "DESCARTADO" }) ?? "PENDIENTE";
    const folioText = textOf("ref");
    const folio = folioText ? parseComparableId(folioText) : null;
    const valuationFolio = textOf("valuationFolio") || null;
    const address: ComparableAddress = {
      street: textOf("street") || null,
      neighborhood: textOf("neighborhood") || null,
      subdivision: textOf("subdivision") || null,
      municipality: textOf("municipality") || null,
      state: textOf("state") || null,
      postalCode: postalCodeOf(textOf("postalCode")) || null,
      number: null,
    };
    const location = textOf("location") || formatAddress(address);
    const base = { row, valuationFolio, folio, useStatus, verified: null, reviewedBy: null, reviewedOn: null };
    // A discarded listing stays in the file as the appraiser's record; it is not read further.
    if (useStatus === "DESCARTADO") {
      return { ...base, type: null, payload: null, errors: [], warnings: ["Descartado: no se importa."], summary: { location, area: null, price: null, unitPrice: null, currency: null } };
    }

    const propertyType = textOf("propertyType");
    const operation = strict<OperationType>("operation", OPERATION_TYPE_LABELS, OPERATION_EXTRA);
    const type = resolveComparableType(propertyType, operation, options.defaultType);
    if (!type) {
      if (!propertyType) errors.push("Falta el tipo de inmueble (Terreno, Casa habitación, Departamento…).");
      if (!operation && !textOf("operation")) errors.push("Falta la operación (Venta o Renta).");
    }
    const land = type ? isLandComparableType(type) : propertyType ? isLandPropertyType(propertyType) : false;
    const currency = strict<Currency>("currency", { MXN: "MXN", USD: "USD" } as Record<Currency, string>, { pesos: "MXN", dolares: "USD" });
    const rentPeriod = strict<RentPeriod>("rentPeriod", RENT_PERIOD_LABELS, { mes: "MENSUAL", ano: "ANUAL" });
    const statedBasis = strict<UnitBasis>("unitBasis", UNIT_BASIS_LABELS, { terrenom2: "TERRENO_M2", construccionm2: "CONSTRUCCION_M2", terrenoha: "TERRENO_HA", ha: "TERRENO_HA" });
    const proximityText = textOf("urbanProximity");
    const urbanProximity = proximityText ? proximityOf(proximityText) : null;
    if (proximityText && !urbanProximity) errors.push(`${header("urbanProximity")}: «${proximityText}» no es una opción (1 Céntrica … 5 Rural).`);
    const verifiedText = textOf("verified");
    const verified = verifiedText ? catalogKey(verifiedText, DATA_VERIFIED_LABELS, VERIFIED_EXTRA) : null;
    if (verifiedText && !verified) errors.push(`${header("verified")}: «${verifiedText}» no es una opción (Sí, No, Parcialmente).`);

    const landArea = numberOf("landArea");
    const builtArea = numberOf("builtArea");
    let price = numberOf("price");
    const latitude = numberOf("latitude");
    const longitude = numberOf("longitude");
    const values = {
      frontage: numberOf("frontage"), depth: numberOf("depth"), frontCount: numberOf("frontCount", true),
      age: numberOf("age"), levels: numberOf("levels", true), bedrooms: numberOf("bedrooms", true), bathrooms: numberOf("bathrooms"),
      parking: numberOf("parking", true),
    };
    const dates = {
      consultedOn: dateOf("consultedOn"), offerDate: dateOf("offerDate"), priceChangedOn: dateOf("priceChangedOn"), reviewedOn: dateOf("reviewedOn"),
    };
    const coordinates = coordinatesError(latitude, longitude);
    if (coordinates) errors.push(coordinates);

    const rent = type ? isRentComparableType(type) : operation === "RENTA";
    const monthlyRent = numberOf("monthlyRent");
    const annualRent = numberOf("annualRent");
    if (rent) {
      const rents = monthlyAndAnnualRent({ monthly: monthlyRent, annual: annualRent, price, period: rentPeriod });
      price = rents.monthly;
      warnings.push(...rents.warnings);
    } else if (monthlyRent || annualRent) {
      warnings.push("Trae renta mensual o anual, pero la operación es venta: se tomó el precio de oferta.");
    }
    if (currency === "USD") warnings.push("Precio en dólares (USD): se guarda sin convertir y el cálculo lo toma como está.");
    const basis: UnitBasis = statedBasis ?? (land ? "TERRENO_M2" : "CONSTRUCCION_M2");
    if (!statedBasis && type) warnings.push(`Sin base del unitario: se tomó «${UNIT_BASIS_LABELS[basis]}».`);
    if (type && !land && basis !== "CONSTRUCCION_M2") {
      warnings.push(`La base del unitario es «${UNIT_BASIS_LABELS[basis]}», pero el mercado de inmuebles homologa por m² construido; la base se guarda como referencia.`);
    }
    if (type && land && basis === "CONSTRUCCION_M2") {
      warnings.push("La base del unitario es «Construcción m²», pero el mercado de terrenos homologa por m² de terreno; la base se guarda como referencia.");
    }
    const area = land ? landArea : builtArea;
    if (!price) warnings.push("Sin precio de oferta: se importa, pero no entra al cálculo hasta completarlo.");
    if (type && !area) {
      warnings.push(land
        ? "Sin superficie de terreno: se importa, pero no entra al cálculo hasta completarla."
        : "Sin superficie de construcción: se importa, pero no entra al cálculo hasta completarla.");
    }
    const url = textOf("url", true) || null;
    if (!url && plain(textOf("dataOrigin")) === "portalinmobiliario") warnings.push("El origen es un portal y falta la URL de publicación.");
    if (!address.municipality && hasAddress(address)) warnings.push("Sin municipio: la búsqueda por lugar no lo encontrará.");
    const sourceName = textOf("sourceName") || null;
    const publicationId = textOf("publicationId") || null;
    // The same listing twice in one file: both import, the second is flagged.
    for (const key of [publicationId ? `p:${plain(sourceName ?? "")}|${publicationId.toLowerCase()}` : null, url ? `u:${canonicalUrlKey(url)}` : null]) {
      if (!key) continue;
      const earlier = seen.get(key);
      if (earlier) warnings.push(`Repite la publicación del renglón ${earlier}.`);
      else seen.set(key, row);
    }

    const unitPrice = unitPriceByBasis(price, basis, { landArea, builtArea });
    const summary = { location, area, price, unitPrice, currency: currency ?? null };
    const review = { verified, reviewedBy: textOf("reviewedBy") || null, reviewedOn: dates.reviewedOn };
    if (errors.length || !type) return { ...base, ...review, type, payload: null, errors, warnings, summary };

    const parsed = comparableInputSchema.safeParse({
      location,
      area,
      price,
      landUse: textOf("landUse") || null,
      landUseKey: textOf("landUseKey") || null,
      shape: textOf("shape") || null,
      zone: textOf("zone") || null,
      frontCount: values.frontCount,
      frontage: values.frontage,
      depth: values.depth,
      topography: textOf("topography") || null,
      services: textOf("services") || null,
      conservation: land ? null : textOf("conservation") || null,
      quality: land ? null : textOf("quality") || null,
      notes: textOf("notes") || null,
      sourceName,
      contactName: textOf("contactName") || null,
      contactPhone: textOf("contactPhone") || null,
      url,
      offerDate: dates.offerDate,
      consultedOn: dates.consultedOn,
      listingText: textOf("description") || null,
      address: hasAddress(address) ? address : null,
      urbanProximity,
      operationType: operation ?? (isRentComparableType(type) ? "RENTA" : "VENTA"),
      latitude,
      longitude,
      landArea: land ? null : landArea,
      bedrooms: values.bedrooms,
      bathrooms: values.bathrooms,
      // "Terreno" says the market; any other type is kept as the type of construction (or of land: "Terreno rústico").
      constructionType: propertyType && plain(propertyType) !== "terreno" ? propertyType : null,
      propertyDetails: {
        age: values.age, levels: values.levels, parking: values.parking,
        paving: textOf("paving") || null, blockPosition: textOf("blockPosition") || null, unitBasis: basis,
      },
      listingDetails: {
        publicationId, currency: currency ?? null, photoUrl: textOf("photoUrl", true) || null, priceChangedOn: dates.priceChangedOn,
        dataOrigin: textOf("dataOrigin") || null, extractionConfidence: textOf("extractionConfidence") || null, dataVerified: verified,
      },
      factors: [],
    });
    if (!parsed.success) {
      const names: Record<string, string> = {
        location: "Ubicación", area: land ? header("landArea") : header("builtArea"), price: header("price"), url: header("url"),
        address: "Ubicación", propertyDetails: "Construcciones", listingDetails: "Publicación",
      };
      const messages = parsed.error.issues.map((issue) => {
        const path = issue.path.map(String);
        const name = names[path[0] ?? ""] ?? MASTER_COLUMNS.find((item) => item.key === (path[1] ?? path[0]))?.header ?? path.join(".");
        return `${name}: ${friendlyMessage(issue)}`;
      });
      return { ...base, ...review, type, payload: null, errors: messages, warnings, summary };
    }
    return { ...base, ...review, type, payload: parsed.data, errors: [], warnings, summary };
  });
  return { rows, tooManyRows };
}

/* ------------------------------------------------------------------ */
/*  Writing                                                            */
/* ------------------------------------------------------------------ */

export type MasterRowValue = string | number | null;

/**
 * A comparable as a row of the master workbook, to edit and import back.
 * Contact and phone go only with `includeContact` (users who can edit
 * comparables). The two formula columns are left out: the workbook fills them.
 */
export function masterRowValues(
  comparable: ComparableDto,
  type: ComparableType,
  extras: { valuationFolio: string | null; includeContact: boolean },
): Record<string, MasterRowValue> {
  const land = isLandComparableType(type);
  const rent = isRentComparableType(type);
  const property = comparable.propertyDetails ?? {};
  const listing = comparable.listingDetails ?? {};
  const address = comparable.address ?? {};
  const review = comparable.review;
  const verified: DataVerified | null = review?.status === "VERIFICADO" ? "SI" : listing.dataVerified ?? null;
  const useStatus: UseStatus = review?.status === "RECHAZADO" ? "DESCARTADO" : review?.status === "VERIFICADO" ? "ACEPTADO" : "PENDIENTE";
  const basis = property.unitBasis ?? (land ? "TERRENO_M2" : "CONSTRUCCION_M2");
  const street = [address.street, address.number].filter(Boolean).join(" ") || null;
  const reviewed = review && review.status !== "POR_REVISAR";
  return {
    ref: formatComparableId(comparable.folio),
    valuationFolio: extras.valuationFolio,
    useStatus: USE_STATUS_LABELS[useStatus],
    propertyType: land
      ? (comparable.constructionType ?? "Terreno")
      : (comparable.constructionType ?? "Otro"),
    operation: OPERATION_TYPE_LABELS[comparable.operationType ?? (rent ? "RENTA" : "VENTA")],
    dataOrigin: listing.dataOrigin ?? null,
    sourceName: comparable.sourceName,
    publicationId: listing.publicationId ?? null,
    consultedOn: comparable.consultedOn ?? null,
    offerDate: comparable.offerDate,
    street,
    neighborhood: address.neighborhood ?? null,
    subdivision: address.subdivision ?? null,
    municipality: address.municipality ?? null,
    state: address.state ?? null,
    postalCode: address.postalCode ?? null,
    latitude: comparable.latitude ?? null,
    longitude: comparable.longitude ?? null,
    location: comparable.location,
    landUse: comparable.landUse,
    landUseKey: comparable.landUseKey ?? null,
    zone: comparable.zone,
    urbanProximity: comparable.urbanProximity ? URBAN_PROXIMITY_LABELS[comparable.urbanProximity] : null,
    landArea: land ? comparable.area : comparable.landArea ?? null,
    frontage: comparable.frontage,
    depth: comparable.depth,
    frontCount: comparable.frontCount ?? null,
    shape: comparable.shape,
    topography: comparable.topography,
    services: comparable.services,
    paving: property.paving ?? null,
    blockPosition: property.blockPosition ?? null,
    builtArea: land ? null : comparable.area,
    age: property.age ?? null,
    quality: comparable.quality ?? null,
    conservation: comparable.conservation ?? null,
    levels: property.levels ?? null,
    bedrooms: comparable.bedrooms ?? null,
    bathrooms: comparable.bathrooms ?? null,
    parking: property.parking ?? null,
    price: comparable.price,
    currency: listing.currency ?? "MXN",
    // Valuaxis keeps the monthly rent; the year is twelve of them.
    monthlyRent: rent ? comparable.price : null,
    annualRent: rent && comparable.price !== null ? Number((comparable.price * 12).toFixed(2)) : null,
    rentPeriod: rent ? RENT_PERIOD_LABELS.MENSUAL : RENT_PERIOD_LABELS.NO_APLICA,
    unitBasis: UNIT_BASIS_LABELS[basis],
    priceChangedOn: listing.priceChangedOn ?? null,
    url: comparable.url,
    photoUrl: listing.photoUrl ?? null,
    contactName: extras.includeContact ? comparable.contactName : null,
    contactPhone: extras.includeContact ? comparable.contactPhone : null,
    description: comparable.listingText ?? null,
    notes: comparable.notes,
    extractionConfidence: listing.extractionConfidence ?? null,
    verified: verified ? DATA_VERIFIED_LABELS[verified] : null,
    reviewedBy: reviewed ? review.reviewedBy : null,
    reviewedOn: reviewed && review.reviewedAt ? review.reviewedAt.slice(0, 10) : null,
  };
}
