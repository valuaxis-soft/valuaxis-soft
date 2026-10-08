"use client";

import { Loader2, PenLine } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { AI_NOTICE, useAiAssist } from "@/features/ai/ai-assist-context";
import { DRAFT_TOO_LITTLE_DATA, hasEnoughFacts } from "@/features/ai/draft-writing";
import type { Concept } from "@/features/valuations/model";
import { draftFactsFor } from "@/features/valuations/services/draft-facts";
import { api, SessionExpiredError } from "@/lib/api-client";

const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo redactar el borrador.";

/**
 * "Redactar borrador" under a descriptive field: asks for a paragraph written
 * only from the data captured next to it and shows it as a preview. The text
 * reaches the field only when the appraiser inserts it, and the valuation is
 * saved as usual.
 */
export function DraftAssist({
  concept,
  container,
  allConcepts,
  onInsert,
}: {
  /** The descriptive field, as shown. */
  concept: Concept;
  /** The concepts of the same block or apartado. */
  container: Concept[];
  allConcepts: Concept[];
  onInsert: (value: string) => void;
}) {
  const ai = useAiAssist();
  const modeName = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [mode, setMode] = useState<"append" | "replace">("append");
  // Only the answer to the last request is shown.
  const lastRequest = useRef(0);

  if (!ai.enabled || !ai.valuationId) return null;
  const valuationId = ai.valuationId;
  const current = concept.value.trim();

  const write = async () => {
    const facts = draftFactsFor(concept, container, allConcepts);
    if (!hasEnoughFacts(facts)) {
      setDraft(null);
      setMessage(DRAFT_TOO_LITTLE_DATA);
      return;
    }
    const request = ++lastRequest.current;
    setMessage(null);
    setBusy(true);
    try {
      const result = await api.ai.writeDraft(valuationId, { field: concept.label.trim() || "Descripción", context: null, facts });
      if (request !== lastRequest.current) return;
      setDraft(result.text);
      setMode("append");
    } catch (failure) {
      if (request === lastRequest.current) setMessage(errorMessage(failure));
    } finally {
      if (request === lastRequest.current) setBusy(false);
    }
  };

  const insert = () => {
    if (!draft) return;
    onInsert(current && mode === "append" ? `${concept.value.trimEnd()}\n\n${draft}` : draft);
    setDraft(null);
  };

  return (
    <div className="grid gap-1.5" data-draft-assist>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void write()}>
          {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <PenLine data-icon="inline-start" />}
          {busy ? "Redactando…" : draft ? "Redactar otro borrador" : "Redactar borrador"}
        </Button>
        {message ? <p className="text-xs text-destructive" role="alert">{message}</p> : null}
      </div>
      {draft ? (
        <div className="grid gap-2 rounded-md border border-dashed bg-muted/40 p-3" aria-live="polite">
          <p className="text-xs font-medium text-muted-foreground">Borrador (todavía no está en el avalúo)</p>
          <p className="text-sm whitespace-pre-wrap" data-draft-text>{draft}</p>
          <p className="text-xs text-muted-foreground">
            Redactado solo con los datos capturados en este apartado. {AI_NOTICE}
          </p>
          {current ? (
            <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <legend className="sr-only">Cómo insertar el borrador</legend>
              <label className="flex items-center gap-1.5">
                <input type="radio" name={modeName} checked={mode === "append"} onChange={() => setMode("append")} /> Agregar al final del texto actual
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name={modeName} checked={mode === "replace"} onChange={() => setMode("replace")} /> Reemplazar el texto actual
              </label>
            </fieldset>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={insert}>Insertar</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setDraft(null)}>Descartar</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
