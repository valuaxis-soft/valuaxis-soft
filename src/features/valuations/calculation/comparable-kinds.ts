/**
 * «Tipo de inmueble» / «Tipo de bien» of a comparable: what the offer is (a
 * house, an office, a backhoe, a plane), apart from its market (operation ×
 * land or building), which still drives the calculation. The portals list
 * them so (24 Nov 2026: «tú pones oficina en renta y te salen oficinas»), and
 * each firm makes its list longer, the way it adds units of measure: it
 * writes a new one, ticks it, and the list offers it from then on.
 *
 * A kind belongs to a class (comparable-classes): real estate and machinery
 * never mix. Kept in the comparable's property snapshot (`details.kind`,
 * `details.kindLabel`, `details.assetClass`); the firm's own kinds beside its
 * units and its other lists, in the organization's JSON list
 * (JUnidadesPersonalizadas), as `{ lista: "tipoComparable", clase, nombre }`
 * (the shape of features/firm/firm-lists.ts). Pure TypeScript.
 */
import { z } from "zod";

import { COMPARABLE_CLASSES, comparableClassOf, type ComparableClass } from "./comparable-classes";
import { isLandComparableType, type ComparableType } from "./market-types";

export type ComparableKind = { key: string; label: string; class: ComparableClass };

/** «Otro» of each class: a kind of the appraiser's own, its name kept beside it. */
export const OTHER_REAL_ESTATE_KIND = "OTRO_INMUEBLE";
export const OTHER_MACHINERY_KIND = "OTRO_MAQUINARIA";

/**
 * The kinds Valuaxis offers, in their order. `legacy` recognizes the «tipo de
 * construcción» a comparable of before was captured with (unaccented and in
 * lowercase); the SQL of the base uses the same expressions.
 */
const BUILT_IN: ReadonlyArray<ComparableKind & { legacy?: string }> = [
  { key: "TERRENO", label: "Terreno / Lote", class: "INMUEBLE", legacy: "^(terreno|lote|predio|parcela)" },
  { key: "CASA_HABITACION", label: "Casa habitación", class: "INMUEBLE", legacy: "^casa(?! en condominio)" },
  { key: "CASA_CONDOMINIO", label: "Casa en condominio", class: "INMUEBLE", legacy: "^casa en condominio" },
  { key: "DEPARTAMENTO", label: "Departamento", class: "INMUEBLE", legacy: "^depa" },
  { key: "OFICINA", label: "Oficina", class: "INMUEBLE", legacy: "^(oficina|consultorio)" },
  { key: "LOCAL_COMERCIAL", label: "Local comercial", class: "INMUEBLE", legacy: "^local" },
  { key: "BODEGA", label: "Bodega / Nave industrial", class: "INMUEBLE", legacy: "^(bodega|nave|industrial)" },
  { key: "EDIFICIO", label: "Edificio", class: "INMUEBLE", legacy: "^(edificio|hotel)" },
  { key: OTHER_REAL_ESTATE_KIND, label: "Otro", class: "INMUEBLE" },
  { key: "AUTOMOVIL", label: "Automóvil", class: "MAQUINARIA" },
  { key: "CAMIONETA", label: "Camioneta", class: "MAQUINARIA" },
  { key: "CAMION", label: "Camión", class: "MAQUINARIA" },
  { key: "MOTOCICLETA", label: "Motocicleta", class: "MAQUINARIA" },
  { key: "MAQUINARIA_CONSTRUCCION", label: "Maquinaria de construcción", class: "MAQUINARIA" },
  { key: "MAQUINARIA_INDUSTRIAL", label: "Maquinaria industrial / de producción", class: "MAQUINARIA" },
  { key: "EQUIPO", label: "Equipo", class: "MAQUINARIA", legacy: "^(equipo|maquinaria)" },
  { key: "AERONAVE", label: "Aeronave", class: "MAQUINARIA" },
  { key: "EMBARCACION", label: "Embarcación", class: "MAQUINARIA" },
  { key: OTHER_MACHINERY_KIND, label: "Otro", class: "MAQUINARIA" },
];

export const BUILT_IN_KINDS: readonly ComparableKind[] = BUILT_IN.map(({ key, label, class: kindClass }) => ({ key, label, class: kindClass }));

/** The kinds of comparables of before, by the type of construction they were captured with: [kind key, pattern]. */
export const LEGACY_KIND_PATTERNS: ReadonlyArray<[string, string]> = BUILT_IN.flatMap((kind) => (kind.legacy ? [[kind.key, kind.legacy] as [string, string]] : []));

const BUILT_IN_BY_KEY = new Map(BUILT_IN_KINDS.map((kind) => [kind.key, kind]));

