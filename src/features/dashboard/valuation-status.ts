/**
 * Spanish labels and badge styles for the valuation status catalog
 * (devpware_estados_avaluos). Keys are the lowercase SClave used in the DTOs.
 */

/**
 * The color family of a status, from the semantic tokens of docs/DISENO.md:
 * Nuevo neutral (muted), En edición ocre (highlight, "a dato to watch"),
 * En revisión navy (primary), Terminado green (success, "approved"),
 * Reabierto violet (chart-4, there is no semantic token for it) and
 * Cancelado destructive.
 */
export type StatusTone = "info" | "progress" | "review" | "done" | "reopened" | "cancelled" | "neutral";

type StatusPresentation = {
  /** Singular label, used in badges. */
  label: string;
  /** Plural label, used in the dashboard counters. */
  pluralLabel: string;
  /** A short line for the person: what the status means for the work. */
  hint: string;
  tone: StatusTone;
};

const STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  nuevo: { label: "Nuevo", pluralLabel: "Nuevos", hint: "Recién creados, sin capturar", tone: "info" },
  en_edicion: { label: "En edición", pluralLabel: "En edición", hint: "Los que estás capturando", tone: "progress" },
  en_revision: { label: "En revisión", pluralLabel: "En revisión", hint: "Listos para revisar y concluir", tone: "review" },
  terminado: { label: "Terminado", pluralLabel: "Terminados", hint: "Concluidos y entregables", tone: "done" },
  reabierto: { label: "Reabierto", pluralLabel: "Reabiertos", hint: "Concluidos que volviste a abrir", tone: "reopened" },
  cancelado: { label: "Cancelado", pluralLabel: "Cancelados", hint: "Ya no siguen", tone: "cancelled" },
};

/**
 * Tailwind classes per tone: `dot` for the small marker, `soft` for a tinted
 * surface with readable text. The text stays
 * foreground so contrast does not depend on the hue; the hue is never the only
 * signal (the label is always shown).
 */
export const STATUS_TONE_CLASSES: Record<StatusTone, { dot: string; soft: string }> = {
  info: { dot: "bg-muted-foreground", soft: "bg-muted text-foreground ring-muted-foreground/30" },
  progress: { dot: "bg-highlight-strong", soft: "bg-highlight/15 text-foreground ring-highlight/45" },
  review: { dot: "bg-primary", soft: "bg-primary/10 text-foreground ring-primary/30" },
  done: { dot: "bg-success", soft: "bg-success/15 text-foreground ring-success/45" },
  reopened: { dot: "bg-chart-4", soft: "bg-chart-4/12 text-foreground ring-chart-4/40" },
  cancelled: { dot: "bg-destructive", soft: "bg-destructive/10 text-foreground ring-destructive/30" },
  neutral: { dot: "bg-muted-foreground", soft: "bg-muted text-foreground ring-border" },
};

export function getStatusPresentation(key: string, fallbackName?: string): StatusPresentation {
  const known = STATUS_PRESENTATION[key.toLowerCase()];
  if (known) return known;
  const label = fallbackName?.trim() || humanizeStatusKey(key);
  return { label, pluralLabel: label, hint: "", tone: "neutral" };
}

function humanizeStatusKey(key: string) {
  const text = key.toLowerCase().replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Sin estado";
}
