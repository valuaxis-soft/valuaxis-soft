import { env } from "@/lib/env";

let requiredOverride: boolean | undefined;

/** Tests turn LEGAL_ACCEPTANCE_REQUIRED on or off whatever the environment says; undefined restores it. */
export function overrideLegalAcceptanceRequired(required: boolean | undefined) {
  requiredOverride = required;
}

/**
 * Whether an account that has not accepted the published versions is held at
 * /aceptar-documentos (matrix 1.2). Off until the documents are published.
 */
export function isLegalAcceptanceRequired() {
  return requiredOverride ?? env.LEGAL_ACCEPTANCE_REQUIRED?.trim().toLowerCase() === "true";
}
