"use client";

import { BadgeCheck, FileUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { AccreditationStatus } from "../accreditation-rules";
import type { AccreditationView } from "../accreditation.service";

const STATUS_COPY: Record<AccreditationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; text: string }> = {
  NO_ACREDITADO: {
    label: "No acreditado",
    variant: "outline",
    text: "Puedes hacer avalúos, pero tus dictámenes y memorias de cálculo imprimen el aviso «DOCUMENTO SIN VALIDEZ OFICIAL» hasta que acredites tu cédula.",
  },
  EN_REVISION: {
    label: "En revisión",
    variant: "secondary",
    text: "Leímos tu constancia y un administrador la está cotejando con la SEP. Mientras tanto tus documentos siguen imprimiendo el aviso. Te avisaremos al resolverla.",
  },
  ACREDITADO: {
    label: "Acreditado",
    variant: "default",
    text: "Tu cédula profesional quedó acreditada. Tus dictámenes ya no imprimen el aviso de documento sin validez oficial.",
  },
  RECHAZADO: {
    label: "Rechazado",
    variant: "destructive",
    text: "No pudimos acreditar tu constancia. Revisa que sea tuya y esté vigente y vuelve a subirla; tus documentos siguen imprimiendo el aviso.",
  },
};

const dateFormat = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" });

/** "Acreditación profesional" in the user's account: the state and the upload of the constancia. */
export function AccreditationSection({ initial }: { initial: AccreditationView }) {
  const [accreditation, setAccreditation] = useState(initial);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const copy = STATUS_COPY[accreditation.status];
  const canUpload = accreditation.status !== "ACREDITADO";

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const next = await api.accreditation.upload(file);
      setAccreditation(next);
      if (next.status === "ACREDITADO") toast.success("Tu cédula quedó acreditada.");
      else toast.info("Recibimos tu constancia: queda en revisión.");
    } catch (error) {
      toast.error(
        error instanceof SessionExpiredError
          ? "Tu sesión expiró. Vuelve a iniciar sesión."
          : error instanceof Error
            ? error.message
            : "No se pudo leer la constancia.",
      );
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <Card id="acreditacion" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <BadgeCheck className="size-5" />
          Acreditación profesional
          <Badge variant={copy.variant} data-accreditation-status={accreditation.status}>
            {copy.label}
          </Badge>
        </CardTitle>
        <CardDescription>
          Acredita tu cédula profesional subiendo tu <strong>Constancia de Situación Profesional</strong> de la SEP (PDF) o una
          imagen de su código QR. Lo hace una sola vez cada persona.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>{copy.text}</p>
        {accreditation.status === "RECHAZADO" && accreditation.reason ? (
          <p className="text-muted-foreground">Motivo: {accreditation.reason}</p>
        ) : null}
        <dl className="grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
          {accreditation.folio ? (
            <div>
              <dt className="inline">Folio de la constancia: </dt>
              <dd className="inline font-medium text-foreground">{accreditation.folio}</dd>
            </div>
          ) : null}
          {accreditation.cedulaNumber ? (
            <div>
              <dt className="inline">Cédula: </dt>
              <dd className="inline font-medium text-foreground">{accreditation.cedulaNumber}</dd>
            </div>
          ) : null}
          {accreditation.status === "ACREDITADO" && accreditation.verifiedAt ? (
            <div>
              <dt className="inline">Acreditado el </dt>
              <dd className="inline font-medium text-foreground">{dateFormat.format(new Date(accreditation.verifiedAt))}</dd>
            </div>
          ) : accreditation.requestedAt ? (
            <div>
              <dt className="inline">Enviada el </dt>
              <dd className="inline font-medium text-foreground">{dateFormat.format(new Date(accreditation.requestedAt))}</dd>
            </div>
          ) : null}
        </dl>
        {canUpload ? (
          <div className="space-y-2">
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              aria-label="Constancia de Situación Profesional o imagen de su código QR"
              onChange={(event) => void upload(event.target.files?.[0])}
            />
            <Button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
              {accreditation.status === "NO_ACREDITADO" ? "Subir constancia o código QR" : "Volver a subir la constancia"}
            </Button>
            <p className="text-xs text-muted-foreground">
              PDF, JPG, PNG o WebP, hasta 10 MB. Solo leemos el código QR, que lleva a la validación de la SEP; el archivo no se
              guarda y tu CURP no se almacena en claro.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
