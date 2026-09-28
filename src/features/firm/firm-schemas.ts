import { z } from "zod";
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
  appraiserName: optionalText(180),
  appraiserRegistration: optionalText(120),
  validityMonths: z.number().int().min(1, "Entre 1 y 24 meses.").max(24, "Entre 1 y 24 meses."),
  folioPrefix: z.string().transform(normalizeFolioPrefix).pipe(z.string().min(1, "Escribe un prefijo.").max(10, "Máximo 10 caracteres.")),
});

export type FirmSettingsInput = z.infer<typeof firmSettingsSchema>;
