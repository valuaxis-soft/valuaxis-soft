"use client";

import { Building2, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, SessionExpiredError } from "@/lib/api-client";
import {
  emptyConstructionType,
  remainingUsefulLife,
  type ConstructionTypeDto,
  type ConstructionTypesDto,
} from "@/features/valuations/calculation/cost-types";
import { collectFormulas, withFormulaTexts, type CapturedFormulas } from "@/features/valuations/calculation/captured-formulas";
import { numbersOf, textsOf, type Texts } from "./draft-texts";
import { FormulaInput } from "./formula-input";
import { useDraftHistory } from "./use-draft-history";
import { useSerializedSave } from "./use-serialized-save";

const cell = "h-7 min-w-0 px-1.5 text-xs";
const figure = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-MX", { maximumFractionDigits: 2 }));

/** A type as it is edited: its texts, and the id of its row once saved, so renaming it keeps the row. */
type Row = Texts<Omit<ConstructionTypeDto, "id">> & { id?: number };
type Payload = { types: ConstructionTypeDto[]; formulas: CapturedFormulas };

const rowOf = ({ id, ...type }: ConstructionTypeDto): Row => ({ ...textsOf(type), ...(id === undefined ? {} : { id }) });
const typeOf = (row: Row, index: number): ConstructionTypeDto => {
  const { id, ...texts } = row;
  return { ...(id === undefined ? {} : { id }), ...numbersOf(texts, emptyConstructionType(index)) };
};
const typesOf = (rows: Row[]) => rows.map(typeOf);
const draftOf = (calculation: ConstructionTypesDto): Row[] => withFormulaTexts(calculation.types.map(rowOf), formulasOfTypes(calculation.formulas));
/** The stored formulas are by path of what is saved ("types.0.area"); the draft is the list itself. */
const formulasOfTypes = (formulas: CapturedFormulas) =>
  Object.fromEntries(Object.entries(formulas).map(([path, formula]) => [path.replace(/^types\./, ""), formula]));

/** What can be saved: rows still being written (no reference) wait in the draft; the formulas of the rows saved go with them. */
function payloadOf(rows: Row[]): Payload {
  const kept = rows.flatMap((row, index) => (row.ref.trim() ? [index] : []));
  const types = kept.map((index) => typeOf(rows[index], index));
  return { types, formulas: collectFormulas({ types: kept.map((index) => rows[index]) }, { types }) };
}
const savedPayloadOf = (calculation: ConstructionTypesDto): Payload => ({ types: calculation.types, formulas: calculation.formulas });

const COLUMNS: { key: keyof Omit<ConstructionTypeDto, "id">; label: string; numeric?: boolean; className: string }[] = [
  { key: "ref", label: "Tipo", className: "w-16" },
  { key: "description", label: "Descripción", className: "min-w-48" },
  { key: "classification", label: "Clasificación", className: "min-w-28" },
  { key: "quality", label: "Calidad", className: "min-w-24" },
  { key: "area", label: "Sup. (m²)", numeric: true, className: "w-20" },
  { key: "age", label: "Edad", numeric: true, className: "w-14" },
  { key: "usefulLife", label: "VUT", numeric: true, className: "w-14" },
];

/**
 * Construction types of the construction section: the single capture of each
 * type's description, surface, age and useful life (question 10). The cost
 * approach picks them from this list. Saves when a field loses focus.
 */
