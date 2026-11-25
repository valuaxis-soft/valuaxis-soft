import type { Prisma, SuspensionCuenta } from "@prisma/client";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { revokeUserSessions } from "@/features/auth/repositories/session.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import { sendLoggedAccountNotice } from "./account-notice-log";
import {
  ACCOUNT_DATA_BLOCKING_YEARS,
  ACCOUNT_RESTRICTION_KINDS,
  CLARIFICATION_BUSINESS_DAYS,
  accountStanding,
  addYears,
  businessDaysDeadline,
  causeMayBlockAccess,
  isSuspensionCause,
  type AccountRestriction,
  type AccountRestrictionEnd,
  type AccountRestrictionKind,
  type AccountStanding,
  type SuspensionCause,
} from "./account-standing-rules";

/**
 * Closures and suspensions of accounts (docs/CUENTAS.md). Nothing here
 * touches the credit ledger or deletes data: a closure blocks the access and
 * schedules the blocking of the data; a suspension stops making and
 * concluding valuations. Every step leaves its dates in the row and an entry
 * in the audit, and every email goes through the notice log.
 */

export class AccountStandingError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = "AccountStandingError";
  }
}

type Person = { id: number; name: string; email: string };
type Operator = { id: number; organizationId: number };
type RequestMeta = { ip?: string | null; userAgent?: string | null };

const toRestriction = (row: Pick<SuspensionCuenta, "STipo" | "DFechaInicio" | "DFechaFin" | "BBloqueaAcceso">): AccountRestriction => ({
  kind: row.STipo as AccountRestrictionKind,
  startedAt: row.DFechaInicio,
  endedAt: row.DFechaFin,
  blocksAccess: row.BBloqueaAcceso,
});

/** The rows still open (a notice not in effect yet, or a restriction in effect). */
export function openRestrictions(userId: number, db: Prisma.TransactionClient = prisma) {
  return db.suspensionCuenta.findMany({ where: { IdUsuario: userId, DFechaFin: null }, orderBy: { DFechaSolicitud: "desc" } });
}

export async function getAccountStanding(userId: number, now = new Date()): Promise<AccountStanding> {
  return accountStanding((await openRestrictions(userId)).map(toRestriction), now);
}

/** Whether the person may sign in at all (a closure or an identity check close the door). */
export async function accountAccessBlocked(userId: number, now = new Date()) {
  return !(await getAccountStanding(userId, now)).access;
}

/** What «Mi cuenta» and the private pages show about the account's standing. */
export type AccountStandingView = {
  standing: AccountStanding;
  /** A notice of suspension with its deadline to clarify, not in effect yet. */
  pendingNotice: { kind: AccountRestrictionKind; cause: SuspensionCause | null; deadline: string | null } | null;
};

export async function getAccountStandingView(userId: number, now = new Date()): Promise<AccountStandingView> {
  const rows = await openRestrictions(userId);
  const pending = rows.find((row) => !row.DFechaInicio);
  return {
    standing: accountStanding(rows.map(toRestriction), now),
    pendingNotice: pending
      ? {
          kind: pending.STipo as AccountRestrictionKind,
          cause: isSuspensionCause(pending.SCausa) ? pending.SCausa : null,
          deadline: pending.DFechaLimiteAclaracion?.toISOString() ?? null,
        }
      : null,
  };
}

async function audit(action: string, row: SuspensionCuenta, actor: { userId: number; organizationId?: number | null }, meta: RequestMeta = {}) {
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: actor.organizationId ?? null,
    userId: actor.userId,
    entity: "Cuenta",
    entityId: row.UIdentificadorPublico,
    action,
    result: "OK",
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { usuario: row.IdUsuario, tipo: row.STipo, causa: row.SCausa },
  });
}

async function findPerson(where: { id?: number; email?: string }) {
  const user = await prisma.usuario.findFirst({
    where: where.id ? { IdUsuario: where.id } : { SCorreo: { equals: where.email?.trim() ?? "", mode: "insensitive" } },
    select: { IdUsuario: true, SNombre: true, SApellidoPaterno: true, SCorreo: true, DFechaEliminacion: true },
  });
  if (!user || user.DFechaEliminacion) throw new AccountStandingError("No hay una cuenta con ese correo.", 404);
  return { id: user.IdUsuario, name: `${user.SNombre} ${user.SApellidoPaterno ?? ""}`.trim(), email: user.SCorreo };
}

