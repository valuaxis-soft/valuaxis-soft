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

/** The names of the appraiser's own kinds, as the subject property keeps them in JCaracteristicas. */
export type OwnKindNames = { tipoBienOtro?: string; tipoAvaluoOtro?: string };

export function readOwnKindNames(characteristics: unknown): OwnKindNames {
  if (typeof characteristics !== "object" || characteristics === null || Array.isArray(characteristics)) return {};
  const record = characteristics as Record<string, unknown>;
  return {
    ...(typeof record.tipoBienOtro === "string" && record.tipoBienOtro.trim() ? { tipoBienOtro: record.tipoBienOtro.trim() } : {}),
    ...(typeof record.tipoAvaluoOtro === "string" && record.tipoAvaluoOtro.trim() ? { tipoAvaluoOtro: record.tipoAvaluoOtro.trim() } : {}),
  };
}
