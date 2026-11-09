"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { CopyPlus, Hash, ListChecks, Minus, MoveRight, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Concept, ConceptValueFormat, ContentRowTagStyle } from "@/features/valuations/model";
import type { TextMark } from "@/features/valuations/services/text-marks";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const TAG_STYLE_OPTIONS: Array<{ value: ContentRowTagStyle | ""; label: string }> = [
  { value: "", label: "Columnas" },
  { value: "white", label: "Etiquetas, fondo blanco" },
  { value: "shaded", label: "Etiquetas sombreadas" },
];

const TEXT_MARKS: Array<{ mark: TextMark; letter: string; title: string; className: string }> = [
  { mark: "bold", letter: "N", title: "Negrita", className: "font-bold" },
  { mark: "italic", letter: "K", title: "Cursiva", className: "italic" },
  { mark: "underline", letter: "S", title: "Subrayado", className: "underline" },
];
import { ValueFormatSelect } from "./value-format-select";
import { deleteConfirmation, useConfirmDelete } from "./delete-confirm";

/**
 * Several concepts of one block or apartado chosen at once, to give them
 * the same "Espacio" or "Formato del valor" in a single step, to duplicate
 * or delete them together, or to move them elsewhere together.
 * The scope owns the choice; the rows read it to show their checkbox.
 */
type ConceptSelection = {
  selected: ReadonlySet<string>;
  toggle: (conceptId: string) => void;
};

const ConceptSelectionContext = createContext<ConceptSelection | null>(null);

/** The selection in progress around this concept, if any. */
export function useConceptSelection() {
  return useContext(ConceptSelectionContext);
}

/**
 * What the container of a concept does with its concepts, for the
 * right-click menu of one of them: its row printed as columns or labels
 * ("Renglón") and "Seleccionar conceptos" started with it chosen.
 */
type ConceptContainerActions = {
  applyTagStyle?: (conceptIds: string[], tagStyle: ContentRowTagStyle | undefined) => void;
  startSelection: (conceptId: string) => void;
};

const ConceptContainerActionsContext = createContext<ConceptContainerActions | null>(null);

/** The actions of the container around this concept; null outside one or in a read-only valuation. */
export function useConceptContainerActions() {
  return useContext(ConceptContainerActionsContext);
}

/** The choices of "Renglón": columns of equal width, or labels on white or shaded. */
export const TAG_STYLE_CHOICES = TAG_STYLE_OPTIONS;

/** The checkbox a concept row shows while its container is selecting concepts. */
export function ConceptSelectionCheckbox({ conceptId, label }: { conceptId: string; label: string }) {
  const selection = useConceptSelection();
  if (!selection) return null;
  const title = `Seleccionar ${label || "concepto"}`;
  return (
    <span className="flex size-7 items-center justify-center">
      <Checkbox
        aria-label={title}
        checked={selection.selected.has(conceptId)}
        onCheckedChange={() => selection.toggle(conceptId)}
      />
    </span>
  );
}

/** The spacing of the chosen concepts when they all share one; null when they differ. */
export function commonSpacingAfter(concepts: Array<Pick<Concept, "spacingAfter">>): number | null {
  const values = new Set(concepts.map((concept) => concept.spacingAfter ?? 0));
  return values.size === 1 ? [...values][0] : null;
}