/**
 * A closure (matrix 1.11): the request with its date and time, the access
 * blocked at once and the data's blocking scheduled (privacy notice 7.3: the
 * data are blocked during the prescription and then suppressed). The balance
 * and the valuations stay; the valuations follow their own retention. Asking
 * again while closed returns the same request.
 */
async function closeAccount(person: Person, origin: "USUARIO" | "CORREO", actor: { userId: number; organizationId?: number | null; operatorId?: number }, meta: RequestMeta, now: Date) {
  const open = await prisma.suspensionCuenta.findFirst({
    where: { IdUsuario: person.id, STipo: ACCOUNT_RESTRICTION_KINDS.closure, DFechaFin: null },
  });
  if (open) return { row: open, created: false };

  const row = await prisma.suspensionCuenta.create({
    data: {
      IdUsuario: person.id,
      STipo: ACCOUNT_RESTRICTION_KINDS.closure,
      SOrigen: origin,
      BBloqueaAcceso: true,
      DFechaSolicitud: now,
      DFechaAviso: now,
      DFechaInicio: now,
      DFechaSupresionProgramada: addYears(now, ACCOUNT_DATA_BLOCKING_YEARS),
      IdUsuarioOperador: actor.operatorId ?? null,
      SDireccionIP: meta.ip?.slice(0, 80) ?? null,
    },
  });
  await revokeUserSessions(person.id);
  await audit(origin === "USUARIO" ? "ACCOUNT_CLOSURE_REQUESTED" : "ACCOUNT_CLOSURE_RECORDED", row, actor, meta);
  await sendLoggedAccountNotice({
    userId: person.id,
    to: person.email,
    notice: { kind: "BAJA", recipientName: person.name, email: person.email, requestedAt: now },
    entity: { name: "SuspensionCuenta", id: row.UIdentificadorPublico },
  });
  return { row, created: true };
}

/** «Dar de baja mi cuenta» in «Mi cuenta». */
export async function requestAccountClosure(user: Person & { organizationId: number }, meta: RequestMeta = {}, now = new Date()) {
  const { row } = await closeAccount(user, "USUARIO", { userId: user.id, organizationId: user.organizationId }, meta, now);
  return { requestedAt: row.DFechaSolicitud.toISOString() };
}

/** A closure the person asked for by email (Terms 14.2), recorded by the operator. */
export async function recordClosureByEmail(operator: Operator, email: string, now = new Date()) {
  const person = await findPerson({ email });
  const { row, created } = await closeAccount(person, "CORREO", { userId: operator.id, organizationId: operator.organizationId, operatorId: operator.id }, {}, now);
  return { id: row.UIdentificadorPublico, created };
}

/**
 * A suspension the operator decides (Terms 14.1, points 2 to 5). Normally a
 * notice with the cause and five business days to clarify; the suspension
 * starts when the operator applies it after the deadline. Urgent cases
 * (security, unlawful use) start at once and the five days run from that
 * notice. Only an identity check may block the access.
 */
