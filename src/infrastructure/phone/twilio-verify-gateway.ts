/**
 * Twilio Verify over its REST API (no SDK): a Verification sends a code, a
 * VerificationCheck confirms it. https://www.twilio.com/docs/verify/api
 * It never logs the code, the token or the whole number.
 */
import {
  PhoneVerificationError,
  type PhoneChannel,
  type PhoneVerificationErrorKind,
  type PhoneVerificationGateway,
} from "@/features/account/phone/phone-verification-gateway";
import { maskPhone } from "@/features/account/phone/phone-number";

export const TWILIO_VERIFY_BASE_URL = "https://verify.twilio.com/v2";

const TIMEOUT_MS = 15_000;

/** Twilio's error codes (https://www.twilio.com/docs/api/errors) as the user must read them. */
const ERROR_CODES: Record<number, PhoneVerificationErrorKind> = {
  20003: "configuration", // Authentication failed
  20404: "expired", // The verification no longer exists: expired, approved or exhausted (checks only, see below)
  20429: "rate_limit", // Too many requests
  21211: "invalid_number", // Invalid 'To' phone number
  21608: "blocked", // Trial account: the number is not verified in the console
  21614: "landline", // Not a mobile number
  60033: "invalid_number", // Invalid phone number
  60200: "invalid_number", // Invalid parameter (the To of a malformed number)
  60202: "too_many_checks", // Max check attempts reached
  60203: "too_many_sends", // Max send attempts reached
  60205: "landline", // SMS is not supported by landline phone number
  60212: "rate_limit", // Too many concurrent requests for phone number
  60223: "channel_unavailable", // Delivery channel disabled (WhatsApp without a sender)
  60410: "blocked", // Verification delivery attempt blocked (Fraud Guard)
  60605: "blocked", // Verification delivery attempt blocked (geo permissions)
};

type TwilioError = { code?: number; message?: string; status?: number };

function kindOf(status: number, body: TwilioError, operation: "send" | "check"): PhoneVerificationErrorKind {
  if (status === 404 || body.code === 20404) {
    // A missing service on send is a misconfiguration; on check it is a verification gone (Twilio deletes it on expiry).
    return operation === "check" ? "expired" : "configuration";
  }
  const byCode = body.code ? ERROR_CODES[body.code] : undefined;
  if (byCode) return byCode;
  if (status === 401 || status === 403) return "configuration";
  if (status === 429) return "rate_limit";
  if (status === 400) return "invalid_number";
  return "unavailable";
}

export function createTwilioVerifyGateway(options: {
  accountSid: string;
  authToken: string;
  serviceSid: string;
  /** Tests and local trials point this at a fake server. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): PhoneVerificationGateway {
  const base = (options.baseUrl ?? TWILIO_VERIFY_BASE_URL).replace(/\/+$/, "");
  const authorization = `Basic ${Buffer.from(`${options.accountSid}:${options.authToken}`).toString("base64")}`;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function post(path: string, form: Record<string, string>, operation: "send" | "check", to: string) {
    let response: Response;
    try {
      response = await fetchImpl(`${base}/Services/${encodeURIComponent(options.serviceSid)}/${path}`, {
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      console.warn(`[PHONE] Twilio ${operation} to ${maskPhone(to)} did not answer: ${error instanceof Error ? error.name : "error"}`);
      throw new PhoneVerificationError("unavailable");
    }
    const body = (await response.json().catch(() => ({}))) as TwilioError & { status?: unknown };
    if (!response.ok) {
      const kind = kindOf(response.status, body, operation);
      // Twilio's message names the parameter, never the code; the number is masked.
      console.warn(`[PHONE] Twilio ${operation} to ${maskPhone(to)} failed: HTTP ${response.status}, code ${body.code ?? "-"} (${kind})`);
      throw new PhoneVerificationError(kind);
    }
    return body as { status?: unknown };
  }

  return {
    async sendCode(to: string, channel: PhoneChannel) {
      const body = await post("Verifications", { To: to, Channel: channel, Locale: "es" }, "send", to);
      if (body.status !== "pending") {
        console.warn(`[PHONE] Twilio send to ${maskPhone(to)} answered status ${String(body.status)}`);
        throw new PhoneVerificationError("unavailable");
      }
    },
    async checkCode(to: string, code: string) {
      const body = await post("VerificationCheck", { To: to, Code: code }, "check", to);
      switch (body.status) {
        case "approved":
          return true;
        case "pending":
          return false;
        case "max_attempts_reached":
          throw new PhoneVerificationError("too_many_checks");
        default:
          // canceled, expired, deleted, failed
          throw new PhoneVerificationError("expired");
      }
    },
  };
}
