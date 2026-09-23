import type { AuthErrorCode, AuthFeedbackSeverity } from "../constants/auth-errors";

export type ActionResult<T = undefined> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      code: AuthErrorCode;
      message: string;
      severity?: AuthFeedbackSeverity;
      fieldErrors?: Record<string, string[]>;
    };

export type AuthenticatedUser = {
  id: number;
  publicId: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  active: boolean;
  emailVerified: boolean;
  organizationId: number;
  organizationName: string;
};
