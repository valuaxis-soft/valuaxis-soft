/**
 * «Reportar una falla» (matrix 1.9 and 3.4; Políticas comerciales 6.2): the
 * user reports a failure with the valuation, the date and a description or a
 * screenshot; the operator reviews it and records a response. Each report and
 * each response is a row of the audit log (immutable), so there is no table
 * of its own: the status of a report is its last response.
 *
 * Failures give no right to refunds, credits or compensation (Políticas
 * comerciales 6.3): the platform offers none and says nothing about them.
 */
import { z } from "zod";

export const FAILURE_REPORT_ENTITY = "ReporteFalla";
export const FAILURE_REPORT_ACTION = "SUPPORT_FAILURE_REPORT";
export const FAILURE_RESPONSE_ACTION = "SUPPORT_FAILURE_RESPONSE";

export const FAILURE_DESCRIPTION_MAX = 4000;
export const FAILURE_RESPONSE_MAX = 4000;
export const FAILURE_SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;

export const FAILURE_STATUSES = ["RECIBIDO", "EN_REVISION", "CORREGIDO", "CERRADO"] as const;
export type FailureStatus = (typeof FAILURE_STATUSES)[number];
/** The statuses the operator records with a response; «Recibido» is a report with none yet. */
export const RESPONSE_STATUSES = ["EN_REVISION", "CORREGIDO", "CERRADO"] as const satisfies readonly FailureStatus[];

export const FAILURE_STATUS_LABELS: Record<FailureStatus, string> = {
  RECIBIDO: "Recibido",
  EN_REVISION: "En revisión",
  CORREGIDO: "Corregido",
  CERRADO: "Cerrado",
};

const isoDay = /^\d{4}-\d{2}-\d{2}$/;

/** What the user sends (the screenshot travels apart, as a file). */
export const failureReportSchema = z.object({
  valuationId: z.uuid("El avalúo no es válido.").nullable(),
  happenedOn: z.string().regex(isoDay, "Escribe la fecha de la falla."),
  description: z.string().trim().min(10, "Describe la falla en al menos 10 caracteres.").max(FAILURE_DESCRIPTION_MAX, `Máximo ${FAILURE_DESCRIPTION_MAX} caracteres.`),
});
export type FailureReportInput = z.infer<typeof failureReportSchema>;

/** What the operator records. */
export const failureResponseSchema = z.object({
  status: z.enum(RESPONSE_STATUSES, "Elige el estado del reporte."),
  response: z.string().trim().min(1, "Escribe la respuesta.").max(FAILURE_RESPONSE_MAX, `Máximo ${FAILURE_RESPONSE_MAX} caracteres.`),
});
export type FailureResponseInput = z.infer<typeof failureResponseSchema>;

/** A failure date cannot be after today (in Mexico City) nor before the platform existed. */
export function failureDateProblem(happenedOn: string, today: string): string | null {
  if (happenedOn > today) return "La fecha de la falla no puede ser posterior a hoy.";
  if (happenedOn < "2026-01-01") return "Revisa la fecha de la falla.";
  return null;
}

/** The rows of the audit log a report is read from. */
export type ReportRow = {
  id: string;
  at: Date;
  organizationName: string;
  reporter: string;
  reporterEmail: string;
  metadata: Record<string, unknown> | null;
};
export type ResponseRow = { reportId: string; at: Date; by: string; metadata: Record<string, unknown> | null };

export type FailureReportView = {
  id: string;
  reportedAt: string;
  organizationName: string;
  reporter: string;
  reporterEmail: string;
  valuation: string | null;
  valuationId: string | null;
  happenedOn: string;
  description: string;
  screenshotKey: string | null;
  status: FailureStatus;
  responses: Array<{ at: string; by: string; status: FailureStatus; response: string }>;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");
const statusOf = (value: unknown): FailureStatus => ((FAILURE_STATUSES as readonly string[]).includes(text(value)) ? (value as FailureStatus) : "EN_REVISION");

/** A report with its responses (oldest first) and the status of the last one; «Recibido» without any. */
export function describeFailureReport(report: ReportRow, responses: readonly ResponseRow[]): FailureReportView {
  const own = responses
    .filter((row) => row.reportId === report.id)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((row) => ({ at: row.at.toISOString(), by: row.by, status: statusOf(row.metadata?.estado), response: text(row.metadata?.respuesta) }));
  return {
    id: report.id,
    reportedAt: report.at.toISOString(),
    organizationName: report.organizationName,
    reporter: report.reporter,
    reporterEmail: report.reporterEmail,
    valuation: text(report.metadata?.avaluo) || null,
    valuationId: text(report.metadata?.avaluoId) || null,
    happenedOn: text(report.metadata?.fecha),
    description: text(report.metadata?.descripcion),
    screenshotKey: text(report.metadata?.captura) || null,
    status: own.at(-1)?.status ?? "RECIBIDO",
    responses: own,
  };
}
