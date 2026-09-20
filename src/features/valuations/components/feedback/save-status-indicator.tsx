"use client";

import { Badge } from "@/components/ui/badge";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

const statusLabel: Record<SaveStatus, string> = {
  idle: "Sin cambios",
  dirty: "Cambios pendientes",
  saving: "Guardando cambios",
  saved: "Guardado",
  error: "Error al guardar",
};

export function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  return (
    <Badge variant={status === "saving" || status === "dirty" ? "default" : "secondary"} className="h-7">
      {statusLabel[status]}
    </Badge>
  );
}
