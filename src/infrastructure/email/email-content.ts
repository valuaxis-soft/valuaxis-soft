/**
 * Subject and bodies of every email, shared by all providers so that the
 * recipient reads the same message whichever one sends it.
 */
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
import {
  buildSupportReportHtml,
  buildSupportReportSubject,
  buildSupportReportText,
} from "@/features/notifications/templates/support-report";
import {
  buildInvoiceEmailHtml,
  buildInvoiceEmailSubject,
  buildInvoiceEmailText,
} from "@/features/notifications/templates/invoice-email";
import { buildBillingNoticeHtml, buildBillingNoticeText } from "@/features/notifications/templates/billing-notice";
import type {
  BillingNoticeInput,
  DictamenEmailInput,
  InvoiceEmailInput,
  PasswordResetEmailInput,
  SupportReportInput,
  TeamInvitationEmailInput,
  ValuationNoticeInput,
  VerificationEmailInput,
} from "./email.service";

type EmailContent = { subject: string; text: string; html: string };

export const verificationEmailContent = (input: VerificationEmailInput): EmailContent => ({
  subject: "Verifica tu correo en Valuaxis Soft",
  text: buildVerificationEmailText(input.verificationUrl),
  html: buildVerificationEmailHtml({ name: input.name, verificationUrl: input.verificationUrl }),
});

export const passwordResetEmailContent = (input: PasswordResetEmailInput): EmailContent => ({
  subject: "Restablece tu contraseña de Valuaxis Soft",
  text: buildPasswordResetEmailText(input.resetUrl),
  html: buildPasswordResetEmailHtml({ name: input.name, resetUrl: input.resetUrl }),
});

export const teamInvitationEmailContent = (input: TeamInvitationEmailInput): EmailContent => ({
  subject: buildTeamInvitationEmailSubject(input),
  text: buildTeamInvitationEmailText(input),
  html: buildTeamInvitationEmailHtml(input),
});

export const dictamenEmailContent = (input: DictamenEmailInput): EmailContent => ({
  subject: input.subject,
  text: buildDictamenEmailText(input),
  html: buildDictamenEmailHtml(input),
});

export const valuationNoticeContent = (input: ValuationNoticeInput): EmailContent => ({
  subject: buildValuationNoticeSubject(input),
  text: buildValuationNoticeText(input),
  html: buildValuationNoticeHtml(input),
});

export const supportReportContent = (input: SupportReportInput): EmailContent => ({
  subject: buildSupportReportSubject(input),
  text: buildSupportReportText(input),
  html: buildSupportReportHtml(input),
});

export const invoiceEmailContent = (input: InvoiceEmailInput): EmailContent => ({
  subject: buildInvoiceEmailSubject(input),
  text: buildInvoiceEmailText(input),
  html: buildInvoiceEmailHtml(input),
});

export const billingNoticeContent = (input: BillingNoticeInput): EmailContent => ({
  subject: input.subject,
  text: buildBillingNoticeText(input),
  html: buildBillingNoticeHtml(input),
});

/** The two files of a CFDI, as every provider attaches them. */
export const invoiceAttachments = (input: InvoiceEmailInput) => [
  { filename: input.pdf.filename, contentType: "application/pdf", content: input.pdf.content },
  { filename: input.xml.filename, contentType: "application/xml", content: input.xml.content },
];

/**
 * The dictamen leaves as "<firm> vía Valuaxis Soft": the firm is visible, and
 * nobody can pose as someone else just by naming their space that way.
 */
export const dictamenSenderName = (firmName: string) => `${firmName} vía Valuaxis Soft`;

/** `"Name" <email>` for providers that take the sender as plain text, not as a MIME header. */
export function formatFromAddress(name: string, email: string) {
  const safeName = name.replace(/[\r\n"]/g, "").trim();
  const safeEmail = email.replace(/[\r\n<>]/g, "").trim();
  if (!safeName) return safeEmail;
  return `"${safeName}" <${safeEmail}>`;
}
