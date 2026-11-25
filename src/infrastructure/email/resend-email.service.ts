/**
 * Resend through its REST API (POST /emails) with the platform fetch, so no
 * SDK is needed. Attachments go inline as base64; the API key only travels
 * in the Authorization header and is never logged.
 */
import {
  billingNoticeContent,
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
import type {
  BillingNoticeInput,
  AccountNoticeEmailInput,
  DictamenEmailInput,
  EmailService,
  InvoiceEmailInput,
  PasswordResetEmailInput,
  TeamInvitationEmailInput,
  SupportReportInput,
  ValuationNoticeInput,
  VerificationEmailInput,
} from "./email.service";

export type ResendEmailConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  /** Where replies to system emails go; without it they go to the sender. */
  replyTo?: string;
};

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

/** Uploading a 25 MB PDF takes seconds; the dictamen route allows 120 s and the PDF may take 90. */
export const RESEND_TIMEOUT_MS = 25_000;

/** Resend accepts at most 40 MB per email, counting attachments after base64. */
export const RESEND_MAX_ATTACHMENTS_BASE64_BYTES = 40 * 1024 * 1024;

type ResendPayload = {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: string; content_type: string }[];
};

export class ResendEmailService implements EmailService {
  readonly delivers = true;

  constructor(
    private readonly config: ResendEmailConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async sendVerificationEmail(input: VerificationEmailInput) {
    await this.sendSystemEmail(input.to, verificationEmailContent(input));
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput) {
    await this.sendSystemEmail(input.to, passwordResetEmailContent(input));
  }

  async sendTeamInvitationEmail(input: TeamInvitationEmailInput) {
    await this.sendSystemEmail(input.to, teamInvitationEmailContent(input));
  }

  /** In the firm's name, with the PDF attached; replies go to the firm, as with SES. */
  async sendDictamenEmail(input: DictamenEmailInput) {
    const content = input.pdf.content.toString("base64");
    if (Buffer.byteLength(content) > RESEND_MAX_ATTACHMENTS_BASE64_BYTES) {
      throw new EmailDeliveryError("El adjunto pesa más de lo que Resend acepta en un correo (40 MB).");
    }
    await this.deliver({
      from: formatFromAddress(dictamenSenderName(input.firm.name), this.config.fromEmail),
      to: input.to,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...dictamenEmailContent(input),
      attachments: [{ filename: input.pdf.filename, content, content_type: "application/pdf" }],
    });
  }

  async sendValuationNotice(input: ValuationNoticeInput) {
    await this.sendSystemEmail(input.to, valuationNoticeContent(input));
  }

  async sendSupportReport(input: SupportReportInput) {
    await this.sendSystemEmail(input.to, supportReportContent(input));
  }

  async sendBillingNotice(input: BillingNoticeInput) {
    await this.sendSystemEmail(input.to, billingNoticeContent(input));
  }

  async sendAccountNotice(input: AccountNoticeEmailInput) {
    await this.sendSystemEmail(input.to, { subject: input.subject, text: input.text, html: input.html });
  }

  async sendInvoiceEmail(input: InvoiceEmailInput) {
    await this.deliver({
      from: formatFromAddress(this.config.fromName, this.config.fromEmail),
      to: [input.to],
      ...(this.config.replyTo ? { reply_to: this.config.replyTo } : {}),
      ...invoiceEmailContent(input),
      attachments: invoiceAttachments(input).map((file) => ({ filename: file.filename, content: file.content.toString("base64"), content_type: file.contentType })),
    });
  }

  private async sendSystemEmail(to: string, content: { subject: string; text: string; html: string }) {
    await this.deliver({
      from: formatFromAddress(this.config.fromName, this.config.fromEmail),
      to: [to],
      ...(this.config.replyTo ? { reply_to: this.config.replyTo } : {}),
      ...content,
    });
  }

  /** Every failure (rejection, timeout, non-2xx) becomes an EmailDeliveryError, as with SES. */
  private async deliver(payload: ResendPayload) {
    let status: number | undefined;
    try {
      const response = await this.fetchImpl(RESEND_EMAILS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });
      status = response.status;
      if (response.ok) return;
      const body = (await response.json().catch(() => null)) as { name?: unknown; message?: unknown } | null;
      throw Object.assign(new Error(typeof body?.message === "string" ? body.message : `HTTP ${status}`), {
        name: typeof body?.name === "string" ? body.name : "ResendError",
      });
    } catch (error) {
      console.error("Resend email delivery failed", {
        provider: "resend",
        status,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown Resend error",
      });
      throw new EmailDeliveryError("No pudimos enviar el correo por Resend.", { cause: error });
    }
  }
}
