import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import { rateLimits } from "@/security/rate-limit/rate-limiter";
import { maskPhone, normalizePhone } from "./phone-number";
import { PhoneVerificationError, type PhoneChannel } from "./phone-verification-gateway";
import { getPhoneVerificationGateway, isPhoneVerificationEnabled, isPhoneVerificationRequired } from "./phone-verification-provider";

/**
 * The verified phone of a user («Mi cuenta» → «Teléfono»), so one person
 * cannot open account after account to use the free valuations again. A
 * verified phone belongs to one account only (migration 062). Changing it
 * keeps the verified one until the new one is confirmed.
 */

export type PhoneVerificationView = {
  /** The provider is configured: the codes can be sent. */
  enabled: boolean;
  /** Creating a valuation needs the verified phone (PHONE_VERIFICATION_REQUIRED, with the provider). */
  required: boolean;
  /** E.164; the last one captured, verified or not. */
  phone: string | null;
  verified: boolean;
  verifiedAt: string | null;
};

/** What creating a valuation answers while the phone is not verified and the requirement is on. */
export const PHONE_REQUIRED_MESSAGE = "Para crear avalúos verifica tu teléfono en «Mi cuenta». Solo toma un minuto.";
export const PHONE_REQUIRED_CODE = "PHONE_VERIFICATION_REQUIRED";

type RequestMeta = { ip?: string | null; userAgent?: string | null };

async function phoneRow(userId: number) {
  return prisma.usuario.findUnique({
    where: { IdUsuario: userId },
    select: { STelefono: true, BTelefonoVerificado: true, DFechaVerificacionTelefono: true },
  });
}

export async function getPhoneVerification(userId: number): Promise<PhoneVerificationView> {
  const row = await phoneRow(userId);
  const verified = Boolean(row?.BTelefonoVerificado && row.STelefono);
  return {
    enabled: isPhoneVerificationEnabled(),
    required: isPhoneVerificationRequired(),
    // An old capture that is not a phone is not offered back.
    phone: row?.STelefono ? normalizePhone(row.STelefono) : null,
    verified,
    verifiedAt: verified ? (row?.DFechaVerificacionTelefono?.toISOString() ?? null) : null,
  };
}

/** Whether the person should be reminded: the provider is there and the phone is not verified yet. */
export async function needsPhoneReminder(userId: number) {
  if (!isPhoneVerificationEnabled()) return false;
  const row = await phoneRow(userId);
  return !row?.BTelefonoVerificado;
}

/** Null when the person may create valuations; the message otherwise. */
export async function phoneRequirementBlock(userId: number): Promise<{ message: string; code: string } | null> {
  if (!isPhoneVerificationRequired()) return null;
  const row = await phoneRow(userId);
  return row?.BTelefonoVerificado ? null : { message: PHONE_REQUIRED_MESSAGE, code: PHONE_REQUIRED_CODE };
}

function gatewayOrThrow() {
  const gateway = getPhoneVerificationGateway();
  if (!gateway) throw new PhoneVerificationError("not_enabled");
  return gateway;
}

function toE164(raw: string) {
  const phone = normalizePhone(raw);
  if (!phone) throw new PhoneVerificationError("invalid_number");
  return phone;
}

function consume(limiter: (typeof rateLimits)[keyof typeof rateLimits], key: string) {
  const result = limiter.consume(key);
  if (!result.allowed) throw new PhoneVerificationError("rate_limit", result.retryAfterSeconds);
}

async function verifiedElsewhere(phone: string, userId: number) {
  const other = await prisma.usuario.findFirst({
    where: { STelefono: phone, BTelefonoVerificado: true, IdUsuario: { not: userId } },
    select: { IdUsuario: true },
  });
  return Boolean(other);
}

/** Sends a code to the number by SMS or WhatsApp. Answers the number in E.164. */
export async function requestPhoneCode(input: { user: Pick<AuthUser, "id" | "organizationId">; phone: string; channel: PhoneChannel } & RequestMeta) {
  const gateway = gatewayOrThrow();
  const phone = toE164(input.phone);
  const { user } = input;

  const row = await phoneRow(user.id);
  if (row?.BTelefonoVerificado && row.STelefono === phone) throw new PhoneVerificationError("already_verified");
  // Refused before spending a message.
  if (await verifiedElsewhere(phone, user.id)) throw new PhoneVerificationError("taken");
  consume(rateLimits.phoneCodeByUser, `phone-code:user:${user.id}`);
  consume(rateLimits.phoneCodeByPhone, `phone-code:phone:${phone}`);

  await gateway.sendCode(phone, input.channel);
  // The number typed is kept for the next visit; a verified one stays until the new one is confirmed.
  if (!row?.BTelefonoVerificado) {
    await prisma.usuario.update({ where: { IdUsuario: user.id }, data: { STelefono: phone } });
  }
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "USUARIO",
    entityId: String(user.id),
    action: "TELEFONO_CODIGO_ENVIADO",
    result: "ENVIADO",
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    metadata: { telefono: maskPhone(phone), canal: input.channel },
  });
  return { phone };
}

/** Confirms the code sent to the number; on success the number becomes the account's verified phone. */
export async function confirmPhoneCode(input: { user: Pick<AuthUser, "id" | "organizationId">; phone: string; code: string } & RequestMeta): Promise<PhoneVerificationView> {
  const gateway = gatewayOrThrow();
  const phone = toE164(input.phone);
  const { user } = input;

  consume(rateLimits.phoneCheckByUser, `phone-check:user:${user.id}`);
  consume(rateLimits.phoneCheckByPhone, `phone-check:phone:${phone}`);
  if (await verifiedElsewhere(phone, user.id)) throw new PhoneVerificationError("taken");

  const approved = await gateway.checkCode(phone, input.code);
  if (!approved) throw new PhoneVerificationError("wrong_code");

  try {
    await prisma.usuario.update({
      where: { IdUsuario: user.id },
      data: { STelefono: phone, BTelefonoVerificado: true, DFechaVerificacionTelefono: new Date() },
    });
  } catch (error) {
    // Two accounts confirming the same number at once: the unique index keeps the first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new PhoneVerificationError("taken");
    throw error;
  }
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "USUARIO",
    entityId: String(user.id),
    action: "TELEFONO_VERIFICADO",
    result: "VERIFICADO",
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    metadata: { telefono: maskPhone(phone) },
  });
  return getPhoneVerification(user.id);
}