export async function noticeSuspension(
  operator: Operator,
  input: { email: string; cause: SuspensionCause; detail?: string | null; urgent: boolean; blockAccess: boolean },
  now = new Date(),
) {
  const person = await findPerson({ email: input.email });
  if (input.blockAccess && !causeMayBlockAccess(input.cause)) {
    throw new AccountStandingError("Solo la verificación de identidad por posible suplantación puede bloquear el acceso a la cuenta.");
  }
  const existing = await prisma.suspensionCuenta.findFirst({
    where: { IdUsuario: person.id, STipo: ACCOUNT_RESTRICTION_KINDS.other, DFechaFin: null },
  });
  if (existing) throw new AccountStandingError("Esa cuenta ya tiene un aviso o una suspensión abierta.", 409);

  const deadline = businessDaysDeadline(now, CLARIFICATION_BUSINESS_DAYS);
  const detail = input.detail?.trim() || null;
  const row = await prisma.suspensionCuenta.create({
    data: {
      IdUsuario: person.id,
      STipo: ACCOUNT_RESTRICTION_KINDS.other,
      SCausa: input.cause,
      SDetalle: detail,
      SOrigen: "OPERADOR",
      BUrgente: input.urgent,
      BBloqueaAcceso: input.blockAccess,
      DFechaSolicitud: now,
      DFechaAviso: now,
      DFechaLimiteAclaracion: deadline,
      DFechaInicio: input.urgent ? now : null,
      IdUsuarioOperador: operator.id,
    },
  });
  if (input.urgent && input.blockAccess) await revokeUserSessions(person.id);
  await audit(input.urgent ? "ACCOUNT_SUSPENDED" : "ACCOUNT_SUSPENSION_NOTICE", row, { userId: operator.id, organizationId: operator.organizationId });
  await sendLoggedAccountNotice({
    userId: person.id,
    to: person.email,
    notice: input.urgent
      ? { kind: "SUSPENSION", recipientName: person.name, email: person.email, cause: input.cause, detail, startedAt: now, urgent: true, noticedAt: now, deadline, blocksAccess: input.blockAccess }
      : { kind: "SUSPENSION_AVISO", recipientName: person.name, email: person.email, cause: input.cause, detail, deadline, blocksAccess: input.blockAccess },
    entity: { name: "SuspensionCuenta", id: row.UIdentificadorPublico },
  });
  return { id: row.UIdentificadorPublico, deadline: deadline.toISOString(), startedAt: row.DFechaInicio?.toISOString() ?? null };
}

async function openRow(publicId: string) {
  const row = await prisma.suspensionCuenta.findUnique({ where: { UIdentificadorPublico: publicId } });
  if (!row) throw new AccountStandingError("No se encontró ese registro.", 404);
  if (row.DFechaFin) throw new AccountStandingError("Ese registro ya está cerrado.", 409);
  return row;
}

/** The suspension noticed earlier takes effect, once the five business days to clarify are over. */
export async function applySuspension(operator: Operator, publicId: string, now = new Date()) {
  const row = await openRow(publicId);
  if (row.STipo !== ACCOUNT_RESTRICTION_KINDS.other || row.DFechaInicio) throw new AccountStandingError("Ese aviso ya está en vigor.", 409);
  if (row.DFechaLimiteAclaracion && row.DFechaLimiteAclaracion.getTime() > now.getTime()) {
    throw new AccountStandingError("Todavía corre el plazo de cinco días hábiles para aclarar.", 409);
  }
  const updated = await prisma.suspensionCuenta.update({ where: { IdSuspensionCuenta: row.IdSuspensionCuenta }, data: { DFechaInicio: now } });
  if (updated.BBloqueaAcceso) await revokeUserSessions(updated.IdUsuario);
  await audit("ACCOUNT_SUSPENDED", updated, { userId: operator.id, organizationId: operator.organizationId });
  const person = await findPerson({ id: updated.IdUsuario });
  await sendLoggedAccountNotice({
    userId: person.id,
    to: person.email,
    notice: {
      kind: "SUSPENSION",
      recipientName: person.name,
      email: person.email,
      cause: isSuspensionCause(updated.SCausa) ? updated.SCausa : "USO_ILICITO",
      detail: updated.SDetalle,
      startedAt: now,
      urgent: false,
      noticedAt: updated.DFechaAviso,
      deadline: updated.DFechaLimiteAclaracion,
      blocksAccess: updated.BBloqueaAcceso,
    },
    entity: { name: "SuspensionCuenta", id: updated.UIdentificadorPublico },
  });
  return { startedAt: now.toISOString() };
}

/** What the person answered to clarify (by email, typed by the operator). */
export async function recordSuspensionResponse(operator: Operator, publicId: string, response: string, now = new Date()) {
  const row = await openRow(publicId);
  const updated = await prisma.suspensionCuenta.update({
    where: { IdSuspensionCuenta: row.IdSuspensionCuenta },
    data: { SRespuesta: response.trim().slice(0, 2000), DFechaRespuesta: now },
  });
  await audit("ACCOUNT_SUSPENSION_RESPONSE", updated, { userId: operator.id, organizationId: operator.organizationId });
  return { respondedAt: now.toISOString() };
}

