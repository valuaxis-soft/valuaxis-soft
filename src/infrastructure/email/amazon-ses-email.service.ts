import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import {
  buildPasswordResetEmailHtml,
  buildPasswordResetEmailText,
} from "@/features/notifications/templates/reset-password";
import {
  buildVerificationEmailHtml,
  buildVerificationEmailText,
} from "@/features/notifications/templates/verify-email";
import { EmailDeliveryError } from "./email.errors";
import type { EmailService, PasswordResetEmailInput, VerificationEmailInput } from "./email.service";

export type AmazonSesEmailConfig = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
  fromName: string;
};

export type SesEmailClient = {
  send(command: SendEmailCommand): Promise<unknown>;
};

const CHARSET = "UTF-8";

export function createAmazonSesClient(config: AmazonSesEmailConfig) {
  return new SESv2Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export class AmazonSesEmailService implements EmailService {
  constructor(
    private readonly client: SesEmailClient,
    private readonly config: AmazonSesEmailConfig,
  ) {}

  async sendVerificationEmail(input: VerificationEmailInput) {
    await this.sendEmail({
      to: input.to,
      subject: "Verifica tu correo en Valuo",
      text: buildVerificationEmailText(input.verificationUrl),
      html: buildVerificationEmailHtml({
        name: input.name,
        verificationUrl: input.verificationUrl,
      }),
    });
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput) {
    await this.sendEmail({
      to: input.to,
      subject: "Restablece tu contrasena de Valuo",
      text: buildPasswordResetEmailText(input.resetUrl),
      html: buildPasswordResetEmailHtml({
        name: input.name,
        resetUrl: input.resetUrl,
      }),
    });
  }

  private async sendEmail(input: { to: string; subject: string; text: string; html: string }) {
    const command = new SendEmailCommand({
      FromEmailAddress: formatFromAddress(this.config.fromName, this.config.fromEmail),
      Destination: {
        ToAddresses: [input.to],
      },
      Content: {
        Simple: {
          Subject: {
            Charset: CHARSET,
            Data: input.subject,
          },
          Body: {
            Text: {
              Charset: CHARSET,
              Data: input.text,
            },
            Html: {
              Charset: CHARSET,
              Data: input.html,
            },
          },
        },
      },
    });

    try {
      await this.client.send(command);
    } catch (error) {
      console.error("Amazon SES email delivery failed", {
        provider: "ses",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown SES error",
      });
      throw new EmailDeliveryError("No pudimos enviar el correo por Amazon SES.", { cause: error });
    }
  }
}

function formatFromAddress(name: string, email: string) {
  const safeName = name.replace(/[\r\n"]/g, "").trim();
  const safeEmail = email.replace(/[\r\n<>]/g, "").trim();
  if (!safeName) return safeEmail;
  return `"${safeName}" <${safeEmail}>`;
}
