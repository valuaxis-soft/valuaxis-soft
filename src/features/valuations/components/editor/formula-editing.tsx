"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown, ChevronRight, FunctionSquare, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AppSection } from "@/features/valuations/model";
import { formatConceptValueForDocument } from "@/features/valuations/services/concept-value-format";
import {
  EMPTY_FORMULA_INDEX,
  buildFormulaIndex,
  cellReferenceText,
  columnLetter,
  conceptReferenceText,
  isFormulaText,
  type FormulaConceptEntry,
  type FormulaIndex,
  type FormulaTableEntry,
} from "@/features/valuations/services/formula-references";
import { getDisplayColumns } from "@/features/valuations/services/table";
import { evaluateTableFormulas, getCellDisplayValue } from "@/features/valuations/services/table-formula-engine";
import { conceptTakesFormula } from "@/features/valuations/services/valuation-formulas";
import { cn } from "@/lib/utils";

/* ================================================================== */
/*  Context — the formula being written and what it can point at       */
/* ================================================================== */

/** The field whose formula is being written. */
type FormulaSession = {
  /** `cell:<table>:<row>:<column>` or `concept:<id>`. */
  fieldKey: string;
  /** Table of the cell being edited; a concept has none. */
  homeTableId?: string;
};

type FormulaSessionHandlers = {
  insert: (text: string) => void;
  apply: () => void;
  cancel: () => void;
  input: () => HTMLInputElement | null;
};

type FormulaEditing = {
  /** The named values of the valuation. Empty outside the workspace: formulas then read their own table. */
  index: FormulaIndex;
  session: FormulaSession | null;
  begin: (session: FormulaSession, handlers: FormulaSessionHandlers) => void;
  end: (fieldKey: string) => void;
  /** Writes a reference where the caret of the field being edited is. */
  insertReference: (text: string) => void;
  /** The field lost the focus to the value picker: it is not done yet. */
  keepsEditing: () => boolean;
  resume: () => void;
};

const FormulaEditingContext = createContext<FormulaEditing>({
  index: EMPTY_FORMULA_INDEX,
  session: null,
  begin: () => {},
  end: () => {},
  insertReference: () => {},
  keepsEditing: () => false,
  resume: () => {},
});

export const useFormulaEditing = () => useContext(FormulaEditingContext);

/**
 * Lets the fields under it write formulas that use any value of the
 * valuation. While one is being written it shows a bar: a click on a cell or
 * a concept writes its reference, and "Buscar valor" lists the values of the
 * sections that are not on screen.
 */
export function FormulaEditingProvider({ sections, children }: { sections: AppSection[]; children: ReactNode }) {
  const index = useMemo(() => buildFormulaIndex(sections), [sections]);
  const [session, setSession] = useState<FormulaSession | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const handlersRef = useRef<FormulaSessionHandlers | null>(null);
  const keepEditingRef = useRef(false);

  const begin = useCallback<FormulaEditing["begin"]>((next, handlers) => {
    handlersRef.current = handlers;
    setSession((current) => (current?.fieldKey === next.fieldKey && current.homeTableId === next.homeTableId ? current : next));
  }, []);
  const end = useCallback<FormulaEditing["end"]>((fieldKey) => {
    setSession((current) => (current?.fieldKey === fieldKey ? null : current));
  }, []);
  const insertReference = useCallback<FormulaEditing["insertReference"]>((text) => handlersRef.current?.insert(text), []);
  const keepsEditing = useCallback(() => keepEditingRef.current, []);
  const resume = useCallback(() => {
    keepEditingRef.current = false;
  }, []);

  const editing = useMemo<FormulaEditing>(
    () => ({ index, session, begin, end, insertReference, keepsEditing, resume }),
    [index, session, begin, end, insertReference, keepsEditing, resume],
  );

  const openPicker = () => {
    keepEditingRef.current = true;
    setPickerOpen(true);
  };

  return (
    <FormulaEditingContext.Provider value={editing}>
      {children}
      {session ? (
        <div
          className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 shadow-lg dark:border-blue-500/40 dark:bg-blue-950 dark:text-blue-100"
          data-formula-bar=""
          // The bar is used while the field keeps the focus and the caret.
          onMouseDown={(event) => event.preventDefault()}
        >
          <FunctionSquare className="size-4 shrink-0" />
          <span>
            <strong>Fórmula:</strong> haz clic en una celda o en un concepto para usarlo.
          </span>
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={openPicker}>
            <Search className="size-3" /> Buscar valor
          </Button>
          <Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={() => handlersRef.current?.apply()}>
            <Check className="size-3" /> Aplicar
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => handlersRef.current?.cancel()}>
            <X className="size-3" /> Cancelar
          </Button>
        </div>
      ) : null}
      <FormulaValuePicker
        index={index}
        session={session}
        open={pickerOpen && session !== null}
        onOpenChange={setPickerOpen}
        onPick={(text) => {
          handlersRef.current?.insert(text);
          setPickerOpen(false);
        }}
        returnFocusTo={() => handlersRef.current?.input() ?? null}
      />
    </FormulaEditingContext.Provider>
  );
}

