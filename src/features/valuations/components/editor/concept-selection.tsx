"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { AlignHorizontalDistributeCenter, Check, CopyPlus, Hash, ListChecks, Minus, MoveRight, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Concept, ConceptValueFormat, ContentRowTagStyle } from "@/features/valuations/model";
import type { ConceptPresentation } from "@/features/valuations/services/concept-presentation";
import type { TextMark } from "@/features/valuations/services/text-marks";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ValueFormatSelect } from "./value-format-select";
import { IndentOffsetControl } from "./indent-offset-control";
import { useDeleteConcepts } from "./delete-confirm";

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

/** The two spacings of a concept the selection sets: blank lines before and after it. */
export type SpacingField = "spacingBefore" | "spacingAfter";

/** Why "Seleccionar conceptos" is disabled in a block or subbloque with no concept yet. */
export const NO_CONCEPTS_TO_SELECT = "Todavía no hay conceptos aquí: agrega uno con «Agregar» para seleccionarlo.";

/**
 * Several concepts of one block or subbloque chosen at once, to give them
 * the same spacing, indentation, format or row style in a single step, to
 * duplicate or delete them together, or to move them elsewhere together.
 * It is where those settings live: the rows and the concepts do not repeat
 * them on hover. The scope owns the choice; the rows read it to show their
 * checkbox.
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
export function commonSpacing(concepts: Array<Pick<Concept, SpacingField>>, field: SpacingField): number | null {
  const values = new Set(concepts.map((concept) => concept[field] ?? 0));
  return values.size === 1 ? [...values][0] : null;
}

/** "Espacio antes" or "Espacio después" of the chosen concepts: − the number +. */
function SelectionSpacing({ label, field, chosen, onApply }: { label: string; field: SpacingField; chosen: Concept[]; onApply: (field: SpacingField, lines: number) => void }) {
  const spacing = commonSpacing(chosen, field);
  const lowered = label.toLowerCase();
  return (
    <span className="flex items-center gap-0.5" data-selection-spacing={field}>
      <span className="text-muted-foreground">{label}</span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={`Disminuir ${lowered} de los seleccionados`}
        disabled={!chosen.length || (spacing ?? 0) <= 0}
        onClick={() => onApply(field, Math.max(0, (spacing ?? 0) - 1))}
      >
        <Minus />
      </Button>
      <span className="min-w-[1.5rem] text-center tabular-nums" title={spacing === null ? "Los seleccionados tienen espacios distintos" : undefined}>
        {chosen.length ? spacing ?? "—" : "—"}
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={`Aumentar ${lowered} de los seleccionados`}
        disabled={!chosen.length}
        onClick={() => onApply(field, (spacing ?? 0) + 1)}
      >
        <Plus />
      </Button>
    </span>
  );
}

