/**
 * «Historial» of a valuation: who did what and when, from what the system
 * already records (the status history, the audit of each action and the
 * exports with their stored PDF), and its versions V1, V2…. Pure: the
 * service reads the rows, these functions word them. Nothing is invented: an
 * action the system did not record does not show.
 */

export type HistoryKind =
  | "creation" | "copy" | "save" | "data" | "status" | "submit" | "approve" | "return" | "conclude" | "reopen"
  | "export" | "archive" | "trash" | "restore";

export type HistoryEvent = {
  id: string;
  /** ISO date and time. */
  at: string;
  kind: HistoryKind;
  /** Who did it; empty when the system did. */
  actor: string;
  title: string;
  detail: string | null;
  /** The version it happened in, when known. */
  version: number | null;
};

export type HistoryPdf = {
  /** The stored file's public id: GET /api/avaluos/<id>/historial/pdf/<fileId>. */
  fileId: string;
  at: string;
  by: string;
  /** Generated from the concluded version (PDF_FINAL) or from the working one. */
  final: boolean;
  label: string;
};

export type HistoryVersion = {
  number: number;
  /** The version the editor shows now. */
  current: boolean;
  createdAt: string;
  createdBy: string;
  concludedAt: string | null;
  concludedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  pdfs: HistoryPdf[];
};

export type ValuationHistory = {
  folio: string;
  status: string;
  reviewApprovedAt: string | null;
  events: HistoryEvent[];
  versions: HistoryVersion[];
};

export type StateRow = {
  id: string;
  at: Date;
  actor: string;
  from: string | null;
  to: string;
  toName: string;
  fromName: string | null;
  reason: string | null;
  version: number | null;
};

export type AuditRow = {
  id: string;
  at: Date;
  actor: string;
  action: string;
  metadata: Record<string, unknown> | null;
};

/** Reasons the system wrote by itself: the event already says them. */
const AUTOMATIC_REASONS = new Set(["primera edicion", "conclusion de avaluo"]);
const cleanReason = (reason: string | null) => {
  const text = reason?.trim() ?? "";
  return text && !AUTOMATIC_REASONS.has(text.toLowerCase()) && !text.toLowerCase().startsWith("correccion automatica") ? text : null;
};

const STATUS_NAMES: Record<string, string> = {
  NUEVO: "Nuevo", EN_EDICION: "En edición", EN_REVISION: "En revisión", TERMINADO: "Terminado", REABIERTO: "Reabierto", CANCELADO: "Cancelado",
};
const statusName = (key: string | null, fallback: string | null) => (key ? STATUS_NAMES[key.toUpperCase()] : undefined) ?? fallback ?? key ?? "";

/** A row of the status history as an event: what the change means for the work. */
export function describeStateChange(row: StateRow): HistoryEvent {
  const from = row.from?.toUpperCase() ?? null;
  const to = row.to.toUpperCase();
  const reason = cleanReason(row.reason);
  const base = { id: `estado-${row.id}`, at: row.at.toISOString(), actor: row.actor, version: row.version };
  if (to === "TERMINADO") return { ...base, kind: "conclude", title: `Concluyó el avalúo${row.version ? ` (V${row.version})` : ""}`, detail: reason };
  if (to === "REABIERTO") return { ...base, kind: "reopen", title: `Lo reabrió: empieza la versión V${row.version ?? "?"}`, detail: reason ? `Motivo: ${reason}` : null };
  if (to === "EN_REVISION" && from === "EN_REVISION") return { ...base, kind: "approve", title: "Aprobó la revisión: listo para concluir", detail: reason ? `Nota: ${reason}` : null };
  if (to === "EN_REVISION") return { ...base, kind: "submit", title: "Lo envió a revisión", detail: reason ? `Nota: ${reason}` : null };
  if (from === "EN_REVISION" && to === "EN_EDICION") return { ...base, kind: "return", title: "Lo regresó a edición", detail: reason ? `Motivo: ${reason}` : null };
  if (to === "EN_EDICION" && from === "NUEVO") {
    const corrected = row.reason?.toLowerCase().startsWith("correccion automatica");
    return { ...base, kind: "status", title: corrected ? "Pasó a «En edición» (corrección: ya tenía captura)" : "Empezó la captura: pasó a «En edición»", detail: null };
  }
  return { ...base, kind: "status", title: `Cambió de «${statusName(from, row.fromName)}» a «${statusName(to, row.toName)}»`, detail: reason };
}

const text = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "");