/* ================================================================== */
/*  Field — an input that takes a value or a formula                   */
/* ================================================================== */

type Draft = { text: string; initial: string };

/**
 * The editing of a field that may hold a formula, as a spreadsheet cell does:
 * focusing it shows the formula, typing "=" starts one, Enter or leaving the
 * field applies it and Escape leaves it as it was. While the text starts with
 * "=", clicks on other cells and concepts write their references into it.
 */
export function useFormulaField({
  fieldKey,
  homeTableId,
  storedFormulaText,
  onCommit,
}: {
  fieldKey: string;
  homeTableId?: string;
  /** The formula the field holds, as written with its "=", when it holds one. */
  storedFormulaText: () => string | null;
  /** What was written, when it differs from what the field showed on entering. */
  onCommit: (text: string) => void;
}) {
  const editing = useFormulaEditing();
  const { begin, end } = editing;
  const [draft, setDraft] = useState<Draft | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const caretRef = useRef<number | null>(null);
  const writingFormula = draft !== null && isFormulaText(draft.text);

  // What the bar's buttons and the clicks on other fields act on: the field as it is now.
  const latestRef = useRef({ draft, onCommit });
  useEffect(() => {
    latestRef.current = { draft, onCommit };
  });

  /** Ends the writing and hands back what was written. The blur that follows finds nothing left to apply. */
  const takeDraft = useCallback(() => {
    const current = latestRef.current.draft;
    latestRef.current = { ...latestRef.current, draft: null };
    setDraft(null);
    return current;
  }, []);
  const commit = useCallback(() => {
    const apply = latestRef.current.onCommit;
    const current = takeDraft();
    // A lone "=" is a formula nobody wrote.
    if (current && current.text !== current.initial && current.text.trim() !== "=") apply(current.text);
  }, [takeDraft]);
  const discard = useCallback(() => {
    takeDraft();
    inputRef.current?.blur();
  }, [takeDraft]);

  useEffect(() => {
    if (!writingFormula) return;
    begin({ fieldKey, homeTableId }, {
      insert: (text) => {
        const current = latestRef.current.draft;
        if (!current) return;
        const input = inputRef.current;
        const start = input?.selectionStart ?? current.text.length;
        const endAt = input?.selectionEnd ?? start;
        caretRef.current = start + text.length;
        setDraft({ ...current, text: current.text.slice(0, start) + text + current.text.slice(endAt) });
      },
      apply: () => {
        commit();
        inputRef.current?.blur();
      },
      cancel: discard,
      input: () => inputRef.current,
    });
    return () => end(fieldKey);
  }, [begin, commit, discard, end, fieldKey, homeTableId, writingFormula]);

  // After a reference is written, the caret goes right after it.
  useEffect(() => {
    const caret = caretRef.current;
    const input = inputRef.current;
    if (caret === null || !input) return;
    caretRef.current = null;
    input.focus();
    input.setSelectionRange(caret, caret);
  }, [draft]);

  return {
    inputRef,
    /** What the input shows while it is being written; null when the field shows its own value. */
    draftText: draft?.text ?? null,
    writingFormula,
    /** Takes what was typed when it is, or was, a formula. False: the field handles it as a plain value. */
    change: (text: string) => {
      if (draft) {
        // A plain value that was never a formula goes back to the field's own handling.
        if (!isFormulaText(text) && !isFormulaText(draft.initial)) {
          setDraft(null);
          return false;
        }
        setDraft({ ...draft, text });
        return true;
      }
      // Typing over a formula that is showing its result replaces the formula once applied.
      const stored = storedFormulaText();
      if (stored === null && !isFormulaText(text)) return false;
      setDraft({ text, initial: stored ?? "" });
      return true;
    },
    onMouseDown: (event: MouseEvent<HTMLInputElement>) => {
      // A right click opens the field's menu without entering the field: the menu
      // gives the focus back to where it was, and a formula must not start being written by that.
      if (event.button === 2 && document.activeElement !== event.currentTarget) event.preventDefault();
    },
    onFocus: (_event?: FocusEvent<HTMLInputElement>) => {
      editing.resume();
      if (draft) return;
      const stored = storedFormulaText();
      if (stored !== null) setDraft({ text: stored, initial: stored });
    },
    onBlur: (_event?: FocusEvent<HTMLInputElement>) => {
      if (editing.keepsEditing()) return;
      commit();
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (!draft) return;
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        commit();
        inputRef.current?.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        discard();
      }
    },
    /** Starts writing a formula in the field, as typing "=" in it does. */
    start: () => {
      setDraft((current) => current ?? { text: storedFormulaText() ?? "=", initial: storedFormulaText() ?? "" });
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      caretRef.current = input.value.length + 1;
    },
  };
}

/**
 * Whether a click here writes a reference into the formula being written
 * elsewhere, and the handler that does it. `fieldKey` is this field's own.
 */