/**
 * «Reactivar» (a closure or an inactivity, on the person's request by email)
 * or «Levantar» (the cause was clarified). The row keeps its whole story and
 * gets its end; the balance was never touched, so it is intact.
 */
export async function endRestriction(operator: Operator, publicId: string, reason: Exclude<AccountRestrictionEnd, "ACTIVIDAD">, now = new Date()) {
  const row = await openRow(publicId);
  const updated = await prisma.suspensionCuenta.update({
    where: { IdSuspensionCuenta: row.IdSuspensionCuenta },
    data: { DFechaFin: now, SMotivoFin: reason, IdUsuarioOperadorFin: operator.id },
  });
  await audit(reason === "ACLARADA" ? "ACCOUNT_SUSPENSION_LIFTED" : "ACCOUNT_REACTIVATED", updated, { userId: operator.id, organizationId: operator.organizationId });
  // Only a restriction that was in effect changes anything for the person; a withdrawn notice is not news.
  if (row.DFechaInicio) {
    const person = await findPerson({ id: updated.IdUsuario });
    await sendLoggedAccountNotice({
      userId: person.id,
      to: person.email,
      notice: { kind: "REACTIVACION", recipientName: person.name, email: person.email, reactivatedAt: now },
      entity: { name: "SuspensionCuenta", id: updated.UIdentificadorPublico },
    });
  }
  return { endedAt: now.toISOString() };
}

export type AccountRestrictionEntry = {
  id: string;
  kind: AccountRestrictionKind;
  cause: SuspensionCause | null;
  detail: string | null;
  origin: string;
  urgent: boolean;
  blocksAccess: boolean;
  person: { name: string; email: string };
  requestedAt: string;
  noticedAt: string | null;
  deadline: string | null;
  response: string | null;
  respondedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  scheduledSuppression: string | null;
  /** The five business days to clarify are over (or there were none). */
  deadlinePassed: boolean;
};

/** The operator's list: the open ones first, then the latest closed ones. */
export async function listAccountRestrictions(options: { take?: number; now?: Date } = {}): Promise<AccountRestrictionEntry[]> {
  const now = options.now ?? new Date();
  const rows = await prisma.suspensionCuenta.findMany({
    orderBy: [{ DFechaSolicitud: "desc" }],
    take: options.take ?? 200,
    include: { usuario: { select: { SNombre: true, SApellidoPaterno: true, SCorreo: true } } },
  });
  return rows
    .map((row) => ({
      id: row.UIdentificadorPublico,
      kind: row.STipo as AccountRestrictionKind,
      cause: isSuspensionCause(row.SCausa) ? row.SCausa : null,
      detail: row.SDetalle,
      origin: row.SOrigen,
      urgent: row.BUrgente,
      blocksAccess: row.BBloqueaAcceso,
      person: { name: `${row.usuario.SNombre} ${row.usuario.SApellidoPaterno ?? ""}`.trim(), email: row.usuario.SCorreo },
      requestedAt: row.DFechaSolicitud.toISOString(),
      noticedAt: row.DFechaAviso?.toISOString() ?? null,
      deadline: row.DFechaLimiteAclaracion?.toISOString() ?? null,
      response: row.SRespuesta,
      respondedAt: row.DFechaRespuesta?.toISOString() ?? null,
      startedAt: row.DFechaInicio?.toISOString() ?? null,
      endedAt: row.DFechaFin?.toISOString() ?? null,
      endReason: row.SMotivoFin,
      scheduledSuppression: row.DFechaSupresionProgramada?.toISOString() ?? null,
      deadlinePassed: !row.DFechaLimiteAclaracion || row.DFechaLimiteAclaracion.getTime() <= now.getTime(),
    }))
    .sort((a, b) => Number(Boolean(a.endedAt)) - Number(Boolean(b.endedAt)));
}
