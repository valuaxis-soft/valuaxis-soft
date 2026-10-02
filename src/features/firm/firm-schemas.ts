import { z } from "zod";
import {
  MAX_VALIDITY_MONTHS,
  MIN_VALIDITY_MONTHS,
  parseSignatures,
  VALIDITY_MONTHS_ERROR,
  type ValuationSignature,
} from "@/features/valuations/services/valuation-signatures";
import { normalizeFolioPrefix } from "./firm-rules";

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((value) => (value.length ? value : null)).nullable().optional()
    .transform((value) => value ?? null);

export const firmSettingsSchema = z.object({
  legalName: optionalText(220),
  rfc: z.string().trim().toUpperCase().max(20).transform((value) => (value.length ? value : null)).nullable().optional()
    .transform((value) => value ?? null)
    .refine((value) => value === null || /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(value), "Escribe un RFC válido."),
  address: optionalText(500),
  phone: optionalText(30),
  email: z.string().trim().toLowerCase().max(180).transform((value) => (value.length ? value : null)).nullable().optional()
    .transform((value) => value ?? null)
    .refine((value) => value === null || z.email().safeParse(value).success, "Escribe un correo válido."),
  /** The signatures every new valuation starts with; none when left out. */
  signers: z.unknown().optional().transform((value, context): ValuationSignature[] => {
    const parsed = parseSignatures(value ?? []);
    if (parsed.ok) return parsed.value;
    context.addIssue({ code: "custom", message: parsed.error });
    return z.NEVER;
  }),
  validityMonths: z.number().int(VALIDITY_MONTHS_ERROR).min(MIN_VALIDITY_MONTHS, VALIDITY_MONTHS_ERROR).max(MAX_VALIDITY_MONTHS, VALIDITY_MONTHS_ERROR),
  folioPrefix: z.string().transform(normalizeFolioPrefix).pipe(z.string().min(1, "Escribe un prefijo.").max(10, "Máximo 10 caracteres.")),
});

export type FirmSettingsInput = z.infer<typeof firmSettingsSchema>;
