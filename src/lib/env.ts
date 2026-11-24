import { z } from "zod";

const envObject = z.object({
  DATABASE_URL: z.string().min(1),

  APP_URL: z.string().optional(),

  EMAIL_PROVIDER: z.enum(["development", "ses", "resend"]).optional(),
  /** Not read by the code; kept because an old production.env defines it. The sender is EMAIL_FROM_ADDRESS. */
  EMAIL_FROM: z.string().optional(),
  /** Sender of every email, for any provider; falls back to SES_FROM_EMAIL / SES_FROM_NAME. */
  EMAIL_FROM_ADDRESS: z.string().optional(),
  EMAIL_FROM_NAME: z.string().optional(),
  /** Where replies to system emails go (the dictamen replies go to the firm). Optional. */
  EMAIL_REPLY_TO: z.string().optional(),
  /** Server-only key of Resend; required with EMAIL_PROVIDER=resend. */
  RESEND_API_KEY: z.string().optional(),
  AWS_SES_REGION: z.string().optional(),
  AWS_SES_ACCESS_KEY_ID: z.string().optional(),
  AWS_SES_SECRET_ACCESS_KEY: z.string().optional(),
  SES_FROM_EMAIL: z.string().optional(),
  SES_FROM_NAME: z.string().optional(),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_REGION: z.string().optional(),
  AWS_S3_ENDPOINT: z.string().url().optional().or(z.literal("")),
  AWS_S3_ACCESS_KEY_ID: z.string().optional(),
  AWS_S3_SECRET_ACCESS_KEY: z.string().optional(),

  /** Compatibilidad temporal durante la migración a credenciales por servicio. */
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  /**
   * Browser key for Google Maps (Maps JavaScript API), read at runtime. Optional: without it the
   * croquis panel says maps are not configured and the demonstration draws its own map.
   * Restricted by referrer; see docs/OPERACION.md, section 7.
   */
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  /**
   * Key the server uses for the Maps Static and Geocoding APIs (the croquis images and the address
   * search). A referrer-restricted key does not work from the server, so this one is restricted by
   * IP or not at all. Optional: without it the server uses GOOGLE_MAPS_API_KEY.
   */
  GOOGLE_MAPS_SERVER_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  UPLOAD_DIR: z.string().default("public/uploads"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
  TEST_EMAIL_TO: z.string().optional(),
  /** Chromium that prints the dictamen to PDF; the image sets /usr/bin/chromium. */
  CHROMIUM_PATH: z.string().optional(),
  /** Where that Chromium reaches this app; defaults to http://127.0.0.1:$PORT. */
  INTERNAL_APP_URL: z.string().url().optional().or(z.literal("")),
  /** Stripe is optional: without the secret key the app runs with payments not enabled. */
  STRIPE_SECRET_KEY: z.string().optional(),
  /** Signing secret of the webhook endpoint; without it the webhook rejects everything. */
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Valuaxis' own customer portal configuration (bpc_...), printed by pnpm stripe:sync. */
  STRIPE_PORTAL_CONFIGURATION: z.string().optional(),
  /**
   * Facturapi secret key (sk_live_… or sk_test_…): CFDI invoices of the package purchases.
   * Optional: without it nothing is invoiced and the page says so (docs/COBRO.md).
   */
  FACTURAPI_KEY: z.string().optional(),
  /** Tests and local checks only: a fake Facturapi. Empty uses https://www.facturapi.io/v2. */
  FACTURAPI_BASE_URL: z.string().url().optional().or(z.literal("")),
  /** c_ClaveProdServ of the invoice concept; empty uses 81112106. To be confirmed by the accountant. */
  INVOICE_PRODUCT_KEY: z.string().regex(/^\d{8}$/).optional().or(z.literal("")),
  /** c_ClaveUnidad of the invoice concept; empty uses E48 (Unidad de servicio). */
  INVOICE_UNIT_KEY: z.string().regex(/^[A-Z0-9]{2,3}$/).optional().or(z.literal("")),
  /** The AI assistance is optional: without the key its buttons do not render and its routes answer "no habilitado". */
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Model overrides; empty uses the defaults of src/infrastructure/ai/anthropic-gateway.ts. */
  AI_EXTRACTION_MODEL: z.string().optional(),
  AI_DRAFTING_MODEL: z.string().optional(),
  /**
   * «Buscar con IA» in the search of comparables: "true" turns it on. Each search runs the provider's
   * web search and costs far more than the other assisted features, so it is off unless asked for.
   */
  AI_COMPARABLE_SEARCH_ENABLED: z.string().optional(),
  AI_SEARCH_MODEL: z.string().optional(),
  /**
   * Key of the HMAC that stores the CURP of an accreditation (docs/ACREDITACION.md).
   * Optional; without it the CURP is kept as a plain SHA-256, weaker. Never change it once set.
   */
  ACCREDITATION_HASH_SECRET: z.string().min(32).optional().or(z.literal("")),
  /**
   * Emails of the platform operators, comma-separated, case-insensitive: they open the registry of
   * every user (/operador/usuarios). Without it nobody is an operator. Read on each request by
   * src/features/operator/operator-access.ts; see docs/AUTHORIZATION.md.
   */
  OPERATOR_EMAILS: z
    .string()
    .optional()
    .refine((value) => !value?.trim() || value.split(",").every((email) => !email.trim() || /^[^\s@,]+@[^\s@,]+$/.test(email.trim())), {
      message: "OPERATOR_EMAILS debe ser una lista de correos separados por comas",
    }),
  /**
   * Phone verification with Twilio Verify (docs/OPERACION.md, section 15). Optional: without the
   * three values «Mi cuenta» says it is not enabled yet and nothing asks for the phone.
   */
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
  /** Local trials only: a fake Verify API in place of Twilio's. Ignored in production. */
  TWILIO_API_BASE_URL: z.string().url().optional().or(z.literal("")),
  /** "true": creating a valuation requires a verified phone. Ignored while the Twilio keys are missing. */
  PHONE_VERIFICATION_REQUIRED: z.string().optional(),
  /**
   * Who takes a change of the valuation's format on opening (src/features/valuations/services/layout-refresh.ts):
   * "all" (default, the tuning phase) every valuation not concluded; "new" only those created since the
   * change shipped, the others with «Actualizar formato». Concluded valuations never change.
   */
  VALUATION_LAYOUT_REFRESH: z.enum(["all", "new"]).optional().or(z.literal("")),
});

const envSchema = envObject.superRefine((value, context) => {
  if (value.EMAIL_PROVIDER === "resend" && !value.RESEND_API_KEY) {
    context.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "EMAIL_PROVIDER=resend requiere RESEND_API_KEY" });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * A running production server must not start with a broken configuration, so
 * invalid variables throw. `next build` imports modules without the runtime
 * environment, and local tooling may run without every variable, so those only
 * warn and fall back to the defaults.
 */
function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (result.success) return result.data;

  const problems = result.error.flatten().fieldErrors;
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuild) {
    throw new Error(`Invalid environment variables: ${JSON.stringify(problems)}`);
  }
  console.warn("Invalid environment variables:", problems);
  return envObject.partial({ DATABASE_URL: true }).parse({}) as Env;
}

export const env = loadEnv();
