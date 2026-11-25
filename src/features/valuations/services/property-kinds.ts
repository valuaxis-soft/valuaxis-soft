/**
 * "Tipo de bien", "Tipo de operación" and "Tipo de avalúo": the catalogs of
 * the database (devpware_tipos_inmuebles, devpware_tipos_operaciones,
 * devpware_tipos_avaluos) by their lowercase keys, as the valuation's meta
 * carries them, with the names the appraiser reads. "Otro" takes a name of
 * the appraiser's own, kept on the subject property (2 Nov 2026: the list was
 * closed to four kinds). Since 24 Nov 2026 the «Tipo de bien» follows from
 * «Clase de avalúo» and «¿Qué se está valuando?» (appraisal-subject.ts) and is
 * no longer chosen apart; the carátula's «Tipo de avalúo» of before (venta,
 * renta…) is the «Tipo de operación».
 *
 * Pure TypeScript — no React, no database.
 */

export type KindOption = { key: string; label: string };

/** The key under which a kind of the appraiser's own is stored, with its name apart. */
export const OTHER_PROPERTY_KIND = "otro";
export const OTHER_VALUATION_KIND = "otra";

export const VALUATION_KIND_OPTIONS: readonly KindOption[] = [
  { key: "venta", label: "Venta" },
  { key: "renta", label: "Renta" },
  { key: "compra", label: "Compra" },
  { key: "garantia", label: "Garantía" },
  { key: "fiscal", label: "Fiscal" },
  { key: OTHER_VALUATION_KIND, label: "Otro…" },
];

/**
 * «Tipo de avalúo» (devpware_tipos_avaluos) by its lowercase keys. «Otro»
 * holds every kind of the firm's own, with its name (`claseAvaluoOtro`): the
 * ones it saved in its list and the ones the system proposes beyond the
 * catalog (24 Nov 2026: «que si son de catastro… comerciales»).
 */
export const OTHER_APPRAISAL_KIND = "otro";
export const APPRAISAL_KIND_OPTIONS: readonly KindOption[] = [
  { key: "comercial", label: "Comercial" },
  { key: "hipotecario", label: "Hipotecario" },
  { key: "fiscal", label: "Fiscal" },
  { key: "judicial", label: "Judicial" },
];
export const APPRAISAL_KIND_PROPOSALS: readonly string[] = ["Catastral"];

export function normalizeAppraisalKind(key: string | null | undefined): string {
  return (key ?? "").trim().toLowerCase() || "comercial";
}

/** A choice of a list the firm makes longer: a catalog key, a name of its own (`own:Catastral`) or a new one to type. */
export const NEW_OWN_CHOICE = "__nuevo";
const OWN_PREFIX = "own:";
export type ExtendableChoice = { value: string; label: string };

/**
 * The choices of «Tipo de avalúo»: the catalog's, then the proposals and the
 * firm's own (each once, however it was written), the name a valuation has
 * even when nobody saved it, and «Otro…» to type a new one.
 */
export function appraisalKindChoices(firmOwn: readonly string[], current?: string, catalog: readonly KindOption[] = APPRAISAL_KIND_OPTIONS): ExtendableChoice[] {
  const own: string[] = [];
  const seen = new Set(catalog.map((option) => plain(option.label)));
  for (const name of [...APPRAISAL_KIND_PROPOSALS, ...firmOwn, current ?? ""]) {
    const kept = name.replace(/\s+/g, " ").trim();
    if (!kept || seen.has(plain(kept))) continue;
    seen.add(plain(kept));
    own.push(kept);
  }
  return [
    ...catalog.map((option) => ({ value: option.key, label: option.label })),
    ...own.map((name) => ({ value: `${OWN_PREFIX}${name}`, label: name })),
    { value: NEW_OWN_CHOICE, label: "Otro… (escribir uno nuevo)" },
  ];
}

/** The choice a kind and its name stand for. */
export function appraisalKindChoiceOf(key: string | null | undefined, ownName: string | undefined): string {
  const kind = normalizeAppraisalKind(key);
  if (kind !== OTHER_APPRAISAL_KIND) return kind;
  return ownName?.trim() ? `${OWN_PREFIX}${ownName.trim()}` : NEW_OWN_CHOICE;
}

/** The kind and the name of the firm's own a choice stands for; a new one takes the name typed. */
export function appraisalKindOfChoice(choice: string, typed = ""): { key: string; ownName: string } {
  if (choice.startsWith(OWN_PREFIX)) return { key: OTHER_APPRAISAL_KIND, ownName: choice.slice(OWN_PREFIX.length) };
  if (choice === NEW_OWN_CHOICE) return { key: OTHER_APPRAISAL_KIND, ownName: typed.trim() };
  return { key: normalizeAppraisalKind(choice), ownName: "" };
}

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

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