/** What an export did, by the format its audit recorded. */
function describeExport(metadata: Record<string, unknown> | null): { title: string; detail: string | null } {
  const format = text(metadata?.format);
  const final = metadata?.final === true ? " (versión final)" : "";
  switch (format) {
    case "dictamen":
      return metadata?.version ? { title: `Abrió la versión V${text(metadata.version)} en solo lectura`, detail: null } : { title: "Abrió el dictamen", detail: null };
    case "memoria-calculo":
      return { title: "Abrió la memoria de cálculo", detail: null };
    case "memoria-calculo-pdf":
      return { title: `Descargó la memoria de cálculo en PDF${final}`, detail: null };
    case "entregables-zip":
      return { title: `Descargó los entregables (.zip)${final}`, detail: null };
    case "pdf":
      return metadata?.channel === "email"
        ? { title: "Envió el dictamen por correo", detail: text(metadata.recipients) ? `A: ${text(metadata.recipients)}` : null }
        : { title: `Descargó el dictamen en PDF${final}`, detail: null };
    default:
      return { title: "Exportó el avalúo", detail: null };
  }
}

/** The data changes a save recorded: «Cliente: «A» → «B»». */
function describeDataChanges(metadata: Record<string, unknown> | null) {
  const lines: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    const field = text(metadata?.[`campo${index}`]);
    if (!field) break;
    lines.push(`${field}: «${text(metadata?.[`antes${index}`]) || "vacío"}» → «${text(metadata?.[`despues${index}`]) || "vacío"}»`);
  }
  return lines.join(" · ") || null;
}

/** An audit row as an event; null for the actions the status history already tells (or that are not the valuation's). */
export function describeAudit(row: AuditRow): HistoryEvent | null {
  const base = { id: `auditoria-${row.id}`, at: row.at.toISOString(), actor: row.actor, version: null };
  switch (row.action) {
    case "VALUATION_CREATE":
      return { ...base, kind: "creation", title: "Creó el avalúo", detail: null };
    case "VALUATION_SAVE":
      return { ...base, kind: "save", title: "Guardó cambios", detail: null };
    case "VALUATION_UPDATE_DATA":
      return { ...base, kind: "data", title: "Cambió los datos del avalúo", detail: describeDataChanges(row.metadata) };
    case "VALUATION_EXPORT":
      return { ...base, kind: "export", ...describeExport(row.metadata) };
    case "VALUATION_ARCHIVE":
      return row.metadata?.archived === false
        ? { ...base, kind: "archive", title: "Lo devolvió a la lista principal (desarchivó)", detail: null }
        : { ...base, kind: "archive", title: "Lo archivó", detail: null };
    case "VALUATION_DELETE":
      return { ...base, kind: "trash", title: "Lo mandó a la papelera", detail: null };
    case "VALUATION_RESTORE":
      return { ...base, kind: "restore", title: "Lo restauró de la papelera", detail: null };
    default:
      // Conclusion, reopening and review are told by the status history, with their reason.
      return null;
  }
}

/** Every event, most recent first; ties keep the order they were recorded in. */
export function buildHistoryEvents(input: {
  states: StateRow[];
  audits: AuditRow[];
  copiedFrom: { folio: string; at: Date; actor: string } | null;
  copies: Array<{ id: string; folio: string; at: Date; actor: string }>;
}): HistoryEvent[] {
  const events: HistoryEvent[] = [
    ...input.states.map(describeStateChange),
    ...input.audits.map(describeAudit).filter((event): event is HistoryEvent => event !== null),
    ...input.copies.map((copy) => ({
      id: `copia-${copy.id}`, at: copy.at.toISOString(), actor: copy.actor, version: null,
      kind: "copy" as const, title: `Lo duplicó como ${copy.folio}`, detail: null,
    })),
  ];
  if (input.copiedFrom) {
    // The copy's own creation: its audit says «Creó», this says from which one.
    const created = events.find((event) => event.kind === "creation");
    const copyEvent: HistoryEvent = {
      id: "copia-de", at: input.copiedFrom.at.toISOString(), actor: input.copiedFrom.actor, version: null,
      kind: "copy", title: `Se creó como copia de ${input.copiedFrom.folio}`, detail: null,
    };
    if (created) Object.assign(created, { title: copyEvent.title, kind: "copy" });
    else events.push(copyEvent);
  }
  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

const EXPORT_LABELS: Record<string, string> = {
  DICTAMEN: "Dictamen en PDF",
  DICTAMEN_CORREO: "Dictamen enviado por correo",
  ENTREGABLES: "Dictamen de los entregables",
};
export const pdfLabel = (exportType: string) => EXPORT_LABELS[exportType.toUpperCase()] ?? "Dictamen en PDF";
