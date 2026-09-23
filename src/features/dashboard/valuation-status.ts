/**
 * Spanish labels and badge styles for the valuation status catalog
 * (devpware_estados_avaluos). Keys are the lowercase SClave used in the DTOs.
 */

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

type StatusPresentation = {
  /** Singular label, used in badges. */
  label: string;
  /** Plural label, used in the dashboard counters. */
  pluralLabel: string;
  variant: BadgeVariant;
};

const STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  nuevo: { label: "Nuevo", pluralLabel: "Nuevos", variant: "secondary" },
  en_edicion: { label: "En edición", pluralLabel: "En edición", variant: "secondary" },
  en_revision: { label: "En revisión", pluralLabel: "En revisión", variant: "default" },
  terminado: { label: "Terminado", pluralLabel: "Terminados", variant: "outline" },
  reabierto: { label: "Reabierto", pluralLabel: "Reabiertos", variant: "secondary" },
  cancelado: { label: "Cancelado", pluralLabel: "Cancelados", variant: "destructive" },
};

export function getStatusPresentation(key: string, fallbackName?: string): StatusPresentation {
  const known = STATUS_PRESENTATION[key.toLowerCase()];
  if (known) return known;
  const label = fallbackName?.trim() || humanizeStatusKey(key);
  return { label, pluralLabel: label, variant: "outline" };
}

function humanizeStatusKey(key: string) {
  const text = key.toLowerCase().replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Sin estado";
}
