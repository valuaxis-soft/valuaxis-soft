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

const SES_REQUIRED_ENV = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "SES_FROM_EMAIL",
  "SES_FROM_NAME",
  "APP_URL",
] as const;

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
  const missing = SES_REQUIRED_ENV.filter((key) => !environment[key]);
  if (missing.length > 0) {
    throw new EmailConfigurationError(`EMAIL_PROVIDER=ses requiere variables faltantes: ${missing.join(", ")}`);
  }

  return {
    region: environment.AWS_REGION!,
    accessKeyId: environment.AWS_ACCESS_KEY_ID!,
    secretAccessKey: environment.AWS_SECRET_ACCESS_KEY!,
    fromEmail: environment.SES_FROM_EMAIL!,
    fromName: environment.SES_FROM_NAME!,
  };
}

function readEmailProvider(environment: NodeJS.ProcessEnv): EmailProviderName {
  const provider = environment.EMAIL_PROVIDER;
  if (provider === "development" || provider === "ses") return provider;

  throw new EmailConfigurationError('EMAIL_PROVIDER debe ser "development" o "ses".');
}
