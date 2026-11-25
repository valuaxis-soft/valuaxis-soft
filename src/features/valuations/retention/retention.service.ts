import { sendLoggedAccountNotice } from "@/features/account/standing/account-notice-log";
import { retentionExpiry, retentionSuppressionDue, retentionWarningDue } from "@/features/account/standing/account-standing-rules";
import { prisma } from "@/infrastructure/database/prisma-client";
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import { buildPublicAppUrl } from "@/lib/public-url";
import { SuppressionBlockedError, suppressValuationContent } from "./valuation-suppression";

/**
 * The retention of concluded valuations (matrix 1.12; Terms 14.3), run once a
 * day by `pnpm valuations:retention` (docs/OPERACION.md). A concluded
 * valuation is kept during its validity, at most twelve months from its
 * conclusion; thirty calendar days before, its appraiser gets an email to
 * download or back up the report; once expired (and thirty days after that
 * email), its content is suppressed (valuation-suppression.ts).
 *
 * Off unless VALUATION_RETENTION_ENABLED=true; even then nothing is sent or
 * deleted without `apply`. The result has counts only, never folios or names.
 */

export const isValuationRetentionEnabled = (environment: Record<string, string | undefined> = process.env) =>
  environment.VALUATION_RETENTION_ENABLED?.trim().toLowerCase() === "true";

export const RETENTION_WARNING_KIND = "GUARDA_POR_VENCER";

export type RetentionRunResult = {
  /** Concluded valuations still kept. */
  reviewed: number;
  /** Warning emails that are (or would be) sent. */
  warnings: number;
  /** Valuations whose content is (or would be) suppressed. */
  suppressed: number;
  /** Suppressions that could not be done (left as they were). */
  blocked: number;
  failedEmails: number;
  /** Storage objects deleted, and those that could not be. */
  filesDeleted: number;
  fileErrors: number;
  applied: boolean;
};

type ObjectDeleter = { deleteObject(key: string): Promise<void> };

export async function runRetention(options: {
  apply: boolean;
  now?: Date;
  valuationIds?: readonly number[];
  storage?: ObjectDeleter;
}): Promise<RetentionRunResult> {
  const now = options.now ?? new Date();
  const apply = options.apply && isValuationRetentionEnabled();
  const storage = options.storage ?? storageProvider;
  const valuations = await prisma.avaluo.findMany({
    where: {
      BBloqueado: true,
      DFechaConclusion: { not: null },
      DFechaSupresion: null,
      ...(options.valuationIds ? { IdAvaluo: { in: [...options.valuationIds] } } : {}),
    },
    select: {
      IdAvaluo: true,
      UIdentificadorPublico: true,
      SFolio: true,
      BActivo: true,
      DFechaEliminacion: true,
      DFechaConclusion: true,
      versionFinal: { select: { caratula: { select: { DFechaVigencia: true } } } },
      usuarioCreador: { select: { IdUsuario: true, SNombre: true, SApellidoPaterno: true, SCorreo: true } },
      usuarioResponsable: { select: { IdUsuario: true, SNombre: true, SApellidoPaterno: true, SCorreo: true } },
    },
  });
  const warnings = await prisma.avisoCorreo.findMany({
    where: { STipo: RETENTION_WARNING_KIND, BEnviado: true, SIdentificadorEntidad: { in: valuations.map((row) => row.UIdentificadorPublico) } },
    select: { SIdentificadorEntidad: true, DFechaEnvio: true },
    orderBy: { DFechaEnvio: "asc" },
  });
  const warnedAt = new Map<string, Date>();
  for (const warning of warnings) if (warning.SIdentificadorEntidad && !warnedAt.has(warning.SIdentificadorEntidad)) warnedAt.set(warning.SIdentificadorEntidad, warning.DFechaEnvio);

  const result: RetentionRunResult = { reviewed: 0, warnings: 0, suppressed: 0, blocked: 0, failedEmails: 0, filesDeleted: 0, fileErrors: 0, applied: apply };
  for (const valuation of valuations) {
    result.reviewed += 1;
    const concludedAt = valuation.DFechaConclusion as Date;
    const expiry = retentionExpiry({ concludedAt, validUntil: valuation.versionFinal?.caratula?.DFechaVigencia ?? null });
    const warned = warnedAt.get(valuation.UIdentificadorPublico) ?? null;
    // In the trash nobody can download it: no email, and it goes at its expiry.
    const visible = valuation.BActivo && !valuation.DFechaEliminacion;

    const due = visible ? retentionSuppressionDue(expiry, warned, now) : expiry.getTime() <= now.getTime();
    if (due) {
      result.suppressed += 1;
      if (!apply) continue;
      try {
        const outcome = await suppressValuationContent(valuation.IdAvaluo, now);
        for (const key of outcome.storageKeys) {
          try {
            await storage.deleteObject(key);
            result.filesDeleted += 1;
          } catch {
            result.fileErrors += 1;
          }
        }
      } catch (error) {
        result.suppressed -= 1;
        result.blocked += 1;
        console.error(
          "[RETENTION] A valuation could not be suppressed",
          error instanceof SuppressionBlockedError ? error.reason : error instanceof Error ? error.name : "unknown",
        );
      }
      continue;
    }

    if (!visible || warned || !retentionWarningDue(expiry, now)) continue;
    result.warnings += 1;
    if (!apply) continue;
    const person = valuation.usuarioResponsable ?? valuation.usuarioCreador;
    const { sent } = await sendLoggedAccountNotice({
      userId: person.IdUsuario,
      to: person.SCorreo,
      notice: {
        kind: "GUARDA_POR_VENCER",
        recipientName: `${person.SNombre} ${person.SApellidoPaterno ?? ""}`.trim(),
        email: person.SCorreo,
        folio: valuation.SFolio,
        concludedAt,
        expiresAt: expiry,
        valuationUrl: valuationLink(valuation.UIdentificadorPublico),
      },
      entity: { name: "Avaluo", id: valuation.UIdentificadorPublico },
      at: now,
    });
    if (!sent) result.failedEmails += 1;
  }
  return result;
}

function valuationLink(publicId: string) {
  try {
    return buildPublicAppUrl(`/workspace?id=${publicId}`).toString();
  } catch {
    return `/workspace?id=${publicId}`;
  }
}
