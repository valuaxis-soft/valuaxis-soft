import type { Metadata } from "next";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { FailureResponses, FailureStatusBadge } from "@/features/support/components/failure-report-list";
import { FailureResponseForm } from "@/features/support/components/failure-response-form";
import { FAILURE_STATUS_LABELS, FAILURE_STATUSES } from "@/features/support/failure-report";
import { listFailureReports, screenshotUrl } from "@/features/support/failure-report.service";
import { OPERATOR_FAILURE_REPORTS_HREF } from "@/features/support/support-contact";
import { requireOperatorPage } from "@/security/guards/operator-guard";

export const metadata: Metadata = {
  title: "Reportes de fallas",
  robots: { index: false, follow: false },
};

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });
const day = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

/**
 * The failure reports of every account, for the operator (OPERATOR_EMAILS):
 * who, which valuation, the date, the description and screenshot, the status
 * and the responses, with the form to record one (matrix 1.9 and 3.4).
 * Anyone else gets 404.
 */
export default async function OperatorFailureReportsPage() {
  const user = await requireOperatorPage(OPERATOR_FAILURE_REPORTS_HREF);
  const reports = await listFailureReports();
  const screenshots = new Map(await Promise.all(
    reports.filter((report) => report.screenshotKey).map(async (report) => [report.id, await screenshotUrl(report.screenshotKey as string)] as const),
  ));
  const counts = FAILURE_STATUSES.map((status) => ({ status, count: reports.filter((report) => report.status === status).length }));

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} />
      <PageContainer width="wide">
        <PageHeader
          eyebrow="Operación de la plataforma"
          title="Reportes de fallas"
          description="Lo que reportan los usuarios desde «Ayuda y soporte»: cuenta, avalúo, fecha, descripción y captura. Cada reporte debe tener su respuesta registrada; la respuesta la ve el usuario."
        />
        <p className="mb-4 flex flex-wrap gap-2 text-sm" data-failure-counts="">
          {counts.map(({ status, count }) => (
            <span key={status} className="rounded-md border px-2 py-1">{FAILURE_STATUS_LABELS[status]}: <span className="tabular-nums font-medium">{count}</span></span>
          ))}
        </p>
        {reports.length ? (
          <ul className="grid gap-4" data-operator-failure-reports="">
            {reports.map((report) => (
              <li key={report.id} className="grid gap-3 rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid gap-0.5">
                    <p className="font-medium">{report.reporter} <span className="font-normal text-muted-foreground">· {report.reporterEmail} · {report.organizationName}</span></p>
                    <p className="text-xs text-muted-foreground">
                      {report.valuation ?? "Sin avalúo en particular"} · falla del {day(report.happenedOn)} · enviado el {dateTime.format(new Date(report.reportedAt))}
                    </p>
                  </div>
                  <FailureStatusBadge status={report.status} />
                </div>
                <p className="whitespace-pre-wrap text-sm">{report.description}</p>
                {screenshots.get(report.id) ? (
                  <a className="text-sm text-primary underline-offset-2 hover:underline" href={screenshots.get(report.id) as string} target="_blank" rel="noopener noreferrer">Ver la captura</a>
                ) : report.screenshotKey ? <p className="text-xs text-muted-foreground">La captura no se pudo abrir.</p> : null}
                <FailureResponses report={report} />
                <FailureResponseForm reportId={report.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No hay reportes de fallas.</p>
        )}
      </PageContainer>
    </div>
  );
}
