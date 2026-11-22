import {
  AmazonSesEmailService,
  createAmazonSesClient,
  type AmazonSesEmailConfig,
  type SesEmailClient,
} from "./amazon-ses-email.service";
import { DevelopmentEmailService } from "./development-email.service";
import { EmailConfigurationError } from "./email.errors";
import type { EmailService } from "./email.service";
import { ResendEmailService, type ResendEmailConfig } from "./resend-email.service";

type EmailProviderName = "development" | "ses" | "resend";

export function createEmailService(
  environment: NodeJS.ProcessEnv = process.env,
  clientFactory: (config: AmazonSesEmailConfig) => SesEmailClient = createAmazonSesClient,
): EmailService {
  const provider = readEmailProvider(environment);

  if (provider === "development") {
    return new DevelopmentEmailService();
  }

  if (provider === "resend") {
    return new ResendEmailService(buildResendConfig(environment));
  }

  const config = buildAmazonSesConfig(environment);
  return new AmazonSesEmailService(clientFactory(config), config);
}

/**
 * The sender is provider-neutral (EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME,
 * EMAIL_REPLY_TO); SES_FROM_EMAIL and SES_FROM_NAME still work as fallbacks so
 * an existing SES setup keeps running unchanged. EMAIL_FROM is not read: an old
 * production.env defines it with a value the code never used.
 */
function readSender(environment: NodeJS.ProcessEnv, missing: string[]) {
  const fromEmail = environment.EMAIL_FROM_ADDRESS || environment.SES_FROM_EMAIL;
  const fromName = environment.EMAIL_FROM_NAME || environment.SES_FROM_NAME;
  if (!fromEmail) missing.push("EMAIL_FROM_ADDRESS (o SES_FROM_EMAIL)");
  if (!fromName) missing.push("EMAIL_FROM_NAME (o SES_FROM_NAME)");
  if (!environment.APP_URL) missing.push("APP_URL");
  return { fromEmail: fromEmail!, fromName: fromName!, ...(environment.EMAIL_REPLY_TO ? { replyTo: environment.EMAIL_REPLY_TO } : {}) };
}

export function buildResendConfig(environment: NodeJS.ProcessEnv): ResendEmailConfig {
  const missing: string[] = [];
  if (!environment.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  const sender = readSender(environment, missing);

  if (missing.length > 0) {
    throw new EmailConfigurationError(
      `EMAIL_PROVIDER=resend requiere variables faltantes: ${missing.join(", ")}`,
    );
  }

  return { apiKey: environment.RESEND_API_KEY!, ...sender };
}

export function buildAmazonSesConfig(environment: NodeJS.ProcessEnv): AmazonSesEmailConfig {
  const region = environment.AWS_SES_REGION || environment.AWS_REGION;

  const hasSesSpecificCredentials =
    Boolean(environment.AWS_SES_ACCESS_KEY_ID) ||
    Boolean(environment.AWS_SES_SECRET_ACCESS_KEY);

  const accessKeyId = hasSesSpecificCredentials
    ? environment.AWS_SES_ACCESS_KEY_ID
    : environment.AWS_ACCESS_KEY_ID;

  const secretAccessKey = hasSesSpecificCredentials
    ? environment.AWS_SES_SECRET_ACCESS_KEY
    : environment.AWS_SECRET_ACCESS_KEY;

  const missing: string[] = [];

  if (!region) {
    missing.push("AWS_SES_REGION (fallback temporal: AWS_REGION)");
  }

  if (!accessKeyId) {
    missing.push("AWS_SES_ACCESS_KEY_ID (fallback temporal: AWS_ACCESS_KEY_ID)");
  }

  if (!secretAccessKey) {
    missing.push("AWS_SES_SECRET_ACCESS_KEY (fallback temporal: AWS_SECRET_ACCESS_KEY)");
  }

  const sender = readSender(environment, missing);

  if (missing.length > 0) {
    throw new EmailConfigurationError(
      `EMAIL_PROVIDER=ses requiere variables faltantes: ${missing.join(", ")}`,
    );
  }

  return {
    region: region!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    ...sender,
  };
}

function readEmailProvider(environment: NodeJS.ProcessEnv): EmailProviderName {
  const provider = environment.EMAIL_PROVIDER;
  if (provider === "development" || provider === "ses" || provider === "resend") return provider;

  throw new EmailConfigurationError('EMAIL_PROVIDER debe ser "development", "ses" o "resend".');
}
