import type { TeamInvitationEmailContent } from "@/features/notifications/templates/team-invitation";
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

export interface EmailService {
  sendVerificationEmail(input: VerificationEmailInput): Promise<void>;
  sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void>;
  sendTeamInvitationEmail(input: TeamInvitationEmailInput): Promise<void>;
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