export function ConstructionTypesPanel(props: {
  valuationId: string;
  readOnly: boolean;
  onCalculation: (types: ConstructionTypesDto) => void;
}) {
  const { valuationId } = props;
  const [calculation, setCalculation] = useState<ConstructionTypesDto | null>(null);
  const [draft, setDraft] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const readOnly = props.readOnly || Boolean(calculation?.locked);

  // What the server holds, to skip saves that would not change anything.
  const lastSaved = useRef<string | null>(null);
  const applyServerState = (next: ConstructionTypesDto) => {
    lastSaved.current = JSON.stringify(savedPayloadOf(next));
    setCalculation(next);
    setDraft(draftOf(next));
  };
  const enqueueSave = useSerializedSave(async (payload: Payload) => {
    if (JSON.stringify(payload) === lastSaved.current) return;
    setSaving(true);
    try {
      const next = await api.constructionTypes.save(valuationId, payload);
      lastSaved.current = JSON.stringify(savedPayloadOf(next));
      // The draft stays as typed; only the saved state moves. A new type takes the id of its row.
      setCalculation(next);
      setDraft((current) => current && withSavedIds(current, payload, next));
    } catch (error) {
      toast.error(error instanceof SessionExpiredError
        ? "Tu sesión expiró. Vuelve a iniciar sesión."
        : error instanceof Error ? error.message : "No se pudieron guardar los tipos de construcción.");
    } finally {
      setSaving(false);
    }
  });
  // Ctrl+Z in the table goes back through the drafts typed here, each one saved as an edit is.
  const sectionRef = useRef<HTMLElement | null>(null);
  const history = useDraftHistory<Row[]>({
    apply: (next) => {
      setDraft(next);
      if (!readOnly) void enqueueSave(payloadOf(next));
    },
    cellElement: (cell) => sectionRef.current?.querySelector<HTMLElement>(`[data-type-cell="${CSS.escape(cell)}"]`) ?? null,
  });
  const report = useEffectEvent((next: ConstructionTypesDto) => {
    if (!props.readOnly) props.onCalculation(next);
  });

  useEffect(() => {
    let active = true;
    api.constructionTypes.get(valuationId)
      .then((next) => { if (active) applyServerState(next); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "No se pudieron cargar los tipos de construcción."); });
    return () => { active = false; };
  }, [valuationId]);

  useEffect(() => {
    if (calculation) report(calculation);
  }, [calculation]);

  if (loadError) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  if (!calculation || !draft) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando los tipos de construcción…
      </div>
    );
  }

  const types = typesOf(draft);
  const save = () => {
    if (!readOnly) void enqueueSave(payloadOf(draft));
  };
  const setCell = (index: number, key: keyof Omit<ConstructionTypeDto, "id">, value: string) => {
    history.record(draft, `${index}:${key}`);
    setDraft((current) => current && current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };
  // A removal has no blur to wait for: it saves at once.
  const remove = (index: number) => {
    history.record(draft, null);
    const next = draft.filter((_, rowIndex) => rowIndex !== index);
    setDraft(next);
    if (!readOnly) void enqueueSave(payloadOf(next));
  };

  return (
    <section
      ref={sectionRef}
      className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:p-4"
      aria-labelledby="construction-types-title"
      onBlur={save}
      onKeyDown={(event) => history.onKeyDown(event, draft)}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 id="construction-types-title" className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="size-4" /> Tipos de construcción
        </h3>
        {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
      </header>
      {calculation.locked ? <p className="text-sm text-muted-foreground">El avalúo está concluido: los tipos son de solo lectura.</p> : null}
      <p className="text-xs text-muted-foreground">
        Superficie, edad y vida útil de cada tipo se capturan aquí una sola vez; el enfoque de costos los elige de esta lista y no los vuelve a teclear.
      </p>
      <fieldset disabled={readOnly} className="grid gap-2">
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full min-w-[760px] text-xs" aria-label="Tipos de construcción">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                {COLUMNS.map((column) => <th key={column.key} className="px-1.5 py-1 text-left font-medium">{column.label}</th>)}
                <th className="px-1.5 py-1 text-left font-medium">VUR</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {draft.map((row, index) => (
                <tr key={index} className="border-t">
                  {COLUMNS.map((column) => {
                    const Control = column.numeric ? FormulaInput : Input;
                    return (
                      <td key={column.key} className={`p-1 ${column.className}`}>
                        <Control
                          aria-label={column.label}
                          data-type-cell={`${index}:${column.key}`}
                          className={cell}
                          value={row[column.key]}
                          onChange={(event) => setCell(index, column.key, event.target.value)}
                        />
                      </td>
                    );
                  })}
                  <td className="w-14 px-1.5 whitespace-nowrap tabular-nums text-muted-foreground">{figure(remainingUsefulLife(types[index]))}</td>
                  <td className="p-1">
                    {!readOnly ? (
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar el tipo ${row.ref}`} onClick={() => remove(index)}>
                        <Trash2 />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly ? (
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => {
            history.record(draft, null);
            setDraft([...draft, rowOf(emptyConstructionType(draft.length))]);
          }}>
            <Plus data-icon="inline-start" /> Tipo de construcción
          </Button>
        ) : null}
      </fieldset>
    </section>
  );
}

/**
 * The draft with the ids the server gave the new types it saved: a type saved
 * without id is the row at its position, with the reference it was saved
 * with. Without its id, renaming it right after would replace it.
 */
function withSavedIds(rows: Row[], sent: Payload, saved: ConstructionTypesDto): Row[] {
  const idByRef = new Map(saved.types.flatMap((type) => (type.id === undefined ? [] : [[type.ref.trim().toLowerCase(), type.id] as const])));
  const sentRefs = new Set(sent.types.filter((type) => type.id === undefined).map((type) => type.ref.trim().toLowerCase()));
  return rows.map((row) => {
    const ref = row.ref.trim().toLowerCase();
    if (row.id !== undefined || !sentRefs.has(ref)) return row;
    const id = idByRef.get(ref);
    return id === undefined ? row : { ...row, id };
  });
}
