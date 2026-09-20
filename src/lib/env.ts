import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .default(
      "postgresql://devpware_avaluos_user:COLOCAR_CONTRASENA_AQUI@localhost:5432/devpware_avaluos?schema=public",
    ),

  APP_URL: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["development", "ses"]).optional(),
  EMAIL_FROM: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_REGION: z.string().optional(),
  AWS_S3_ENDPOINT: z.string().url().optional().or(z.literal("")),
  SES_FROM_EMAIL: z.string().optional(),
  SES_FROM_NAME: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  UPLOAD_DIR: z.string().default("public/uploads"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
  TEST_EMAIL_TO: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.warn("Invalid environment variables:", result.error.flatten().fieldErrors);
    return envSchema.parse({});
  }
  return result.data;
}

export const env = loadEnv();
