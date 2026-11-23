import { createTwilioVerifyGateway } from "@/infrastructure/phone/twilio-verify-gateway";
import { env } from "@/lib/env";
import type { PhoneVerificationGateway } from "./phone-verification-gateway";

let cached: PhoneVerificationGateway | undefined;
let override: PhoneVerificationGateway | null | undefined;
let requiredOverride: boolean | undefined;
let warnedRequiredWithoutKeys = false;

/** Tests put a fake in place of Twilio, or null to run as without keys; undefined restores it. */
export function overridePhoneVerificationGateway(gateway: PhoneVerificationGateway | null | undefined) {
  override = gateway;
}

/** Tests turn PHONE_VERIFICATION_REQUIRED on or off whatever the environment says; undefined restores it. */
export function overridePhoneVerificationRequired(required: boolean | undefined) {
  requiredOverride = required;
}

function twilioConfig() {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID?.trim();
  return accountSid && authToken && serviceSid ? { accountSid, authToken, serviceSid } : null;
}

/** The verification is optional: without the three Twilio values the app runs exactly as before. */
export function isPhoneVerificationEnabled() {
  if (override !== undefined) return override !== null;
  return twilioConfig() !== null;
}

/**
 * Whether creating a valuation needs a verified phone. The switch is
 * PHONE_VERIFICATION_REQUIRED; without the provider nobody could verify, so it
 * is ignored then (and said once in the log).
 */
export function isPhoneVerificationRequired() {
  const flag = requiredOverride ?? env.PHONE_VERIFICATION_REQUIRED?.trim().toLowerCase() === "true";
  if (!flag) return false;
  if (isPhoneVerificationEnabled()) return true;
  if (!warnedRequiredWithoutKeys) {
    warnedRequiredWithoutKeys = true;
    console.warn("[PHONE] PHONE_VERIFICATION_REQUIRED is on but the Twilio keys are missing: the requirement is ignored.");
  }
  return false;
}

/** Null when the Twilio keys are not set. */
export function getPhoneVerificationGateway(): PhoneVerificationGateway | null {
  if (override !== undefined) return override;
  const config = twilioConfig();
  if (!config) return null;
  if (!cached) {
    // A fake API for local trials; never in production, where the codes must reach real phones.
    const baseUrl = process.env.NODE_ENV === "production" ? undefined : env.TWILIO_API_BASE_URL?.trim() || undefined;
    cached = createTwilioVerifyGateway({ ...config, baseUrl });
  }
  return cached;
}
