"use client";

import { ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ReadOnlyValuationAlert({ reason = "role" }: { reason?: "role" | "concluded" }) {
  return (
    <Alert>
      <ShieldCheck />
      <AlertTitle>{reason === "concluded" ? "Avalúo concluido" : "Modo consulta"}</AlertTitle>
      <AlertDescription>
        {reason === "concluded"
          ? "Esta versión está cerrada. Para corregirla, reábrela: se creará una versión nueva y esta se conserva."
          : "Tu rol permite ver y exportar avalúos, pero no editar su captura."}
      </AlertDescription>
    </Alert>
  );
}
