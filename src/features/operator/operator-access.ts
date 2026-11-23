/**
 * The platform operator: whoever runs the installation (the owner of the
 * service, not of a firm). It is not a role of an organization; it comes from
 * OPERATOR_EMAILS (comma-separated, case-insensitive). Without it nobody is an
 * operator. An operator is still a normal member of their own firms: these
 * rights only open the operator pages (/operador/**), never anyone's valuations.
 *
 * Read on every call (validated in src/lib/env.ts), so a restart with a new
 * list applies at once and the tests can set it.
 */

/** The operator emails of a raw OPERATOR_EMAILS value, trimmed and lowercased. */
export function parseOperatorEmails(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.includes("@")),
  );
}

export function isPlatformOperator(email: string | null | undefined, raw: string | undefined = process.env.OPERATOR_EMAILS): boolean {
  if (!email) return false;
  return parseOperatorEmails(raw).has(email.trim().toLowerCase());
}

export const OPERATOR_USER_DIRECTORY_HREF = "/operador/usuarios";
