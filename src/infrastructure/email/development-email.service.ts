import type {
  DictamenEmailInput,
  EmailService,
  PasswordResetEmailInput,
  TeamInvitationEmailInput,
  ValuationNoticeInput,
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

  async sendDictamenEmail(input: DictamenEmailInput) {
    if (process.env.NODE_ENV !== "production") {
      console.info("Development dictamen email prepared", {
        to: input.to,
        subject: input.subject,
        attachment: `${input.pdf.filename} (${input.pdf.content.length} bytes)`,
      });
    }
  }

  async sendValuationNotice(input: ValuationNoticeInput) {
    if (process.env.NODE_ENV !== "production") {
      console.info("Development valuation notice prepared", { to: input.to, kind: input.kind, folio: input.folio });
    }
  }
}
