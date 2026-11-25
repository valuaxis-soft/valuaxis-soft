/**
 * Records the failure reports and their responses in the audit log and tells
 * the operator (OPERATOR_EMAILS) by email. A user reads only his own reports;
 * the operator reads them all from /operador/fallas.
 */
import { randomUUID } from "node:crypto";

import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { saveUpload } from "@/features/files/services/upload";
import { todayInMexico } from "@/features/firm/firm-rules";
import { parseOperatorEmails } from "@/features/operator/operator-access";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getEmailService } from "@/infrastructure/email/email.service";
import { buildOrganizationAssetKey } from "@/infrastructure/storage/storage-keys";
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import { buildPublicAppUrl } from "@/lib/public-url";
import {
  describeFailureReport,
  FAILURE_REPORT_ACTION,
  FAILURE_REPORT_ENTITY,
  FAILURE_RESPONSE_ACTION,
  failureDateProblem,
  type FailureReportInput,
  type FailureReportView,
  type FailureResponseInput,
} from "./failure-report";
import { OPERATOR_FAILURE_REPORTS_HREF } from "./support-contact";

export class FailureReportError extends Error {
  constructor(message: string, readonly status: 400 | 404) {
    super(message);
    this.name = "FailureReportError";
  }
}

type Origin = { ip: string | null; userAgent: string | null };

const metadataOf = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** Records the report, keeps its screenshot (an image of the organization) and emails the operator. */
export async function createFailureReport(user: AuthUser, input: FailureReportInput, screenshot: File | null, origin: Origin) {
  const problem = failureDateProblem(input.happenedOn, todayInMexico());
  if (problem) throw new FailureReportError(problem, 400);

  const organization = await prisma.organizacion.findUniqueOrThrow({
    where: { IdOrganizacion: user.organizationId },
    select: { UIdentificadorPublico: true, SNombre: true },
  });
  // Only a valuation of the user's own organization.
  const valuation = input.valuationId
    ? await prisma.avaluo.findFirst({
        where: { UIdentificadorPublico: input.valuationId, IdOrganizacion: user.organizationId },
        select: { UIdentificadorPublico: true, SFolio: true, STitulo: true },
      })
    : null;
  if (input.valuationId && !valuation) throw new FailureReportError("No se encontró el avalúo.", 404);

  const reportId = randomUUID();
  const screenshotKey = screenshot
    ? (await saveUpload(screenshot, {
        generateDownloadUrl: false,
        key: buildOrganizationAssetKey(organization.UIdentificadorPublico, "compartidos", ["soporte"], randomUUID(), "jpg"),
      })).key
    : null;
  const valuationText = valuation ? [valuation.SFolio, valuation.STitulo].filter(Boolean).join(" · ") : "";

  const recorded = await recordAuditEvent({
    typeKey: "CREACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: FAILURE_REPORT_ENTITY,
    entityId: reportId,
    action: FAILURE_REPORT_ACTION,
    result: "EXITOSO",
    ip: origin.ip,
    userAgent: origin.userAgent,
    metadata: {
      avaluoId: valuation?.UIdentificadorPublico ?? null,
      avaluo: valuationText || null,
      fecha: input.happenedOn,
      descripcion: input.description,
      captura: screenshotKey,
    },
  });
  if (!recorded) throw new Error("The failure report could not be recorded.");

  const operators = [...parseOperatorEmails(process.env.OPERATOR_EMAILS)];
  await Promise.all(operators.map((to) => getEmailService().sendSupportReport({
    to,
    reporterName: user.name,
    reporterEmail: user.email,
    organizationName: organization.SNombre,
    valuation: valuationText,
    happenedOn: input.happenedOn,
    description: input.description,
    hasScreenshot: Boolean(screenshotKey),
    reportsUrl: buildPublicAppUrl(OPERATOR_FAILURE_REPORTS_HREF).toString(),
  }).catch((error) => {
    // The report is recorded: the operator sees it in his page even if the email fails.
    console.error("[SUPPORT_REPORT_EMAIL]", error);
  })));
  return { id: reportId };
}

/** The reports: all of them for the operator, or those of one user. Most recent first. */
export async function listFailureReports(scope: { userId?: number; take?: number } = {}): Promise<FailureReportView[]> {
  const reports = await prisma.auditoria.findMany({
    where: { SEntidad: FAILURE_REPORT_ENTITY, SAccion: FAILURE_REPORT_ACTION, ...(scope.userId ? { IdUsuario: scope.userId } : {}) },
    orderBy: { DFechaEvento: "desc" },
    take: scope.take ?? 200,
    select: {
      SIdentificadorEntidad: true,
      DFechaEvento: true,
      JMetadatos: true,
      organizacion: { select: { SNombre: true } },
      usuario: { select: { SNombre: true, SCorreo: true } },
    },
  });
  if (!reports.length) return [];
  const responses = await prisma.auditoria.findMany({
    where: { SEntidad: FAILURE_REPORT_ENTITY, SAccion: FAILURE_RESPONSE_ACTION, SIdentificadorEntidad: { in: reports.map((row) => row.SIdentificadorEntidad) } },
    select: { SIdentificadorEntidad: true, DFechaEvento: true, JMetadatos: true, usuario: { select: { SNombre: true } } },
  });
  const responseRows = responses.map((row) => ({ reportId: row.SIdentificadorEntidad, at: row.DFechaEvento, by: row.usuario?.SNombre ?? "", metadata: metadataOf(row.JMetadatos) }));
  return reports.map((row) => describeFailureReport({
    id: row.SIdentificadorEntidad,
    at: row.DFechaEvento,
    organizationName: row.organizacion?.SNombre ?? "",
    reporter: row.usuario?.SNombre ?? "",
    reporterEmail: row.usuario?.SCorreo ?? "",
    metadata: metadataOf(row.JMetadatos),
  }, responseRows));
}

/** The operator's response: a new row; the report and the responses before it stay as they were. */
export async function respondToFailureReport(operator: AuthUser, reportId: string, input: FailureResponseInput, origin: Origin) {
  const report = await prisma.auditoria.findFirst({
    where: { SEntidad: FAILURE_REPORT_ENTITY, SAccion: FAILURE_REPORT_ACTION, SIdentificadorEntidad: reportId },
    select: { IdOrganizacion: true },
  });
  if (!report) throw new FailureReportError("No se encontró el reporte.", 404);
  const recorded = await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: report.IdOrganizacion,
    userId: operator.id,
    entity: FAILURE_REPORT_ENTITY,
    entityId: reportId,
    action: FAILURE_RESPONSE_ACTION,
    result: "EXITOSO",
    ip: origin.ip,
    userAgent: origin.userAgent,
    metadata: { estado: input.status, respuesta: input.response },
  });
  if (!recorded) throw new Error("The failure response could not be recorded.");
}

/** A short-lived link to a report's screenshot, for the operator's page. */
export function screenshotUrl(key: string) {
  return storageProvider.getPrivateDownloadUrl(key).catch(() => null);
}
