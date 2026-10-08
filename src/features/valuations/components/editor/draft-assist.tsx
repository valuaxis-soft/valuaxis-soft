"use client";

import { Loader2, PenLine } from "lucide-react";
import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { AI_NOTICE, useAiAssist } from "@/features/ai/ai-assist-context";
import { DRAFT_MIN_FACTS, DRAFT_TOO_LITTLE_DATA, hasEnoughFacts, type DraftInput } from "@/features/ai/draft-writing";
import type { AppSection, Concept, TableContent } from "@/features/valuations/model";
import { assumptionsDraftData, draftFactsFor, draftTablesFor } from "@/features/valuations/services/draft-facts";
import { api, SessionExpiredError } from "@/lib/api-client";

const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo redactar el borrador.";

/** The block or apartado a descriptive field belongs to: its title and its tables go with the draft request. */
type DraftScope = { title: string | null; tables: TableContent[] };
const DraftScopeContext = createContext<DraftScope>({ title: null, tables: [] });

export function DraftScopeProvider({ title, tables, children }: { title: string; tables: TableContent[]; children: ReactNode }) {
  return <DraftScopeContext value={{ title: title.trim() || null, tables }}>{children}</DraftScopeContext>;
}

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
  const scope = useContext(DraftScopeContext);
  return (
    <DraftPreview
      value={concept.value}
      request={() => ({
        field: concept.label.trim() || "Descripción",
        context: scope.title,
        facts: draftFactsFor(concept, container, allConcepts),
        tables: draftTablesFor(scope.tables),
      })}
      source="Redactado solo con los datos capturados en este apartado."
      tooLittle={DRAFT_TOO_LITTLE_DATA}
      onInsert={onInsert}
    />
  );
}

/**
 * The same under the carátula's «Supuestos y condiciones limitantes»: written
 * only from the assumptions and limiting conditions captured in the
 * considerations section.
 */
export function AssumptionsDraftAssist({
  concept,
  title,
  sections,
  onInsert,
}: {
  concept: Concept;
  /** Title of the carátula block the text belongs to. */
  title: string;
  sections: AppSection[];
  onInsert: (value: string) => void;
}) {
  return (
    <DraftPreview
      value={concept.value}
      request={() => ({ field: title.trim() || "Supuestos y condiciones limitantes", context: "CARÁTULA", ...assumptionsDraftData(sections) })}
      source="Redactado solo con los comentarios, supuestos y condiciones limitantes capturados en Consideraciones."
      tooLittle={`Hay muy pocos datos para redactar un borrador. Captura al menos ${DRAFT_MIN_FACTS} comentarios, supuestos o condiciones limitantes en la sección de Consideraciones y vuelve a intentarlo.`}
      onInsert={onInsert}
    />
  );
}

function DraftPreview({
  value,
  request,
  source,
  tooLittle,
  onInsert,
}: {
  /** The text the field has now. */
  value: string;
  /** What is sent, gathered when the draft is asked for. */
  request: () => DraftInput;
  /** Where the data of the draft came from, in words for the appraiser. */
  source: string;
  tooLittle: string;
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
  const current = value.trim();

  const write = async () => {
    const input = request();
    if (!hasEnoughFacts(input.facts, input.tables)) {
      setDraft(null);
      setMessage(tooLittle);
      return;
    }
    const sent = ++lastRequest.current;
    setMessage(null);
    setBusy(true);
    try {
      const result = await api.ai.writeDraft(valuationId, input);
      if (sent !== lastRequest.current) return;
      setDraft(result.text);
      setMode("append");
    } catch (failure) {
      if (sent === lastRequest.current) setMessage(errorMessage(failure));
    } finally {
      if (sent === lastRequest.current) setBusy(false);
    }
  };

  const insert = () => {
    if (!draft) return;
    onInsert(current && mode === "append" ? `${value.trimEnd()}\n\n${draft}` : draft);
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
            {source} {AI_NOTICE}
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
