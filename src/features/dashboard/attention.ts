/**
 * "Requiere tu atención" of the dashboard: which open valuations are waiting
 * for something. Pure, so the rules are tested without a database. The system
 * only points them out; it never blocks or recommends anything.
 */

/** Days without a change after which a draft counts as forgotten. */
export const STALE_DRAFT_DAYS = 30;

/** Statuses whose work is still open. */
export const OPEN_STATUS_KEYS = ["nuevo", "en_edicion", "en_revision", "reabierto"] as const;
/** Statuses in which comparables are usually already captured. */
const CAPTURING_STATUS_KEYS = ["en_edicion", "en_revision", "reabierto"];
/** Statuses that are still a draft. */
const DRAFT_STATUS_KEYS = ["nuevo", "en_edicion", "reabierto"];

export type AttentionReason = "to-conclude" | "no-comparables" | "stale-draft";

export type AttentionCandidate = {
  id: string;
  folio: string;
  title: string;
  client: string;
  /** Lowercase status key. */
  status: string;
  updatedAt: Date;
  comparables: number;
};

export type AttentionItem = AttentionCandidate & { reasons: AttentionReason[]; idleDays: number };

const DAY_MS = 24 * 60 * 60 * 1000;

export function attentionReasons(candidate: AttentionCandidate, now: Date): AttentionReason[] {
  const status = candidate.status.toLowerCase();
  const reasons: AttentionReason[] = [];
  if (status === "en_revision") reasons.push("to-conclude");
  if (CAPTURING_STATUS_KEYS.includes(status) && candidate.comparables === 0) reasons.push("no-comparables");
  if (DRAFT_STATUS_KEYS.includes(status) && now.getTime() - candidate.updatedAt.getTime() >= STALE_DRAFT_DAYS * DAY_MS) reasons.push("stale-draft");
  return reasons;
}

/** The candidates with at least one reason, the ones to conclude first, then the longest idle. */
export function buildAttentionList(candidates: AttentionCandidate[], now: Date, limit = 6): AttentionItem[] {
  const rank = (item: AttentionItem) => (item.reasons.includes("to-conclude") ? 0 : item.reasons.includes("stale-draft") ? 1 : 2);
  return candidates
    .map((candidate) => ({
      ...candidate,
      reasons: attentionReasons(candidate, now),
      idleDays: Math.max(0, Math.floor((now.getTime() - candidate.updatedAt.getTime()) / DAY_MS)),
    }))
    .filter((item) => item.reasons.length > 0)
    .sort((a, b) => rank(a) - rank(b) || b.idleDays - a.idleDays)
    .slice(0, limit);
}

export const ATTENTION_LABEL: Record<AttentionReason, string> = {
  "to-conclude": "Por concluir",
  "no-comparables": "Sin comparables",
  "stale-draft": "Sin movimiento",
};

/** "Buenos días", "Buenas tardes" or "Buenas noches" by the hour in Mexico City. */
export function greetingFor(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("es-MX", { hour: "numeric", hourCycle: "h23", timeZone: "America/Mexico_City" }).format(now));
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** "hace 3 días", "hace 2 horas", "justo ahora": how long ago, in words. */
export function timeAgo(date: Date, now: Date) {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return "justo ahora";
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return format.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return format.format(Math.round(seconds / 86400), "day");
  if (abs < 86400 * 365) return format.format(Math.round(seconds / (86400 * 30)), "month");
  return format.format(Math.round(seconds / (86400 * 365)), "year");
}

/** The moment a page is rendered, for the relative dates of its lists. */
export const currentTime = () => new Date();
