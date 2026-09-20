import type { EmailService, PasswordResetEmailInput, VerificationEmailInput } from "./email.service";

export class DevelopmentEmailService implements EmailService {
  async sendVerificationEmail(input: VerificationEmailInput) {
    if (process.env.NODE_ENV !== "production") {
      console.info("Development verification email prepared", {
        to: input.to,
        name: input.name,
      });
    }
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput) {
    if (process.env.NODE_ENV !== "production") {
      console.info("Development password reset email prepared", {
        to: input.to,
        name: input.name,
      });
    }
  }
}