export const otherKindOf = (kindClass: ComparableClass) => (kindClass === "MAQUINARIA" ? OTHER_MACHINERY_KIND : OTHER_REAL_ESTATE_KIND);
export const isOtherKind = (key: string | null | undefined) => key === OTHER_REAL_ESTATE_KIND || key === OTHER_MACHINERY_KIND;

/* ------------------------------------------------------------------ */
/*  The firm's own kinds                                               */
/* ------------------------------------------------------------------ */

/** As long as a kind's name may be; «Maquinaria industrial / de producción» fits. */
export const MAX_KIND_LABEL_LENGTH = 60;
/** More than a firm needs; keeps the list readable. */
export const MAX_CUSTOM_KINDS = 60;

export const CUSTOM_KIND_PREFIX = "custom:";
export const CUSTOM_KIND_KEY = /^custom:[a-z0-9-]{1,60}$/;

/** A name as kept: trimmed, with single spaces. */
export const normalizeKindLabel = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, MAX_KIND_LABEL_LENGTH);

/** Names compare without case or accents: «Retroexcavadora» and «retroexcavadora» are one. */
export const kindNameKey = (value: string) => normalizeKindLabel(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** «Retroexcavadora» → «custom:retroexcavadora»: the key of a kind the firm added. */
export function customKindKey(label: string) {
  const slug = kindNameKey(label).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${CUSTOM_KIND_PREFIX}${slug || "tipo"}`;
}

const kindField = z.string().transform(normalizeKindLabel).pipe(z.string().min(1, "Escribe el tipo."));

/** «Agregar a la lista»: a name and the class it belongs to. */
export const customKindSchema = z.object({ label: kindField, class: z.enum(COMPARABLE_CLASSES, "La clase es Inmuebles o Maquinaria y equipo.") });

/** The list of the organization's JSON (JUnidadesPersonalizadas) its kinds go in. */
export const COMPARABLE_KIND_LIST = "tipoComparable";

type StoredKind = { lista: typeof COMPARABLE_KIND_LIST; clase: ComparableClass; nombre: string };

const isStoredKind = (value: unknown): value is StoredKind =>
  typeof value === "object" && value !== null && !Array.isArray(value) && (value as { lista?: unknown }).lista === COMPARABLE_KIND_LIST;

/**
 * The firm's kinds read from the organization's JSON list, where its units
 * (strings) and its other lists also live; anything malformed is left out,
 * each name once per class.
 */
export function resolveCustomKinds(stored: unknown): ComparableKind[] {
  if (!Array.isArray(stored)) return [];
  const kinds: ComparableKind[] = [];
  const seen = new Set<string>();
  for (const item of stored) {
    if (!isStoredKind(item)) continue;
    const parsed = customKindSchema.safeParse({ label: item.nombre, class: item.clase });
    if (!parsed.success) continue;
    const key = customKindKey(parsed.data.label);
    const unique = `${parsed.data.class}|${key}`;
    if (seen.has(unique) || builtInKindByName(parsed.data.label, parsed.data.class)) continue;
    seen.add(unique);
    kinds.push({ key, label: parsed.data.label, class: parsed.data.class });
    if (kinds.length === MAX_CUSTOM_KINDS) break;
  }
  return kinds;
}

/** The organization's JSON list with these kinds in place of the ones it had; its units and other lists stay. */
export function withCustomKinds(stored: unknown, kinds: readonly ComparableKind[]): unknown[] {
  const others = (Array.isArray(stored) ? stored : []).filter((item) => !isStoredKind(item));
  return [...others, ...kinds.map((kind): StoredKind => ({ lista: COMPARABLE_KIND_LIST, clase: kind.class, nombre: kind.label }))];
}

function builtInKindByName(label: string, kindClass: ComparableClass) {
  const wanted = kindNameKey(label);
  return BUILT_IN_KINDS.find((kind) => kind.class === kindClass && !isOtherKind(kind.key)
    && (kindNameKey(kind.label) === wanted || kindNameKey(kind.label).split(" / ").includes(wanted))) ?? null;
}

/**
 * The list with the kind added at the end, or the same list when it is
 * already there (one of Valuaxis or of the firm, however it was written).
 * `kind` is the one the comparable takes either way.
 */
export function addCustomKindTo(kinds: readonly ComparableKind[], label: string, kindClass: ComparableClass):
  { kinds: ComparableKind[]; added: boolean; kind: ComparableKind | null } {
  const name = normalizeKindLabel(label);
  if (!name) return { kinds: [...kinds], added: false, kind: null };
  const existing = builtInKindByName(name, kindClass)
    ?? kinds.find((kind) => kind.class === kindClass && kindNameKey(kind.label) === kindNameKey(name));
  if (existing) return { kinds: [...kinds], added: false, kind: existing };
  const kind: ComparableKind = { key: customKindKey(name), label: name, class: kindClass };
  const next = [...kinds, kind];
  return { kinds: next.length > MAX_CUSTOM_KINDS ? next.slice(next.length - MAX_CUSTOM_KINDS) : next, added: true, kind };
}

/** The list without that kind of the firm; comparables that use it keep its name. */
export function removeCustomKindFrom(kinds: readonly ComparableKind[], key: string) {
  const next = kinds.filter((kind) => kind.key !== key);
  return { kinds: next, removed: next.length !== kinds.length };
}

/**
 * The kinds a list offers for a class: Valuaxis's, then the firm's, with
 * «Otro» last.
 */
export function kindOptions(kindClass: ComparableClass, custom: readonly ComparableKind[] = []): ComparableKind[] {
  const builtIn = BUILT_IN_KINDS.filter((kind) => kind.class === kindClass);
  const other = builtIn.filter((kind) => isOtherKind(kind.key));
  return [...builtIn.filter((kind) => !isOtherKind(kind.key)), ...custom.filter((kind) => kind.class === kindClass), ...other];
}

/* ------------------------------------------------------------------ */
/*  The kind of a comparable                                           */
/* ------------------------------------------------------------------ */

/** What a comparable keeps of its kind (in `propertyDetails`). */
export type ComparableKindDetails = { kind?: string | null; kindLabel?: string | null; assetClass?: ComparableClass | null };

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * The kind of a comparable as the card, the table and the filters read it:
 * the one captured; else, for a comparable of before, «Terreno / Lote» in a
 * land market, or the one its type of construction names. Null when nothing
 * says it.
 */
export function kindOfComparable(comparable: {
  type?: ComparableType | null;
  constructionType?: string | null;
  propertyDetails?: ComparableKindDetails | null;
}): ComparableKind | null {
  const details = comparable.propertyDetails ?? {};
  const kindClass = comparableClassOf({ assetClass: details.assetClass, constructionType: comparable.constructionType });
  if (details.kind) {
    const builtIn = BUILT_IN_BY_KEY.get(details.kind);
    const label = details.kindLabel?.trim();
    // «Otro» shows the name the appraiser wrote; a kind of the firm, the name it had when captured.
    if (builtIn && !isOtherKind(builtIn.key)) return builtIn;
    return { key: details.kind, label: label || builtIn?.label || "Otro", class: builtIn?.class ?? kindClass };
  }
  if (comparable.type && isLandComparableType(comparable.type)) return BUILT_IN_BY_KEY.get("TERRENO") ?? null;
  const text = plain(comparable.constructionType ?? "");
  if (!text) return null;
  const found = LEGACY_KIND_PATTERNS.find(([, pattern]) => new RegExp(pattern).test(text));
  return found ? BUILT_IN_BY_KEY.get(found[0]) ?? null : null;
}

/**
 * A kind written as text (the master workbook's «Tipo de inmueble», a listing)
 * read back: Valuaxis's or the firm's by its name or its key, either half of
 * «Bodega / Nave industrial», or a few usual words («Casa» → Casa habitación,
 * «Lote» → Terreno). Anything else is «Otro» of the class, with the text
 * kept as its name.
 */
export function kindFromText(text: string, kindClass: ComparableClass | null, custom: readonly ComparableKind[] = []): ComparableKind | null {
  const name = normalizeKindLabel(text);
  if (!name) return null;
  const wanted = kindNameKey(name);
  const classes: ComparableClass[] = kindClass ? [kindClass] : [...COMPARABLE_CLASSES];
  for (const each of classes) {
    const builtIn = builtInKindByName(name, each) ?? BUILT_IN_KINDS.find((kind) => kind.class === each && kind.key.toLowerCase() === wanted.replace(/\s+/g, "_"));
    if (builtIn && !isOtherKind(builtIn.key)) return builtIn;
    const own = custom.find((kind) => kind.class === each && kindNameKey(kind.label) === wanted);
    if (own) return own;
  }
  // Words of before (the 12 types of the template and the type of construction).
  const legacy = LEGACY_KIND_PATTERNS.find(([, pattern]) => new RegExp(pattern).test(wanted));
  const legacyKind = legacy ? BUILT_IN_BY_KEY.get(legacy[0]) : undefined;
  if (legacyKind && (!kindClass || legacyKind.class === kindClass)) return legacyKind;
  const fallbackClass = kindClass ?? "INMUEBLE";
  return { key: otherKindOf(fallbackClass), label: name, class: fallbackClass };
}

/** The details a comparable keeps for its kind. */
export function kindDetails(kind: ComparableKind | null): Required<ComparableKindDetails> {
  if (!kind) return { kind: null, kindLabel: null, assetClass: null };
  return { kind: kind.key, kindLabel: kind.label, assetClass: kind.class };
}

/** The row of the property types catalog (devpware_tipos_inmuebles) a kind is filed under. */
export function propertyTypeKeyOfKind(kind: ComparableKind): string {
  if (kind.class === "MAQUINARIA") return "MAQUINARIA_EQUIPO";
  const byKind: Record<string, string> = {
    TERRENO: "TERRENO", CASA_HABITACION: "CASA_HABITACION", CASA_CONDOMINIO: "CASA_HABITACION", DEPARTAMENTO: "DEPARTAMENTO",
    OFICINA: "OFICINA", LOCAL_COMERCIAL: "LOCAL_COMERCIAL", BODEGA: "BODEGA", EDIFICIO: "EDIFICIO",
  };
  return byKind[kind.key] ?? "OTRO";
}

/** The kind a new comparable of a market starts with: «Terreno / Lote» in a land market, none in the rest. */
export const defaultKindOfType = (type: ComparableType): ComparableKind | null =>
  (isLandComparableType(type) ? BUILT_IN_BY_KEY.get("TERRENO") ?? null : null);

/**
 * The kind details as saved: a kind of Valuaxis takes its class (and its
 * name, unless it is «Otro», which keeps the one written); a kind of the
 * firm keeps the name and class it came with. Without a kind, nothing.
 */
export function withKindDetails<T extends ComparableKindDetails>(details: T): T {
  if (!details.kind) return details;
  const builtIn = BUILT_IN_BY_KEY.get(details.kind);
  if (!builtIn) return { ...details, assetClass: details.assetClass ?? "INMUEBLE" };
  return {
    ...details,
    kindLabel: isOtherKind(builtIn.key) ? details.kindLabel?.trim() || null : builtIn.label,
    assetClass: builtIn.class,
  };
}

/** A kind as the browser sends it (the AI search, the filters): its key, its name and its class. */
export const comparableKindSchema = z.object({
  key: z.string().trim().max(80).refine((key) => isKnownKindKey(key), "Tipo de inmueble inválido."),
  label: kindField,
  class: z.enum(COMPARABLE_CLASSES, "La clase es Inmuebles o Maquinaria y equipo."),
});

/** How a search names the kinds of Valuaxis, in plural. */
const PLURALS: Record<string, string> = {
  TERRENO: "Terrenos", CASA_HABITACION: "Casas habitación", CASA_CONDOMINIO: "Casas en condominio", DEPARTAMENTO: "Departamentos",
  OFICINA: "Oficinas", LOCAL_COMERCIAL: "Locales comerciales", BODEGA: "Bodegas o naves industriales", EDIFICIO: "Edificios",
  [OTHER_REAL_ESTATE_KIND]: "Inmuebles", AUTOMOVIL: "Automóviles", CAMIONETA: "Camionetas", CAMION: "Camiones", MOTOCICLETA: "Motocicletas",
  MAQUINARIA_CONSTRUCCION: "Maquinaria de construcción", MAQUINARIA_INDUSTRIAL: "Maquinaria industrial o de producción", EQUIPO: "Equipos",
  AERONAVE: "Aeronaves", EMBARCACION: "Embarcaciones", [OTHER_MACHINERY_KIND]: "Maquinaria y equipo",
};

/** «Retroexcavadora» → «Retroexcavadoras», «Tractor» → «Tractores», «Avión» → «Aviones»: the first word in plural. */
function pluralWord(word: string) {
  if (/[aeiouáéó]$/i.test(word)) return `${word}s`;
  if (/ón$/i.test(word)) return `${word.slice(0, -2)}ones`;
  if (/z$/i.test(word)) return `${word.slice(0, -1)}ces`;
  if (/[sx]$/i.test(word)) return word;
  return `${word}es`;
}

/**
 * «Oficinas», «Locales comerciales», «Retroexcavadoras»: a kind as a search
 * asks for it. A one-word kind of the firm (or «Otro» with a name) goes in
 * plural; a longer name stays as written, since its other words would not
 * agree («Tractor agrícola»).
 */
export function kindPlural(kind: Pick<ComparableKind, "key" | "label">): string {
  const builtIn = PLURALS[kind.key];
  if (builtIn && !(isOtherKind(kind.key) && kind.label && kind.label !== "Otro")) return builtIn;
  const label = normalizeKindLabel(kind.label);
  return /\s/.test(label) ? label : pluralWord(label);
}

/** Whether a kind key is one Valuaxis offers or one a firm can add. */
export const isKnownKindKey = (key: string) => BUILT_IN_BY_KEY.has(key) || CUSTOM_KIND_KEY.test(key);
