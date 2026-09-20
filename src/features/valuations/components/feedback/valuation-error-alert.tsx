"use client";

import { ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ReadOnlyValuationAlert() {
  return (
    <Alert>
      <ShieldCheck />
      <AlertTitle>Modo consulta</AlertTitle>
      <AlertDescription>
        Tu rol permite ver y exportar proyectos, pero no editar la captura del avaluo.
      </AlertDescription>
    </Alert>
  );
}
