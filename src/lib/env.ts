import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  APP_URL: z.string().optional(),

  EMAIL_PROVIDER: z.enum(["development", "ses"]).optional(),
  EMAIL_FROM: z.string().optional(),
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
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  UPLOAD_DIR: z.string().default("public/uploads"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
  TEST_EMAIL_TO: z.string().optional(),
  /** Chromium that prints the dictamen to PDF; the image sets /usr/bin/chromium. */
  CHROMIUM_PATH: z.string().optional(),
  /** Where that Chromium reaches this app; defaults to http://127.0.0.1:$PORT. */
  INTERNAL_APP_URL: z.string().url().optional().or(z.literal("")),
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
  return envSchema.partial({ DATABASE_URL: true }).parse({}) as Env;
}

export const env = loadEnv();
