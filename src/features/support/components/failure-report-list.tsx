import { Badge } from "@/components/ui/badge";
import { FAILURE_STATUS_LABELS, type FailureReportView, type FailureStatus } from "../failure-report";

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });
const day = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

const STATUS_VARIANT: Record<FailureStatus, "default" | "secondary" | "outline"> = {
  RECIBIDO: "outline",
  EN_REVISION: "secondary",
  CORREGIDO: "default",
  CERRADO: "secondary",
};

export function FailureStatusBadge({ status }: { status: FailureStatus }) {
  return <Badge variant={STATUS_VARIANT[status]} data-failure-status={status}>{FAILURE_STATUS_LABELS[status]}</Badge>;
}

/** The responses recorded for a report, oldest first. */
export function FailureResponses({ report }: { report: FailureReportView }) {
  if (!report.responses.length) return <p className="text-xs text-muted-foreground">Sin respuesta todavía.</p>;
  return (
    <ol className="grid gap-2">
      {report.responses.map((response, index) => (
        <li key={index} className="rounded-md border bg-muted/30 p-2 text-sm">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <FailureStatusBadge status={response.status} />
            {dateTime.format(new Date(response.at))}{response.by ? ` · ${response.by}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{response.response}</p>
        </li>
      ))}
    </ol>
  );
}

/** A user's own reports with their status and responses («Mis reportes»). */
export function FailureReportList({ reports }: { reports: FailureReportView[] }) {
  if (!reports.length) return <p className="text-sm text-muted-foreground">No has enviado reportes.</p>;
  return (
    <ul className="grid gap-3" data-failure-reports="">
      {reports.map((report) => (
        <li key={report.id} className="grid gap-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{report.valuation ?? "Sin avalúo en particular"}</p>
            <FailureStatusBadge status={report.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Falla del {day(report.happenedOn)} · enviado el {dateTime.format(new Date(report.reportedAt))}
          </p>
          <p className="whitespace-pre-wrap text-sm">{report.description}</p>
          <FailureResponses report={report} />
        </li>
      ))}
    </ul>
  );
}
