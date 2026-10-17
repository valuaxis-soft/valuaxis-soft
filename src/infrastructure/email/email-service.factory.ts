import {
  AmazonSesEmailService,
  createAmazonSesClient,
  type AmazonSesEmailConfig,
  type SesEmailClient,
} from "./amazon-ses-email.service";
import { DevelopmentEmailService } from "./development-email.service";
import { EmailConfigurationError } from "./email.errors";
import type { EmailService } from "./email.service";

type EmailProviderName = "development" | "ses";

export function createEmailService(
  environment: NodeJS.ProcessEnv = process.env,
  clientFactory: (config: AmazonSesEmailConfig) => SesEmailClient = createAmazonSesClient,
): EmailService {
  const provider = readEmailProvider(environment);

  if (provider === "development") {
    return new DevelopmentEmailService();
  }

  const config = buildAmazonSesConfig(environment);
  return new AmazonSesEmailService(clientFactory(config), config);
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

  if (!environment.SES_FROM_EMAIL) {
    missing.push("SES_FROM_EMAIL");
  }

  if (!environment.SES_FROM_NAME) {
    missing.push("SES_FROM_NAME");
  }

  if (!environment.APP_URL) {
    missing.push("APP_URL");
  }

  if (missing.length > 0) {
    throw new EmailConfigurationError(
      `EMAIL_PROVIDER=ses requiere variables faltantes: ${missing.join(", ")}`,
    );
  }

  return {
    region: region!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    fromEmail: environment.SES_FROM_EMAIL!,
    fromName: environment.SES_FROM_NAME!,
  };
}

function readEmailProvider(environment: NodeJS.ProcessEnv): EmailProviderName {
  const provider = environment.EMAIL_PROVIDER;
  if (provider === "development" || provider === "ses") return provider;

  throw new EmailConfigurationError('EMAIL_PROVIDER debe ser "development" o "ses".');
}