export function useFormulaReferenceTarget(fieldKey: string, referenceText: (homeTableId: string | undefined) => string | null) {
  const editing = useFormulaEditing();
  const active = editing.session !== null && editing.session.fieldKey !== fieldKey;
  return {
    active,
    onMouseDownCapture: active
      ? (event: MouseEvent) => {
          if (event.button !== 0) return;
          // The field being written keeps the focus: the click only writes the reference.
          event.preventDefault();
          event.stopPropagation();
          const text = referenceText(editing.session?.homeTableId);
          if (text) editing.insertReference(text);
        }
      : undefined,
  };
}

/* ================================================================== */
/*  Picker — the values of the whole valuation                         */
/* ================================================================== */

const PICKER_MAX_ROWS = 60;

function matches(query: string, ...texts: string[]) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const haystack = normalize(texts.join(" "));
  return words.every((word) => haystack.includes(word));
}

function FormulaValuePicker({
  index,
  session,
  open,
  onOpenChange,
  onPick,
  returnFocusTo,
}: {
  index: FormulaIndex;
  session: FormulaSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (text: string) => void;
  returnFocusTo: () => HTMLElement | null;
}) {
  const [query, setQuery] = useState("");
  const [openTableId, setOpenTableId] = useState<string | null>(null);

  const groups = useMemo(() => {
    if (!open) return [];
    const bySection = new Map<string, { title: string; concepts: FormulaConceptEntry[]; tables: FormulaTableEntry[] }>();
    const group = (entry: { sectionId: string; sectionTitle: string }) => {
      let found = bySection.get(entry.sectionId);
      if (!found) bySection.set(entry.sectionId, (found = { title: entry.sectionTitle, concepts: [], tables: [] }));
      return found;
    };
    for (const entry of index.concepts) {
      if (!conceptTakesFormula(entry.concept) || `concept:${entry.id}` === session?.fieldKey) continue;
      if (matches(query, entry.name, entry.sectionTitle, entry.blockTitle)) group(entry).concepts.push(entry);
    }
    for (const entry of index.tables) {
      if (!entry.table.rows.length) continue;
      if (matches(query, entry.name, entry.sectionTitle, entry.blockTitle)) group(entry).tables.push(entry);
    }
    return [...bySection.values()].filter((item) => item.concepts.length || item.tables.length);
  }, [index, open, query, session?.fieldKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" finalFocus={() => returnFocusTo() ?? true}>
        <DialogHeader>
          <DialogTitle>Buscar un valor del avalúo</DialogTitle>
          <DialogDescription>
            Elige un concepto o abre una tabla y elige una celda: su referencia se escribe en la fórmula.
          </DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Buscar por nombre, sección o bloque" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {groups.length === 0 ? <p className="text-sm text-muted-foreground">No hay valores con ese nombre.</p> : null}
          {groups.map((group) => (
            <section key={group.title} className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
              {group.concepts.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    const text = conceptReferenceText(index, entry.id);
                    if (text) onPick(text);
                  }}
                >
                  <span className="min-w-0 truncate">{entry.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatConceptValueForDocument(entry.concept) || "—"}</span>
                </button>
              ))}
              {group.tables.map((entry) => (
                <div key={entry.id} className="rounded-md border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => setOpenTableId((current) => (current === entry.id ? null : entry.id))}
                  >
                    {openTableId === entry.id ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    <span className="min-w-0 truncate">Tabla: {entry.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{entry.blockTitle}</span>
                  </button>
                  {openTableId === entry.id ? (
                    <PickerTable
                      entry={entry}
                      onPick={(rowId, columnId) => {
                        const text = cellReferenceText(index, entry.id, entry.table, rowId, columnId, session?.homeTableId);
                        if (text) onPick(text);
                      }}
                    />
                  ) : null}
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The cells of a table with their letters and numbers; a click picks one. */
function PickerTable({ entry, onPick }: { entry: FormulaTableEntry; onPick: (rowId: string, columnId: string) => void }) {
  const table = entry.table;
  const columns = getDisplayColumns(table);
  const results = evaluateTableFormulas(table);
  const rows = table.rows.slice(0, PICKER_MAX_ROWS);
  return (
    <div className="overflow-x-auto border-t p-2">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-6" />
            {columns.map((column, columnIndex) => (
              <th key={column.id} className="border px-1.5 py-1 text-left font-medium">
                <span className="mr-1 font-mono text-[10px] text-muted-foreground">{columnLetter(columnIndex)}</span>
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id}>
              <td className="pr-1 text-right font-mono text-[10px] text-muted-foreground">{rowIndex + 1}</td>
              {columns.map((column) => (
                <td key={column.id} className="border p-0">
                  <button
                    type="button"
                    className={cn("block min-h-6 w-full px-1.5 py-1 text-left hover:bg-blue-100 dark:hover:bg-blue-500/25")}
                    onClick={() => onPick(row.id, column.id)}
                  >
                    {getCellDisplayValue(table, row.id, column.id, results) || " "}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.rows.length > rows.length ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Se muestran las primeras {rows.length} filas; escribe la celda de las demás, por ejemplo [{entry.name}]!A{rows.length + 1}.</p>
      ) : null}
    </div>
  );
}
