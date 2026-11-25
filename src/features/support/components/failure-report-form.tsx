"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api, SessionExpiredError } from "@/lib/api-client";
import { FAILURE_DESCRIPTION_MAX } from "../failure-report";

export type ReportableValuation = { id: string; label: string };

/**
 * «Reportar una falla»: the valuation (optional), the day, what happened and
 * a screenshot if there is one. Sent, it is recorded and the operator is told.
 */
export function FailureReportForm({ valuations, today, initialValuationId }: { valuations: ReportableValuation[]; today: string; initialValuationId: string | null }) {
  const router = useRouter();
  const [valuationId, setValuationId] = useState(initialValuationId ?? "");
  const [happenedOn, setHappenedOn] = useState(today);
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (description.trim().length < 10) {
      setError("Describe la falla en al menos 10 caracteres: qué hiciste, qué esperabas y qué pasó.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.support.reportFailure({ valuationId: valuationId || null, happenedOn, description: description.trim(), screenshot });
      toast.success("Recibimos tu reporte. Lo revisaremos y aquí verás la respuesta.");
      setDescription("");
      setScreenshot(null);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : failure instanceof Error ? failure.message : "No se pudo enviar el reporte.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate data-failure-report-form="">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field>
          <FieldLabel htmlFor="failure-valuation">Avalúo</FieldLabel>
          <NativeSelect id="failure-valuation" className="w-full" value={valuationId} disabled={busy} onChange={(event) => setValuationId(event.target.value)}>
            <NativeSelectOption value="">Ninguno en particular</NativeSelectOption>
            {valuations.map((valuation) => <NativeSelectOption key={valuation.id} value={valuation.id}>{valuation.label}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="failure-date">Fecha de la falla</FieldLabel>
          <Input id="failure-date" type="date" max={today} value={happenedOn} disabled={busy} onChange={(event) => setHappenedOn(event.target.value)} />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="failure-description">Qué pasó</FieldLabel>
        <Textarea
          id="failure-description"
          rows={5}
          maxLength={FAILURE_DESCRIPTION_MAX}
          placeholder="Qué hacías, qué esperabas que pasara y qué pasó. Si salió un mensaje, cópialo aquí."
          value={description}
          disabled={busy}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="failure-screenshot">Captura de pantalla (opcional)</FieldLabel>
        <Input
          id="failure-screenshot"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(event) => setScreenshot(event.target.files?.[0] ?? null)}
        />
        <FieldDescription>Una imagen de hasta 10 MB. Evita que se vean datos de terceros que no hagan falta.</FieldDescription>
      </Field>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <Send data-icon="inline-start" />}
          {busy ? "Enviando…" : "Enviar reporte"}
        </Button>
      </div>
    </form>
  );
}
