import type {
  EmailService,
  PasswordResetEmailInput,
  TeamInvitationEmailInput,
  VerificationEmailInput,
} from "./email.service";

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

  async sendTeamInvitationEmail(input: TeamInvitationEmailInput) {
    if (process.env.NODE_ENV !== "production") {
      // Local only: the link lets you accept without a mail server.
      console.info("Development team invitation email prepared", {
        to: input.to,
        organizationName: input.organizationName,
        inviteUrl: input.inviteUrl,
      });
    }
  }
}
