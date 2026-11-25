import { randomUUID } from "node:crypto";
import { isPlatformOperator } from "@/features/operator/operator-access";
import { prisma } from "@/infrastructure/database/prisma-client";
import { sendLoggedAccountNotice } from "./account-notice-log";
import {
  ACCOUNT_RESTRICTION_KINDS,
  INACTIVITY_DISABLE_AFTER_NOTICE_DAYS,
  addDays,
  inactivityDisableDue,
  inactivityDue,
  lastActivity,
} from "./account-standing-rules";

/**
 * Inactivity (Terms 14.1, point 1), run once a day by `pnpm accounts:inactivity`
 * (docs/OPERACION.md). After three months without generating a valuation the
 * person gets an email to download their reports; if nothing changes in the
 * following days the account is disabled: it still signs in to consult and
 * download, but it does not make or conclude valuations until the operator
 * reactivates it on the person's request. A valuation created after the
 * notice withdraws it. The balance is never touched.
 *
 * Off unless ACCOUNT_INACTIVITY_ENABLED=true; even then nothing is written
 * without `apply`. The result has counts only, never who.
 */

export const isAccountInactivityEnabled = (environment: Record<string, string | undefined> = process.env) =>
  environment.ACCOUNT_INACTIVITY_ENABLED?.trim().toLowerCase() === "true";

export type InactivityRunResult = {
  /** Accounts looked at (active, verified, not an operator). */
  reviewed: number;
  /** Inactivity emails that are (or would be) sent. */
  notices: number;
  /** Accounts that are (or would be) disabled. */
  disabled: number;
  /** Notices withdrawn because the person created a valuation after them. */
  withdrawn: number;
  /** Emails that failed; their notice is tried again the next day. */
  failedEmails: number;
  /** Whether anything was written and sent. */
  applied: boolean;
};

export async function runInactivity(options: { apply: boolean; now?: Date; userIds?: readonly number[] }): Promise<InactivityRunResult> {
  const now = options.now ?? new Date();
  const apply = options.apply && isAccountInactivityEnabled();
  const users = await prisma.usuario.findMany({
    where: {
      BActivo: true,
      DFechaEliminacion: null,
      BCorreoVerificado: true,
      estadoUsuario: { BPermiteAcceso: true },
      ...(options.userIds ? { IdUsuario: { in: [...options.userIds] } } : {}),
    },
    select: {
      IdUsuario: true,
      SNombre: true,
      SApellidoPaterno: true,
      SCorreo: true,
      DFechaCreacion: true,
      avaluosCreados: { orderBy: { DFechaCreacion: "desc" }, take: 1, select: { DFechaCreacion: true } },
      suspensionesCuenta: { select: { IdSuspensionCuenta: true, STipo: true, DFechaAviso: true, DFechaInicio: true, DFechaFin: true } },
    },
  });

  const result: InactivityRunResult = { reviewed: 0, notices: 0, disabled: 0, withdrawn: 0, failedEmails: 0, applied: apply };
  for (const user of users) {
    if (isPlatformOperator(user.SCorreo)) continue;
    result.reviewed += 1;
    const open = user.suspensionesCuenta.filter((row) => !row.DFechaFin);
    const pending = open.find((row) => row.STipo === ACCOUNT_RESTRICTION_KINDS.inactivity && !row.DFechaInicio);
    // Closed, suspended or already disabled: nothing to do here.
    if (open.some((row) => row !== pending)) continue;

    const reactivations = user.suspensionesCuenta
      .filter((row) => row.DFechaInicio && row.DFechaFin)
      .map((row) => row.DFechaFin as Date);
    const activity = lastActivity({
      accountCreatedAt: user.DFechaCreacion,
      lastValuationCreatedAt: user.avaluosCreados[0]?.DFechaCreacion ?? null,
      lastReactivatedAt: reactivations.length ? new Date(Math.max(...reactivations.map((date) => date.getTime()))) : null,
    });
    const person = { name: `${user.SNombre} ${user.SApellidoPaterno ?? ""}`.trim(), email: user.SCorreo };

    if (pending?.DFechaAviso) {
      if (activity.getTime() > pending.DFechaAviso.getTime()) {
        result.withdrawn += 1;
        if (apply) {
          await prisma.suspensionCuenta.update({
            where: { IdSuspensionCuenta: pending.IdSuspensionCuenta },
            data: { DFechaFin: now, SMotivoFin: "ACTIVIDAD" },
          });
        }
      } else if (inactivityDisableDue(pending.DFechaAviso, now)) {
        result.disabled += 1;
        if (apply) {
          const row = await prisma.suspensionCuenta.update({ where: { IdSuspensionCuenta: pending.IdSuspensionCuenta }, data: { DFechaInicio: now } });
          const { sent } = await sendLoggedAccountNotice({
            userId: user.IdUsuario,
            to: person.email,
            notice: { kind: "INHABILITACION", recipientName: person.name, email: person.email, noticedAt: pending.DFechaAviso, disabledAt: now },
            entity: { name: "SuspensionCuenta", id: row.UIdentificadorPublico },
            at: now,
          });
          if (!sent) result.failedEmails += 1;
        }
      }
      continue;
    }

    if (!inactivityDue(activity, now)) continue;
    result.notices += 1;
    if (!apply) continue;
    // The notice exists only once it was sent: a failed email is tried again tomorrow.
    const id = randomUUID();
    const { sent } = await sendLoggedAccountNotice({
      userId: user.IdUsuario,
      to: person.email,
      notice: { kind: "INACTIVIDAD", recipientName: person.name, email: person.email, disableFrom: addDays(now, INACTIVITY_DISABLE_AFTER_NOTICE_DAYS) },
      entity: { name: "SuspensionCuenta", id },
      at: now,
    });
    if (!sent) {
      result.failedEmails += 1;
      continue;
    }
    await prisma.suspensionCuenta.create({
      data: {
        UIdentificadorPublico: id,
        IdUsuario: user.IdUsuario,
        STipo: ACCOUNT_RESTRICTION_KINDS.inactivity,
        SOrigen: "PROCESO",
        DFechaSolicitud: now,
        DFechaAviso: now,
      },
    });
  }
  return result;
}