/** "Formato del valor" of the chosen concepts, applied to all of them at once. */
function SelectionValueFormat({ disabled, onApply }: { disabled: boolean; onApply: (valueFormat: ConceptValueFormat, customUnit?: string) => void }) {
  const [selected, setSelected] = useState<string>("plain");
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" size="xs" variant="outline" disabled={disabled} title="Dar el mismo formato del valor a los seleccionados">
            <Hash data-icon="inline-start" />
            Formato del valor
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56 p-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Formato del valor de los seleccionados</p>
          <ValueFormatSelect
            selected={selected}
            readOnly={disabled}
            onChoose={(format, customUnit) => {
              setSelected(format === "custom" && customUnit ? `unit:${customUnit}` : format);
              onApply(format, customUnit);
            }}
          />
          <p className="text-[11px] text-muted-foreground">Se aplica a los conceptos de texto y número; las fechas y teléfonos no cambian.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ConceptSelectionScope({
  concepts,
  readOnly,
  onApplySpacing,
  onApplyTagStyle,
  onApplyTextMark,
  onApplyValueFormat,
  onDuplicate,
  onRemove,
  renderMove,
  lockedReason,
  actions,
  children,
}: {
  concepts: Concept[];
  readOnly: boolean;
  /** Gives every chosen concept the spacing, in one update. */
  onApplySpacing: (conceptIds: string[], spacingAfter: number) => void;
  /** Prints the rows of the chosen concepts as columns or as labels ("Renglón"), in one update. */
  onApplyTagStyle?: (conceptIds: string[], tagStyle: ContentRowTagStyle | undefined) => void;
  /** Bold, italic or underline on the whole value of every chosen text, in one update. */
  onApplyTextMark?: (conceptIds: string[], mark: TextMark) => void;
  /** Gives every chosen text or number concept the format, in one update. */
  onApplyValueFormat?: (conceptIds: string[], valueFormat: ConceptValueFormat, customUnit?: string) => void;
  /** A copy of each chosen concept after it, in one update. */
  onDuplicate?: (conceptIds: string[]) => void;
  /** Deletes the chosen concepts, in one update; asked first. */
  onRemove?: (conceptIds: string[]) => void;
  /** The control that moves the chosen concepts ("Mover a…"); `done` ends the selection. */
  renderMove?: (conceptIds: string[], done: () => void) => ReactNode;
  /**
   * Why what the selection cannot do here is disabled (the concepts the
   * calculation writes): the controls it is not given show disabled with it,
   * so the bar has the same controls in every block.
   */
  lockedReason?: string;
  /** The creation controls of the container, printed on the same line as the selection. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const confirmDelete = useConfirmDelete();
  // Concepts removed meanwhile drop out of the choice.
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const chosen = concepts.filter((concept) => selected.has(concept.id));
  const chosenIds = chosen.map((concept) => concept.id);
  const spacing = commonSpacingAfter(chosen);

  const toggle = (conceptId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(conceptId)) next.delete(conceptId);
    else next.add(conceptId);
    return next;
  });
  const stop = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const start = (conceptId: string) => {
    setSelecting(true);
    setSelected(new Set([conceptId]));
  };
  const lockedButton = (label: string, icon?: ReactNode) => lockedReason ? (
    <Button type="button" size="xs" variant="outline" disabled title={lockedReason}>
      {icon}
      {label}
    </Button>
  ) : null;
  const apply = (spacingAfter: number) => {
    if (!chosen.length) return;
    onApplySpacing(chosenIds, Math.max(0, spacingAfter));
  };

  // Every container with a concept offers the selection: one concept can be moved, duplicated or deleted from it too.
  const toolbar = readOnly || concepts.length < 1 ? null : selecting ? (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs" data-concept-selection>
      <span className="tabular-nums">{chosen.length} de {concepts.length} seleccionados</span>
      <Button type="button" size="xs" variant="ghost" onClick={() => setSelected(new Set(conceptIds))}>
        Todos
      </Button>
      <Button type="button" size="xs" variant="ghost" disabled={!chosen.length} onClick={() => setSelected(new Set())}>
        Ninguno
      </Button>
      <span className="mx-1 h-4 border-l" aria-hidden="true" />
      <span className="text-muted-foreground">Espacio</span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Disminuir espacio de los seleccionados"
        disabled={!chosen.length || (spacing ?? 0) <= 0}
        onClick={() => apply((spacing ?? 0) - 1)}
      >
        <Minus />
      </Button>
      <span className="min-w-[1.5rem] text-center tabular-nums" title={spacing === null ? "Los seleccionados tienen espacios distintos" : undefined}>
        {spacing ?? "—"}
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Aumentar espacio de los seleccionados"
        disabled={!chosen.length}
        onClick={() => apply((spacing ?? 0) + 1)}
      >
        <Plus />
      </Button>
      {onApplyValueFormat ? (
        <>
          <span className="mx-1 h-4 border-l" aria-hidden="true" />
          <SelectionValueFormat disabled={!chosen.length} onApply={(format, customUnit) => onApplyValueFormat(chosenIds, format, customUnit)} />
        </>
      ) : lockedButton("Formato del valor", <Hash data-icon="inline-start" />)}
      {onApplyTagStyle ? (
        <NativeSelect
          aria-label="Renglón de los seleccionados"
          title="Cómo se imprimen los renglones de los seleccionados: en columnas o con etiquetas"
          size="sm"
          className="h-7 w-44"
          disabled={!chosen.length}
          value=""
          onChange={(event) => onApplyTagStyle(chosenIds, event.target.value === "" ? undefined : (event.target.value as ContentRowTagStyle))}
        >
          <NativeSelectOption value="" disabled>Renglón…</NativeSelectOption>
          {TAG_STYLE_OPTIONS.map((option) => (
            <NativeSelectOption key={option.label} value={option.value}>{option.label}</NativeSelectOption>
          ))}
        </NativeSelect>
      ) : null}
      {onApplyTextMark ? (
        <span className="flex items-center gap-0.5" role="toolbar" aria-label="Formato del texto de los seleccionados">
          {TEXT_MARKS.map((item) => (
            <Button
              key={item.mark}
              type="button"
              size="icon-xs"
              variant="ghost"
              className={item.className}
              aria-label={`${item.title} a los seleccionados`}
              title={`${item.title} a todo el dato de los seleccionados; si ya la tienen, se quita`}
              disabled={!chosen.length}
              onClick={() => onApplyTextMark(chosenIds, item.mark)}
            >
              {item.letter}
            </Button>
          ))}
        </span>
      ) : lockedReason ? (
        <span className="flex items-center gap-0.5" role="toolbar" aria-label="Formato del texto de los seleccionados">
          {TEXT_MARKS.map((item) => (
            <Button key={item.mark} type="button" size="icon-xs" variant="ghost" className={item.className} aria-label={`${item.title} a los seleccionados`} title={lockedReason} disabled>
              {item.letter}
            </Button>
          ))}
        </span>
      ) : null}
      {onDuplicate ? (
        <Button type="button" size="xs" variant="outline" disabled={!chosen.length} title="Una copia de cada seleccionado, a continuación" onClick={() => { onDuplicate(chosenIds); stop(); }}>
          <CopyPlus data-icon="inline-start" />
          Duplicar
        </Button>
      ) : lockedButton("Duplicar", <CopyPlus data-icon="inline-start" />)}
      {renderMove ? (
        <>
          <span className="mx-1 h-4 border-l" aria-hidden="true" />
          {renderMove(chosenIds, stop)}
        </>
      ) : lockedReason ? (
        <>
          <span className="mx-1 h-4 border-l" aria-hidden="true" />
          {lockedButton("Mover a…", <MoveRight data-icon="inline-start" />)}
        </>
      ) : null}
      {onRemove ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="text-destructive hover:text-destructive"
          disabled={!chosen.length}
          title="Eliminar los seleccionados"
          onClick={() => confirmDelete({ ...deleteConfirmation("concepts", undefined, chosen.length), onConfirm: () => { onRemove(chosenIds); stop(); } })}
        >
          <Trash2 data-icon="inline-start" />
          Eliminar
        </Button>
      ) : lockedButton("Eliminar", <Trash2 data-icon="inline-start" />)}
      <Button type="button" size="xs" variant="outline" className="ml-1" onClick={stop}>
        <X data-icon="inline-start" />
        Listo
      </Button>
    </div>
  ) : (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      title="Elegir varios conceptos para darles el mismo espacio o formato, duplicarlos, moverlos o eliminarlos juntos"
      onClick={() => setSelecting(true)}
    >
      <ListChecks data-icon="inline-start" />
      Seleccionar conceptos
    </Button>
  );

  return (
    <ConceptContainerActionsContext.Provider value={readOnly ? null : { applyTagStyle: onApplyTagStyle, startSelection: start }}>
    <ConceptSelectionContext.Provider value={selecting && !readOnly ? { selected, toggle } : null}>
      {actions || toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {toolbar}
        </div>
      ) : null}
      {children}
    </ConceptSelectionContext.Provider>
    </ConceptContainerActionsContext.Provider>
  );
}
