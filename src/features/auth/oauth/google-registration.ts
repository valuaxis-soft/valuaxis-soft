import { z } from "zod";
import { LEGAL_DOCUMENT_KEYS } from "@/features/legal/legal-documents";

/**
 * A sign-up started with «Continuar con Google» on «Crear cuenta»: the boxes,
 * the profile and the versions shown, kept with the OAuth request
 * (`devpware_solicitudes_oauth.JRegistro`, migration 064) until Google answers.
 * The IP, browser and registration cookie are those of the act of accepting.
 */
const registrationSchema = z.object({
  profile: z.object({
    phone: z.string().max(20),
    cedula: z.string().max(10).optional(),
    specialty: z.string().max(120),
  }),
  optional: z.object({ comercial: z.boolean(), boletin: z.boolean(), estadistica: z.boolean() }),
  documents: z
    .array(
      z.object({
        documento: z.enum([...LEGAL_DOCUMENT_KEYS, "textos-de-pantalla"]),
        version: z.number().int(),
        publicable: z.boolean(),
        hash: z.string().nullable(),
        id: z.number().int().nullable(),
      }),
    )
    .max(20),
  ip: z.string().max(64).nullable(),
  userAgent: z.string().max(1000).nullable(),
  cookieHash: z.string().max(128).nullable(),
});

export type GoogleRegistration = z.infer<typeof registrationSchema>;

/** The stored registration, or null when the request did not come from «Crear cuenta» (or is not one). */
export function parseGoogleRegistration(value: unknown): GoogleRegistration | null {
  const parsed = registrationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
