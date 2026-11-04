/**
 * Where the subject property is and how its croquis are framed, as the
 * subject property keeps them in `Propiedad.JCaracteristicas` (no column of
 * their own; the valuation's address row is rewritten on every save with no
 * coordinates). Pure reading and writing of that JSON, shared by the service
 * and the tests.
 */
import { z } from "zod";

import { croquisSettingsSchema, latLonSchema, readCroquisSettings, type CroquisSettings } from "./croquis";

/** Keys inside JCaracteristicas; the own-kind names (`tipoBienOtro`…) live beside them. */
export const SUBJECT_LOCATION_KEY = "ubicacion";
export const CROQUIS_SETTINGS_KEY = "croquis";

export const subjectLocationSchema = z.object({
  point: latLonSchema,
  /** The address the pin was found with, or null when it was dragged by hand. */
  address: z.string().max(500).nullable(),
  /** "busqueda": found by geocoding the address; "pin": placed by hand on the map. */
  source: z.enum(["busqueda", "pin"]),
  /** ISO date of the last change. */
  updatedAt: z.string(),
});

export type SubjectLocation = z.infer<typeof subjectLocationSchema>;

/** What the editor sends: the pin and the settings, either optional (absent, it keeps what is stored). */
export const subjectLocationInputSchema = z.object({
  location: z.object({ point: latLonSchema, address: z.string().max(500).nullable().optional(), source: z.enum(["busqueda", "pin"]) }).nullable().optional(),
  croquis: croquisSettingsSchema.optional(),
});

export type SubjectLocationInput = z.infer<typeof subjectLocationInputSchema>;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export function readSubjectLocation(characteristics: unknown): SubjectLocation | null {
  const parsed = subjectLocationSchema.safeParse(asRecord(characteristics)[SUBJECT_LOCATION_KEY]);
  return parsed.success ? parsed.data : null;
}

export function readSubjectCroquisSettings(characteristics: unknown): CroquisSettings {
  return readCroquisSettings(asRecord(characteristics)[CROQUIS_SETTINGS_KEY]);
}

/**
 * The characteristics with the pin and the settings applied: `location`
 * null removes the pin, absent keeps it; the settings replace the stored
 * ones when sent. Every other key stays as it was.
 */
export function withSubjectLocation(characteristics: unknown, input: SubjectLocationInput, now = new Date()): Record<string, unknown> {
  const current = { ...asRecord(characteristics) };
  if (input.location === null) delete current[SUBJECT_LOCATION_KEY];
  else if (input.location) {
    const location: SubjectLocation = {
      point: input.location.point,
      address: input.location.address?.trim() || null,
      source: input.location.source,
      updatedAt: now.toISOString(),
    };
    current[SUBJECT_LOCATION_KEY] = location;
  }
  if (input.croquis) current[CROQUIS_SETTINGS_KEY] = input.croquis;
  return current;
}
