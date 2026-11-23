import type { DictamenEmailContent } from "@/features/notifications/templates/dictamen-email";
import type { InvoiceEmailContent } from "@/features/notifications/templates/invoice-email";
import type { TeamInvitationEmailContent } from "@/features/notifications/templates/team-invitation";
import type { ValuationNoticeContent } from "@/features/notifications/templates/valuation-notice";
import { createEmailService } from "./email-service.factory";

export type VerificationEmailInput = {
  to: string;
  name: string;
  verificationUrl: string;
};

export type PasswordResetEmailInput = {
  to: string;
  name: string;
  resetUrl: string;
};

export type TeamInvitationEmailInput = TeamInvitationEmailContent & { to: string };

/** The dictamen for the client, sent in the firm's name with the PDF attached. */
export type DictamenEmailInput = DictamenEmailContent & {
  to: string[];
  replyTo: string | null;
  subject: string;
  pdf: { filename: string; content: Buffer };
};

export type ValuationNoticeInput = ValuationNoticeContent & { to: string };

/** A CFDI for the organization that bought a package: its PDF and XML attached. */
export type InvoiceEmailInput = InvoiceEmailContent & {
  to: string;
  pdf: { filename: string; content: Buffer };
  xml: { filename: string; content: Buffer };
};

export interface EmailService {
  /** False for the development service: it only logs, and nothing reaches an inbox. */
  readonly delivers: boolean;
  sendVerificationEmail(input: VerificationEmailInput): Promise<void>;
  sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void>;
  sendTeamInvitationEmail(input: TeamInvitationEmailInput): Promise<void>;
  sendDictamenEmail(input: DictamenEmailInput): Promise<void>;
  sendValuationNotice(input: ValuationNoticeInput): Promise<void>;
  sendInvoiceEmail(input: InvoiceEmailInput): Promise<void>;
}

let instance: EmailService | null = null;

/**
 * Created on first use, not at import: a module that only imports this file
 * (for example during `next build`) must not fail when email is not configured.
 */
export function getEmailService(): EmailService {
  instance ??= createEmailService();
  return instance;
}
