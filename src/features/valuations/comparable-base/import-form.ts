/**
 * The form both import routes receive: the file, the destination the user
 * confirmed, the default type of a market's template, and the answers to
 * possible duplicates by row.
 */
import { z } from "zod";

import { IMPORT_DESTINATIONS, type ImportDestination } from "../calculation/comparable-master";
import { comparableTypeSchema } from "../calculation/market-schemas";
import type { ComparableType } from "../calculation/market-types";

const answersSchema = z.record(z.string().regex(/^\d+$/), z.uuid());

const parseJson = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

export type ImportForm = {
  file: File;
  destination: ImportDestination | null;
  defaultType: ComparableType | null;
  /** Rows answered "Usar el existente" / "Es el mismo": {"<row>": "<comparable id>"}. */
  reuse: Record<string, string>;
  merge: Record<string, string>;
};

export function readImportForm(form: FormData): { ok: true; data: ImportForm } | { ok: false; error: string } {
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No se envió ningún archivo." };
  const destinationText = form.get("destino");
  const destination = typeof destinationText === "string" && destinationText ? z.enum(IMPORT_DESTINATIONS).safeParse(destinationText) : null;
  if (destination && !destination.success) return { ok: false, error: "Destino inválido." };
  const typeText = form.get("tipo");
  const type = typeof typeText === "string" && typeText ? comparableTypeSchema.safeParse(typeText) : null;
  if (type && !type.success) return { ok: false, error: "Tipo de comparable inválido" };
  const reuse = answersSchema.safeParse(parseJson(form.get("reusar")));
  if (!reuse.success) return { ok: false, error: "Los comparables existentes elegidos no son válidos." };
  const merge = answersSchema.safeParse(parseJson(form.get("unificar")));
  if (!merge.success) return { ok: false, error: "Los comparables con que se unifican no son válidos." };
  return {
    ok: true,
    data: { file, destination: destination?.data ?? null, defaultType: type?.data ?? null, reuse: reuse.data, merge: merge.data },
  };
}
