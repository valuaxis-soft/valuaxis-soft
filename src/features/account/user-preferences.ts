import { z } from "zod";

/**
 * The person's own preferences, kept in `devpware_usuarios.JPreferencias`.
 * For now the editor's autosave interval (NP-01): the appraiser chooses how
 * long after the last edit the editor saves on its own, or turns it off.
 */

/** Seconds after the last edit; 0 turns autosave off. */
export const AUTOSAVE_INTERVAL_OPTIONS = [
  { seconds: 0, label: "Desactivado" },
  { seconds: 10, label: "10 segundos" },
  { seconds: 15, label: "15 segundos (predeterminado)" },
  { seconds: 30, label: "30 segundos" },
  { seconds: 60, label: "1 minuto" },
  { seconds: 300, label: "5 minutos" },
] as const;

export type AutosaveSeconds = (typeof AUTOSAVE_INTERVAL_OPTIONS)[number]["seconds"];

export const DEFAULT_AUTOSAVE_SECONDS: AutosaveSeconds = 15;

const ALLOWED_SECONDS: ReadonlySet<number> = new Set(AUTOSAVE_INTERVAL_OPTIONS.map((option) => option.seconds));

const autosaveSecondsSchema = z.custom<AutosaveSeconds>(
  (value) => typeof value === "number" && ALLOWED_SECONDS.has(value),
  { message: "Elige un intervalo de guardado automático de la lista." },
);

export type UserPreferences = { autosaveSeconds: AutosaveSeconds };

/** What `PATCH /api/cuenta/preferencias` accepts. */
export const userPreferencesPatchSchema = z.object({ autosaveSeconds: autosaveSecondsSchema }).strict();

/** The stored JSON as preferences: anything missing or unknown is the default. Pure. */
export function resolveUserPreferences(stored: unknown): UserPreferences {
  const record = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const autosave = autosaveSecondsSchema.safeParse(record.autosaveSeconds);
  return { autosaveSeconds: autosave.success ? autosave.data : DEFAULT_AUTOSAVE_SECONDS };
}

/** The wait the editor uses, in milliseconds; null when autosave is off. Pure. */
export const autosaveDelayMs = (seconds: AutosaveSeconds): number | null => (seconds > 0 ? seconds * 1000 : null);

/** «15 s después del último cambio», «1 min después…»; «desactivado» when off. Pure. */
export function describeAutosave(seconds: AutosaveSeconds): string {
  if (seconds === 0) return "desactivado";
  return seconds < 60 ? `${seconds} s después del último cambio` : `${seconds / 60} min después del último cambio`;
}
