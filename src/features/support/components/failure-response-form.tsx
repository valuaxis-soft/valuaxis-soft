"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { FAILURE_RESPONSE_MAX, FAILURE_STATUS_LABELS, RESPONSE_STATUSES } from "../failure-report";

/** The operator's response to one report: a status and what was done or found. */
export function FailureResponseForm({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<(typeof RESPONSE_STATUSES)[number]>("EN_REVISION");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!response.trim()) {
      setError("Escribe la respuesta.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.support.respond(reportId, { status, response: response.trim() });
      toast.success("Respuesta registrada.");
      setResponse("");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo registrar la respuesta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="grid gap-2" onSubmit={(event) => void submit(event)} noValidate data-failure-response-form={reportId}>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Estado del reporte" value={status} disabled={busy} onChange={(event) => setStatus(event.target.value as typeof status)}>
          {RESPONSE_STATUSES.map((option) => <NativeSelectOption key={option} value={option}>{FAILURE_STATUS_LABELS[option]}</NativeSelectOption>)}
        </NativeSelect>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : null}
          Registrar respuesta
        </Button>
      </div>
      <Textarea
        aria-label="Respuesta"
        rows={2}
        maxLength={FAILURE_RESPONSE_MAX}
        placeholder="Qué se revisó y qué se corrigió, o por qué no fue posible."
        value={response}
        disabled={busy}
        onChange={(event) => setResponse(event.target.value)}
      />
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </form>
  );
}
