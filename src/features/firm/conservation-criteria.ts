/**
 * The conservation criteria an appraiser keeps (video 8.7, 1:40: «registrarlo
 * para su despacho, o su equipo, o para sí mismo… y que ya les quede»): a
 * «Criterio propio» of the cost approach with its name and its states, saved
 * once and offered again in the list of criteria of any valuation.
 *
 * They are kept beside the firm's units and lists, in the same JSON list of
 * the organization (JUnidadesPersonalizadas), as objects
 * `{ criterio: "conservacion", nombre, opciones, usuario? }`: without
 * `usuario` the whole firm (its team) sees it; with it, only that person.
 * The units and the other lists keep the objects they do not read, so no
 * column is needed.
 *
 * Pure TypeScript — no React, no side effects.
 */
import { z } from "zod";

/** More than anyone needs; keeps the list of criteria readable. */
export const MAX_SAVED_CRITERIA = 30;
const MAX_OPTIONS = 12;

export const CRITERION_SCOPES = ["despacho", "personal"] as const;
export type CriterionScope = (typeof CRITERION_SCOPES)[number];

export type SavedConservationCriterion = {
  name: string;
  options: Array<{ label: string; factor: number }>;
  scope: CriterionScope;
};

type StoredCriterion = { criterio: "conservacion"; nombre: string; opciones: Array<{ etiqueta: string; factor: number }>; usuario?: number };

const normalizeName = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 60);
const nameKey = (value: string) => normalizeName(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const optionSchema = z.object({
  label: z.string().transform(normalizeName).pipe(z.string().min(1, "Cada estado lleva su nombre.")),
  factor: z.number().min(0, "El factor va de 0 a 10.").max(10, "El factor va de 0 a 10."),
});

export const savedCriterionSchema = z.object({
  name: z.string().transform(normalizeName).pipe(z.string().min(1, "Escribe el nombre del criterio.")),
  options: z.array(optionSchema).min(1, "El criterio lleva al menos un estado.").max(MAX_OPTIONS, `Hasta ${MAX_OPTIONS} estados.`),
  scope: z.enum(CRITERION_SCOPES),
});

export const removeCriterionSchema = z.object({
  name: z.string().transform(normalizeName).pipe(z.string().min(1)),
  scope: z.enum(CRITERION_SCOPES),
});

function storedOf(value: unknown): StoredCriterion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.criterio !== "conservacion" || typeof record.nombre !== "string" || !Array.isArray(record.opciones)) return null;
  const nombre = normalizeName(record.nombre);
  const opciones = record.opciones.flatMap((item) => {
    const option = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const etiqueta = typeof option.etiqueta === "string" ? normalizeName(option.etiqueta) : "";
    const factor = typeof option.factor === "number" && Number.isFinite(option.factor) && option.factor >= 0 && option.factor <= 10 ? option.factor : null;
    return etiqueta && factor !== null ? [{ etiqueta, factor }] : [];
  }).slice(0, MAX_OPTIONS);
  if (!nombre || !opciones.length) return null;
  const usuario = typeof record.usuario === "number" && Number.isInteger(record.usuario) ? record.usuario : undefined;
  return { criterio: "conservacion", nombre, opciones, ...(usuario === undefined ? {} : { usuario }) };
}

const asList = (stored: unknown): unknown[] => (Array.isArray(stored) ? stored : []);
const owner = (scope: CriterionScope, userId: number) => (scope === "personal" ? userId : undefined);
const sameSlot = (item: StoredCriterion, name: string, usuario: number | undefined) => nameKey(item.nombre) === nameKey(name) && item.usuario === usuario;

/** The criteria a user sees: the firm's and his own, the firm's first, each in the order kept. */
export function resolveSavedCriteria(stored: unknown, userId: number): SavedConservationCriterion[] {
  const items = asList(stored).map(storedOf).filter((item): item is StoredCriterion => item !== null);
  const visible = items.filter((item) => item.usuario === undefined || item.usuario === userId);
  const of = (item: StoredCriterion): SavedConservationCriterion => ({
    name: item.nombre,
    options: item.opciones.map((option) => ({ label: option.etiqueta, factor: option.factor })),
    scope: item.usuario === undefined ? "despacho" : "personal",
  });
  return [...visible.filter((item) => item.usuario === undefined), ...visible.filter((item) => item.usuario !== undefined)].map(of);
}

/**
 * The organization's JSON with the criterion kept: one of the same name and
 * scope is replaced (the appraiser saved it again with other states). When
 * the list is full, the oldest makes room. Units and lists stay.
 */
export function saveCriterionTo(stored: unknown, criterion: SavedConservationCriterion, userId: number): unknown[] {
  const list = asList(stored);
  const usuario = owner(criterion.scope, userId);
  const next: StoredCriterion = {
    criterio: "conservacion",
    nombre: normalizeName(criterion.name),
    opciones: criterion.options.slice(0, MAX_OPTIONS).map((option) => ({ etiqueta: normalizeName(option.label), factor: option.factor })),
    ...(usuario === undefined ? {} : { usuario }),
  };
  const kept = list.filter((value) => {
    const item = storedOf(value);
    return item === null || !sameSlot(item, next.nombre, usuario);
  });
  const criteria = kept.filter((value) => storedOf(value) !== null);
  const dropped = criteria.length >= MAX_SAVED_CRITERIA ? criteria[0] : undefined;
  return [...kept.filter((value) => value !== dropped), next];
}

/** The organization's JSON without the criterion of that name and scope (a personal one, only the user's own). */
export function removeCriterionFrom(stored: unknown, name: string, scope: CriterionScope, userId: number): { stored: unknown[]; removed: boolean } {
  const list = asList(stored);
  const usuario = owner(scope, userId);
  const next = list.filter((value) => {
    const item = storedOf(value);
    return item === null || !sameSlot(item, name, usuario);
  });
  return { stored: next, removed: next.length !== list.length };
}
