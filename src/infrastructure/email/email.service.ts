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

export interface EmailService {
  sendVerificationEmail(input: VerificationEmailInput): Promise<void>;
  sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void>;
}

export const emailService: EmailService = createEmailService();
