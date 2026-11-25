import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import {
  dictamenEmailContent,
  dictamenSenderName,
  formatFromAddress,
  invoiceAttachments,
  invoiceEmailContent,
  passwordResetEmailContent,
  teamInvitationEmailContent,
  supportReportContent,
  valuationNoticeContent,
  verificationEmailContent,
} from "./email-content";
import { EmailDeliveryError } from "./email.errors";
import { buildMimeMessage } from "./mime-message";
import type {
  DictamenEmailInput,
  EmailService,
  InvoiceEmailInput,
  PasswordResetEmailInput,
  TeamInvitationEmailInput,
  SupportReportInput,
  ValuationNoticeInput,
  VerificationEmailInput,
} from "./email.service";

export type AmazonSesEmailConfig = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
  fromName: string;
  /** Where replies to system emails go; without it they go to the sender. */
  replyTo?: string;
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
  readonly delivers = true;

  constructor(
    private readonly client: SesEmailClient,
    private readonly config: AmazonSesEmailConfig,
  ) {}

  async sendVerificationEmail(input: VerificationEmailInput) {
    await this.sendEmail(input.to, verificationEmailContent(input));
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput) {
    await this.sendEmail(input.to, passwordResetEmailContent(input));
  }

  async sendTeamInvitationEmail(input: TeamInvitationEmailInput) {
    await this.sendEmail(input.to, teamInvitationEmailContent(input));
  }

  /** Raw MIME: SES only attaches files that way. Replies go to the firm. */
  async sendDictamenEmail(input: DictamenEmailInput) {
    const message = buildMimeMessage({
      from: { name: dictamenSenderName(input.firm.name), email: this.config.fromEmail },
      to: input.to,
      replyTo: input.replyTo,
      ...dictamenEmailContent(input),
      attachments: [{ filename: input.pdf.filename, contentType: "application/pdf", content: input.pdf.content }],
    });
    await this.deliver(new SendEmailCommand({
      Destination: { ToAddresses: input.to },
      ...(input.replyTo ? { ReplyToAddresses: [input.replyTo] } : {}),
      Content: { Raw: { Data: message } },
    }));
  }

  async sendValuationNotice(input: ValuationNoticeInput) {
    await this.sendEmail(input.to, valuationNoticeContent(input));
  }

  async sendSupportReport(input: SupportReportInput) {
    await this.sendEmail(input.to, supportReportContent(input));
  }

  /** Raw MIME, as the dictamen: SES only attaches files that way. */
  async sendInvoiceEmail(input: InvoiceEmailInput) {
    const message = buildMimeMessage({
      from: { name: this.config.fromName, email: this.config.fromEmail },
      to: [input.to],
      replyTo: this.config.replyTo ?? null,
      ...invoiceEmailContent(input),
      attachments: invoiceAttachments(input),
    });
    await this.deliver(new SendEmailCommand({
      Destination: { ToAddresses: [input.to] },
      ...(this.config.replyTo ? { ReplyToAddresses: [this.config.replyTo] } : {}),
      Content: { Raw: { Data: message } },
    }));
  }

  private async sendEmail(to: string, content: { subject: string; text: string; html: string }) {
    const command = new SendEmailCommand({
      FromEmailAddress: formatFromAddress(this.config.fromName, this.config.fromEmail),
      Destination: {
        ToAddresses: [to],
      },
      ...(this.config.replyTo ? { ReplyToAddresses: [this.config.replyTo] } : {}),
      Content: {
        Simple: {
          Subject: {
            Charset: CHARSET,
            Data: content.subject,
          },
          Body: {
            Text: {
              Charset: CHARSET,
              Data: content.text,
            },
            Html: {
              Charset: CHARSET,
              Data: content.html,
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
