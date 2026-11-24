/**
 * "Tipo de bien" and "Tipo de avalúo" of the carátula: the catalogs of the
 * database (devpware_tipos_inmuebles, devpware_tipos_operaciones) by their
 * lowercase keys, as the valuation's meta carries them, with the names the
 * appraiser reads. "Otro" takes a name of the appraiser's own, kept on the
 * subject property (2 Nov 2026: the list was closed to four kinds).
 *
 * Pure TypeScript — no React, no database.
 */

export type KindOption = { key: string; label: string };

/** The key under which a kind of the appraiser's own is stored, with its name apart. */
export const OTHER_PROPERTY_KIND = "otro";
export const OTHER_VALUATION_KIND = "otra";

/** In the order they are offered; machinery is chosen when the valuation is created. */
export const PROPERTY_KIND_OPTIONS: readonly KindOption[] = [
  { key: "casa_habitacion", label: "Casa" },
  { key: "departamento", label: "Departamento" },
  { key: "oficina", label: "Oficina" },
  { key: "terreno", label: "Terreno" },
  { key: "edificio", label: "Edificio" },
  { key: "industrial", label: "Nave industrial" },
  { key: "local_comercial", label: "Local comercial" },
  { key: "bodega", label: "Bodega" },
  { key: "rural", label: "Rural" },
  { key: "mixto", label: "Mixto" },
  { key: "maquinaria_equipo", label: "Equipo y maquinaria" },
  { key: OTHER_PROPERTY_KIND, label: "Otro…" },
];

export const VALUATION_KIND_OPTIONS: readonly KindOption[] = [
  { key: "venta", label: "Venta" },
  { key: "renta", label: "Renta" },
  { key: "compra", label: "Compra" },
  { key: "garantia", label: "Garantía" },
  { key: "fiscal", label: "Fiscal" },
  { key: OTHER_VALUATION_KIND, label: "Otro…" },
];

/** Keys saved before the list opened ("casa") read as the catalog's. */
const PROPERTY_KIND_ALIASES: Record<string, string> = { casa: "casa_habitacion", nave: "industrial", nave_industrial: "industrial", local: "local_comercial" };
const VALUATION_KIND_ALIASES: Record<string, string> = { ambos: OTHER_VALUATION_KIND, otro: OTHER_VALUATION_KIND };

export function normalizePropertyKind(key: string | null | undefined): string {
  const lower = (key ?? "").trim().toLowerCase();
  return PROPERTY_KIND_ALIASES[lower] ?? (lower || "casa_habitacion");
}

export function normalizeValuationKind(key: string | null | undefined): string {
  const lower = (key ?? "").trim().toLowerCase();
  return VALUATION_KIND_ALIASES[lower] ?? (lower || "venta");
}

/**
 * A catalog entry that takes a name of the appraiser's own: «Otro» of «Tipo
 * de bien» and «Tipo de avalúo», «Otra» of «Tipo de operación» (24 Nov 2026:
 * «si especifico otro… que otro»).
 */
export function isOwnKindKey(key: string | null | undefined): boolean {
  const lower = (key ?? "").trim().toLowerCase();
  return lower === OTHER_PROPERTY_KIND || lower === OTHER_VALUATION_KIND;
}

/**
 * The names of the appraiser's own kinds, as the subject property keeps them
 * in JCaracteristicas: of the property (`tipoBienOtro`), of the operation the
 * carátula calls «Tipo de avalúo» (`tipoAvaluoOtro`) and of the kind of
 * valuation of the catalog, Comercial, Hipotecario… (`claseAvaluoOtro`).
 */
export type OwnKindNames = { tipoBienOtro?: string; tipoAvaluoOtro?: string; claseAvaluoOtro?: string };

export function readOwnKindNames(characteristics: unknown): OwnKindNames {
  if (typeof characteristics !== "object" || characteristics === null || Array.isArray(characteristics)) return {};
  const record = characteristics as Record<string, unknown>;
  return {
    ...(typeof record.tipoBienOtro === "string" && record.tipoBienOtro.trim() ? { tipoBienOtro: record.tipoBienOtro.trim() } : {}),
    ...(typeof record.tipoAvaluoOtro === "string" && record.tipoAvaluoOtro.trim() ? { tipoAvaluoOtro: record.tipoAvaluoOtro.trim() } : {}),
    ...(typeof record.claseAvaluoOtro === "string" && record.claseAvaluoOtro.trim() ? { claseAvaluoOtro: record.claseAvaluoOtro.trim() } : {}),
  };
}

/** Why a new valuation is refused: a kind chosen as «Otro» without saying which; null when every one says. */
export function missingOwnKindName(kinds: ReadonlyArray<{ key: string; name: string | undefined; label: string }>): string | null {
  const missing = kinds.find((kind) => isOwnKindKey(kind.key) && !kind.name?.trim());
  return missing ? `Elegiste «Otro» en ${missing.label}: escribe cuál es.` : null;
}

/** The name a kind prints with: the appraiser's own for «Otro», the catalog's otherwise. */
export function ownKindName(catalog: { SClave: string; SNombre: string }, own: string | undefined): string {
  return isOwnKindKey(catalog.SClave) && own ? own : catalog.SNombre;
}