/** "Sangría" of the chosen concepts: the default one, or the same adjustment for all of them. */
function SelectionIndent({ disabled, onApply }: { disabled: boolean; onApply: (presentation: ConceptPresentation | undefined) => void }) {
  const [offset, setOffset] = useState<number | null>(null);
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" size="xs" variant="outline" disabled={disabled} title="Dar la misma sangría a los seleccionados">
            <AlignHorizontalDistributeCenter data-icon="inline-start" />
            Sangría
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 p-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Sangría de los seleccionados</p>
          <Button
            type="button"
            size="sm"
            variant={offset === null ? "default" : "outline"}
            className="w-full justify-start text-xs"
            onClick={() => {
              setOffset(null);
              onApply(undefined);
            }}
          >
            Predeterminada
          </Button>
          <Button
            type="button"
            size="sm"
            variant={offset === null ? "outline" : "default"}
            className="w-full justify-start text-xs"
            onClick={() => {
              setOffset(0);
              onApply({ mode: "custom", labelGuideOffsetPx: 0 });
            }}
          >
            Personalizada
          </Button>
          {offset !== null ? (
            <IndentOffsetControl
              value={offset}
              disabled={disabled}
              onChange={(next) => {
                setOffset(next);
                onApply({ mode: "custom", labelGuideOffsetPx: next });
              }}
            />
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
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

const separator = <span className="mx-1 h-4 border-l" aria-hidden="true" />;

export function ConceptSelectionScope({
  concepts,
  readOnly,
  onApplySpacing,
  onApplyIndent,
  onApplyTagStyle,
  onApplyTextMark,
  onApplyValueFormat,
  onDuplicate,
  onRemove,
  renderMove,
  lockedReason,
  emptyReason = NO_CONCEPTS_TO_SELECT,
  actions,
  children,
}: {
  concepts: Concept[];
  readOnly: boolean;
  /** Gives every chosen concept the blank lines before or after it, in one update. */
  onApplySpacing: (conceptIds: string[], field: SpacingField, lines: number) => void;
  /** Gives the cells of every chosen concept the same "Sangría" (undefined: the default), in one update. */
  onApplyIndent?: (conceptIds: string[], presentation: ConceptPresentation | undefined) => void;
  /** Prints the rows of the chosen concepts as columns or as labels ("Renglón"), in one update. */
  onApplyTagStyle?: (conceptIds: string[], tagStyle: ContentRowTagStyle | undefined) => void;
  /** Bold, italic or underline on the whole value of every chosen text, in one update. */
  onApplyTextMark?: (conceptIds: string[], mark: TextMark) => void;
  /** Gives every chosen text or number concept the format, in one update. */
  onApplyValueFormat?: (conceptIds: string[], valueFormat: ConceptValueFormat, customUnit?: string) => void;
  /** A copy of each chosen concept after it, in one update. */
  onDuplicate?: (conceptIds: string[]) => void;
  /** Deletes the chosen concepts, in one update; more than three ask first. */
  onRemove?: (conceptIds: string[]) => void;
  /** The control that moves the chosen concepts ("Mover a…"); `done` ends the selection. */
  renderMove?: (conceptIds: string[], done: () => void) => ReactNode;
  /**
   * Why what the selection cannot do here is disabled (the concepts the
   * calculation writes): the controls it is not given show disabled with it,
   * so the bar has the same controls in every block.
   */
  lockedReason?: string;
  /** Why "Seleccionar conceptos" is disabled while there is no concept to choose. */
  emptyReason?: string;
  /**
   * The creation controls of the container ("Agregar", "Subbloque"…): the
   * first line of the block or subbloque, on the left, with "Seleccionar
   * conceptos" on the right and a line under them that sets them apart from
   * the content.
   */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const deleteConcepts = useDeleteConcepts();
  // Concepts removed meanwhile drop out of the choice.
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const chosen = concepts.filter((concept) => selected.has(concept.id));
  const chosenIds = chosen.map((concept) => concept.id);
  const active = selecting && !readOnly && concepts.length > 0;

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
  const applySpacing = (field: SpacingField, lines: number) => {
    if (!chosen.length) return;
    onApplySpacing(chosenIds, field, Math.max(0, lines));
  };

  // Every block and subbloque offers the selection, also with no concept yet (disabled, saying why).
  const selectButton = readOnly ? null : (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "ghost"}
      className="ml-auto"
      aria-pressed={active}
      disabled={!concepts.length}
      title={concepts.length
        ? "Elegir varios conceptos para darles el mismo espacio, sangría, renglón o formato, duplicarlos, moverlos o eliminarlos juntos"
        : emptyReason}
      data-concept-selection-start=""
      onClick={() => (active ? stop() : setSelecting(true))}
    >
      <ListChecks data-icon="inline-start" />
      Seleccionar conceptos
    </Button>
  );

  // While choosing, the bar stays at the top of the editor as it scrolls down the block.
  const bar = active ? (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center gap-1 rounded-lg border border-primary/40 bg-card px-2 py-1 text-xs shadow-lift"
      role="toolbar"
      aria-label="Conceptos seleccionados"
      data-concept-selection=""
    >
      <span className="tabular-nums">{chosen.length} de {concepts.length} seleccionados</span>
      <Button type="button" size="xs" variant="ghost" onClick={() => setSelected(new Set(conceptIds))}>
        Todos
      </Button>
      <Button type="button" size="xs" variant="ghost" disabled={!chosen.length} onClick={() => setSelected(new Set())}>
        Ninguno
      </Button>
      {separator}
      <SelectionSpacing label="Espacio antes" field="spacingBefore" chosen={chosen} onApply={applySpacing} />
      <SelectionSpacing label="Espacio después" field="spacingAfter" chosen={chosen} onApply={applySpacing} />
      {separator}
      {onApplyIndent ? (
        <SelectionIndent disabled={!chosen.length} onApply={(presentation) => onApplyIndent(chosenIds, presentation)} />
      ) : lockedButton("Sangría", <AlignHorizontalDistributeCenter data-icon="inline-start" />)}
      {onApplyValueFormat ? (
        <SelectionValueFormat disabled={!chosen.length} onApply={(format, customUnit) => onApplyValueFormat(chosenIds, format, customUnit)} />
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
      {onApplyTextMark || lockedReason ? (
        <span className="flex items-center gap-0.5" role="group" aria-label="Formato del texto de los seleccionados">
          {TEXT_MARKS.map((item) => (
            <Button
              key={item.mark}
              type="button"
              size="icon-xs"
              variant="ghost"
              className={item.className}
              aria-label={`${item.title} a los seleccionados`}
              title={onApplyTextMark ? `${item.title} a todo el dato de los seleccionados; si ya la tienen, se quita` : lockedReason}
              disabled={!onApplyTextMark || !chosen.length}
              onClick={() => onApplyTextMark?.(chosenIds, item.mark)}
            >
              {item.letter}
            </Button>
          ))}
        </span>
      ) : null}
      {separator}
      {onDuplicate ? (
        <Button type="button" size="xs" variant="outline" disabled={!chosen.length} title="Una copia de cada seleccionado, a continuación" onClick={() => { onDuplicate(chosenIds); stop(); }}>
          <CopyPlus data-icon="inline-start" />
          Duplicar
        </Button>
      ) : lockedButton("Duplicar", <CopyPlus data-icon="inline-start" />)}
      {renderMove ? renderMove(chosenIds, stop) : lockedButton("Mover a…", <MoveRight data-icon="inline-start" />)}
      {onRemove ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="text-destructive hover:text-destructive"
          disabled={!chosen.length}
          title="Eliminar los seleccionados (más de tres piden confirmación; se deshace con «Deshacer»)"
          onClick={() => deleteConcepts({
            count: chosen.length,
            name: chosen.length === 1 ? chosen[0].label : undefined,
            onDelete: () => { onRemove(chosenIds); stop(); },
          })}
        >
          <Trash2 data-icon="inline-start" />
          Eliminar
        </Button>
      ) : lockedButton("Eliminar", <Trash2 data-icon="inline-start" />)}
      {/* A green check in the corner ends the selection. */}
      <Button
        type="button"
        size="xs"
        className="ml-auto bg-success text-foreground hover:bg-success/85 dark:text-success-foreground"
        aria-label="Listo: terminar la selección"
        title="Listo: terminar la selección"
        data-concept-selection-done=""
        onClick={stop}
      >
        <Check data-icon="inline-start" />
        Listo
      </Button>
    </div>
  ) : null;

  return (
    <ConceptContainerActionsContext.Provider value={readOnly ? null : { applyTagStyle: onApplyTagStyle, startSelection: start }}>
    <ConceptSelectionContext.Provider value={active ? { selected, toggle } : null}>
      {actions || selectButton ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-dashed border-border pb-2" data-container-actions="">
          {actions}
          {selectButton}
        </div>
      ) : null}
      {bar}
      {children}
    </ConceptSelectionContext.Provider>
    </ConceptContainerActionsContext.Provider>
  );
}
