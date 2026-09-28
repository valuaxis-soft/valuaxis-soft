import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import {
  buildPasswordResetEmailHtml,
  buildPasswordResetEmailText,
} from "@/features/notifications/templates/reset-password";
import {
  buildVerificationEmailHtml,
  buildVerificationEmailText,
} from "@/features/notifications/templates/verify-email";
import {
  buildTeamInvitationEmailHtml,
  buildTeamInvitationEmailSubject,
  buildTeamInvitationEmailText,
} from "@/features/notifications/templates/team-invitation";
import {
  buildDictamenEmailHtml,
  buildDictamenEmailText,
} from "@/features/notifications/templates/dictamen-email";
import {
  buildValuationNoticeHtml,
  buildValuationNoticeSubject,
  buildValuationNoticeText,
} from "@/features/notifications/templates/valuation-notice";
import { EmailDeliveryError } from "./email.errors";
import { buildMimeMessage } from "./mime-message";
import type {
  DictamenEmailInput,
  EmailService,
  PasswordResetEmailInput,
  TeamInvitationEmailInput,
  ValuationNoticeInput,
  VerificationEmailInput,
} from "./email.service";

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
      subject: "Verifica tu correo en Valuaxis",
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
      subject: "Restablece tu contraseña de Valuaxis",
      text: buildPasswordResetEmailText(input.resetUrl),
      html: buildPasswordResetEmailHtml({
        name: input.name,
        resetUrl: input.resetUrl,
      }),
    });
  }

  async sendTeamInvitationEmail(input: TeamInvitationEmailInput) {
    await this.sendEmail({
      to: input.to,
      subject: buildTeamInvitationEmailSubject(input),
      text: buildTeamInvitationEmailText(input),
      html: buildTeamInvitationEmailHtml(input),
    });
  }

  /** Raw MIME: SES only attaches files that way. The firm's name shows as the sender. */
  async sendDictamenEmail(input: DictamenEmailInput) {
    const message = buildMimeMessage({
      from: { name: input.firm.name, email: this.config.fromEmail },
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      text: buildDictamenEmailText(input),
      html: buildDictamenEmailHtml(input),
      attachments: [{ filename: input.pdf.filename, contentType: "application/pdf", content: input.pdf.content }],
    });
    await this.deliver(new SendEmailCommand({
      Destination: { ToAddresses: input.to },
      ...(input.replyTo ? { ReplyToAddresses: [input.replyTo] } : {}),
      Content: { Raw: { Data: message } },
    }));
  }

  async sendValuationNotice(input: ValuationNoticeInput) {
    await this.sendEmail({
      to: input.to,
      subject: buildValuationNoticeSubject(input),
      text: buildValuationNoticeText(input),
      html: buildValuationNoticeHtml(input),
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

    await this.deliver(command);
  }

  private async deliver(command: SendEmailCommand) {
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
