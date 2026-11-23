/**
 * What the phone verification needs from the provider that sends the codes.
 * The Twilio Verify implementation lives in
 * src/infrastructure/phone/twilio-verify-gateway.ts; tests use a fake.
 */

export type PhoneChannel = "sms" | "whatsapp";

export const PHONE_CHANNEL_LABELS: Record<PhoneChannel, string> = { sms: "SMS", whatsapp: "WhatsApp" };

export type PhoneVerificationErrorKind =
  | "invalid_number"
  | "landline"
  | "wrong_code"
  | "expired"
  | "too_many_sends"
  | "too_many_checks"
  | "rate_limit"
  | "channel_unavailable"
  | "blocked"
  | "configuration"
  | "unavailable"
  | "not_enabled"
  | "taken"
  | "already_verified";

/** What the user reads for each failure, and the HTTP status the route answers with. */
const PHONE_ERRORS: Record<PhoneVerificationErrorKind, { message: string; status: number }> = {
  invalid_number: { message: "Ese número no es válido. Escribe los 10 dígitos de tu celular, por ejemplo 33 1234 5678.", status: 400 },
  landline: { message: "Ese número no puede recibir mensajes. Usa un celular.", status: 400 },
  wrong_code: { message: "El código no es correcto. Revísalo y vuelve a escribirlo.", status: 400 },
  expired: { message: "El código ya venció o se usó. Pide uno nuevo.", status: 400 },
  too_many_sends: { message: "Ya pediste varios códigos para este número. Espera 10 minutos antes de pedir otro.", status: 429 },
  too_many_checks: { message: "Escribiste el código mal demasiadas veces. Pide uno nuevo.", status: 429 },
  rate_limit: { message: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.", status: 429 },
  channel_unavailable: { message: "Ese medio de envío no está disponible por ahora. Elige SMS.", status: 400 },
  blocked: { message: "No pudimos enviar el código a ese número. Prueba con otro celular o escríbenos a soporte.", status: 400 },
  configuration: { message: "La verificación de teléfono no está bien configurada. Avísale al soporte de Valuaxis.", status: 503 },
  unavailable: { message: "No pudimos contactar al servicio de mensajes. Intenta de nuevo en unos minutos.", status: 503 },
  not_enabled: { message: "La verificación de teléfono todavía no está habilitada.", status: 503 },
  taken: { message: "Ese teléfono ya está verificado en otra cuenta.", status: 409 },
  already_verified: { message: "Ese teléfono ya está verificado en tu cuenta.", status: 409 },
};

export class PhoneVerificationError extends Error {
  readonly status: number;
  constructor(
    readonly kind: PhoneVerificationErrorKind,
    /** Seconds to wait, when the limit is ours and known. */
    readonly retryAfterSeconds?: number,
  ) {
    super(PHONE_ERRORS[kind].message);
    this.name = "PhoneVerificationError";
    this.status = PHONE_ERRORS[kind].status;
  }
}

export interface PhoneVerificationGateway {
  /** Sends a new code to the number (E.164) by the channel. */
  sendCode(to: string, channel: PhoneChannel): Promise<void>;
  /** True when the code is the one sent; false when it is wrong. Expired or exhausted codes throw. */
  checkCode(to: string, code: string): Promise<boolean>;
}
