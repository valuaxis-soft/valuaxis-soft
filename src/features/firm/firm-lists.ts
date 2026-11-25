/**
 * The lists a firm makes longer (24 Nov 2026, «sería algo similar a lo que
 * tenemos a las unidades de medida… y palomita, se agrega»): what it values
 * of each class («¿Qué se está valuando?»: Grúa, Tractor…) and its kinds of
 * valuation («Tipo de avalúo»: Catastral, Arbitraje…).
 *
 * They are kept beside the firm's units, in the same JSON list of the
 * organization (JUnidadesPersonalizadas): a unit is a string, an item of
 * these lists an object `{ lista, clase?, nombre }`. The units read only the
 * strings and keep the objects when they write (see `withUnits`), so neither
 * list loses the other and no column is needed.
 *
 * Pure TypeScript — no React, no side effects.
 */
import { z } from "zod";

import { APPRAISAL_CLASSES, essenceKey, normalizeEssence, type AppraisalClass } from "@/features/valuations/services/appraisal-subject";

export const FIRM_LIST_KINDS = ["queSeValua", "tipoAvaluo"] as const;
export type FirmListKind = (typeof FIRM_LIST_KINDS)[number];

/** More than anyone needs; keeps each list readable. */
export const MAX_FIRM_LIST_ITEMS = 50;

export type FirmListItem = { list: FirmListKind; appraisalClass?: AppraisalClass; name: string };

export type FirmLists = {
  /** «¿Qué se está valuando?» of each class, in the order they were added. */
  essences: Record<AppraisalClass, string[]>;
  /** «Tipo de avalúo» names of the firm's own, in the order they were added. */
  appraisalKinds: string[];
};

type StoredItem = { lista: FirmListKind; clase?: AppraisalClass; nombre: string };

export const firmListItemSchema = z
  .object({
    list: z.enum(FIRM_LIST_KINDS),
    appraisalClass: z.enum(APPRAISAL_CLASSES).optional(),
    name: z.string().transform(normalizeEssence).pipe(z.string().min(1, "Escribe el nombre.")),
  })
  .refine((item) => item.list !== "queSeValua" || item.appraisalClass, { message: "Elige la clase de avalúo.", path: ["appraisalClass"] });

const emptyLists = (): FirmLists => ({ essences: { INMUEBLE: [], MAQUINARIA: [], AGROPECUARIO: [] }, appraisalKinds: [] });

function storedItemOf(value: unknown): StoredItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!FIRM_LIST_KINDS.includes(record.lista as FirmListKind) || typeof record.nombre !== "string") return null;
  const nombre = normalizeEssence(record.nombre);
  if (!nombre) return null;
  if (record.lista === "queSeValua") {
    if (!APPRAISAL_CLASSES.includes(record.clase as AppraisalClass)) return null;
    return { lista: "queSeValua", clase: record.clase as AppraisalClass, nombre };
  }
  return { lista: "tipoAvaluo", nombre };
}

const sameItem = (a: StoredItem, b: StoredItem) =>
  a.lista === b.lista && (a.clase ?? null) === (b.clase ?? null) && essenceKey(a.nombre) === essenceKey(b.nombre);

const asList = (stored: unknown): unknown[] => (Array.isArray(stored) ? stored : []);

/** The firm's lists read back from the organization's JSON; anything malformed is left out. */
export function resolveFirmLists(stored: unknown): FirmLists {
  const lists = emptyLists();
  const seen: StoredItem[] = [];
  for (const value of asList(stored)) {
    const item = storedItemOf(value);
    if (!item || seen.some((other) => sameItem(other, item))) continue;
    seen.push(item);
    const target = item.lista === "queSeValua" && item.clase ? lists.essences[item.clase] : lists.appraisalKinds;
    if (target.length < MAX_FIRM_LIST_ITEMS) target.push(item.nombre);
  }
  return lists;
}

const toStored = (item: FirmListItem): StoredItem => ({
  lista: item.list,
  ...(item.list === "queSeValua" && item.appraisalClass ? { clase: item.appraisalClass } : {}),
  nombre: normalizeEssence(item.name),
});

/**
 * The organization's JSON with the item added at the end, or as it was when
 * the item is already there (however it was written). When its list is full,
 * its oldest item makes room. The units and the other lists stay.
 */
export function addFirmListItemTo(stored: unknown, item: FirmListItem): { stored: unknown[]; added: boolean } {
  const list = asList(stored);
  const next = toStored(item);
  if (!next.nombre || list.some((value) => { const other = storedItemOf(value); return other !== null && sameItem(other, next); })) {
    return { stored: list, added: false };
  }
  const ofSameList = list.filter((value) => { const other = storedItemOf(value); return other !== null && other.lista === next.lista && (other.clase ?? null) === (next.clase ?? null); });
  const dropped = ofSameList.length >= MAX_FIRM_LIST_ITEMS ? ofSameList[0] : undefined;
  return { stored: [...list.filter((value) => value !== dropped), next], added: true };
}

/** The organization's JSON without the item (however it was written); the valuations that use it keep its name. */
export function removeFirmListItemFrom(stored: unknown, item: FirmListItem): { stored: unknown[]; removed: boolean } {
  const list = asList(stored);
  const target = toStored(item);
  const next = list.filter((value) => { const other = storedItemOf(value); return other === null || !sameItem(other, target); });
  return { stored: next, removed: next.length !== list.length };
}

/** The organization's JSON with its units replaced by `units`, keeping the items of these lists. */
export function withUnits(stored: unknown, units: readonly string[]): unknown[] {
  return [...units, ...asList(stored).filter((value) => typeof value !== "string")];
}
