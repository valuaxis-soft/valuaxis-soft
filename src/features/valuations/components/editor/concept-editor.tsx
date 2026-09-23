"use client";

//Sección de Importaciones
import { conceptLinkIndicator, isFullLinkedSourceOwned, resolveEffectiveConcept, type ConceptLinkIndicator, type ExistingConceptRelationMode } from "@/features/valuations/concept-links";
import {
  groupConceptsIntoRows,
  moveConceptIntoRows,
  type ConceptDropPosition,
} from "@/features/valuations/services/concept-layout";
import { useState, type ReactNode } from "react";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { closestCenter, DndContext, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import { editorCanScroll } from "./editor-dnd-autoscroll";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { AlignHorizontalDistributeCenter,
         ArrowUpDown, 
         Calendar,
         CalendarDays,
         ChevronDown, 
         ChevronUp, 
         Copy, 
         EllipsisVertical, 
         FilePlus2, Hash, Link, Link2, ListPlus, 
         LockKeyhole, Minus, Plus, Trash2, Unlink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizeConceptTitle } from "@/features/valuations/services/concept-title";
import {
  conceptValueFormatLabel,
  formatNumericConceptValue,
  isNumericConcept,
  normalizeNumericConceptInput,
  NUMERIC_VALUE_FORMAT_OPTIONS,
  resolveConceptValueFormat,
  resolveEffectiveSourceUnit,
} from "@/features/valuations/services/concept-value-format";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import type {
  Concept,
  ConceptDateFormat,
  ConceptValueFormat,
  ConceptType,
} from "@/features/valuations/model";
import type { ConceptPresentation } from "@/features/valuations/services/concept-presentation";
import { MIN_OFFSET_PX, MAX_OFFSET_PX } from "@/features/valuations/services/concept-presentation";

import {
  formatMexicanPhone,
} from "@/features/valuations/services/caratula-validation";

import {
  UNTITLED_CARATULA_CONCEPT,
} from "@/features/valuations/services/caratula-blocks";

import { ValuationDateField } from "../editor/valuation-date-field";

import { Textarea } from "@/components/ui/textarea";

import {
  isLongTerrenoConcept,
} from "@/features/valuations/sections/terreno";


/*Sección de Funciones */
function formatCaratulaConceptValue(concept: Concept) {
  const type = concept.type ?? "text";
  if (type === "phone") return formatMexicanPhone(concept.value);
  if (isNumericConcept(concept)) return formatNumericConceptValue(concept);
  return concept.value;
}
function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeCaratulaConceptValue(type: ConceptType, value: string) {
  if (type === "phone") return digitsOnly(value);
  if (type === "number" || type === "currency" || type === "measurement") return normalizeNumericConceptInput(value);
  return value;
}

function isSingleLineConceptType(type: ConceptType | undefined) {
  return type !== "longText";
}

function canNormalizeConceptLineBreaks(concept: Pick<Concept, "type" | "value">) {
  const type = concept.type ?? "text";
  return (type === "text" || type === "longText") && /[\r\n]/.test(concept.value);
}

function normalizeConceptLineBreaks(value: string) {
  return value.replace(/(?:\r\n|\r|\n)+/g, " ").replace(/[ \t]{2,}/g, " ");
}

function caratulaInputType(type: ConceptType) {
  if (type === "phone") return "tel";
  if (type === "email") return "email";
  if (type === "url") return "url";
  if (type === "number") return "text";
  if (type === "currency" || type === "measurement") return "text";
  return type;
}

export function ConceptEditorList({
  concepts,
  enableLayoutControls = false,
  layout = "default",
  onMove,
  onReorder,
  onRemove,
  onUpdate,
  onUpdateEverywhere,
  onChangeRelation,
  onUnlink,
  readOnly,
  requireTitle = false,
  showTerrenoLengthHint = false,
  allConcepts = concepts,
}: {
  concepts: Concept[];
  enableLayoutControls?: boolean;
  layout?: "default" | "caratulaGrid";
  onMove?: (conceptId: string, direction: -1 | 1) => void;
  onReorder?: (concepts: Concept[]) => void;
  onRemove: (conceptId: string) => void;
  onUpdate: (conceptId: string, patch: Partial<Concept>) => void;
  onUpdateEverywhere?: (conceptId: string, patch: Partial<Pick<Concept, "label" | "value">>) => void;
  onChangeRelation?: (conceptId: string, mode: ExistingConceptRelationMode) => void;
  onUnlink?: (conceptId: string) => void;
  readOnly: boolean;
  requireTitle?: boolean;
  showTerrenoLengthHint?: boolean;
  allConcepts?: Concept[];
}) {
  const rows = groupConceptsIntoRows(concepts);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeConcept = concepts.find((concept) => concept.id === activeId);
  const content = (
    <FieldGroup className={cn(enableLayoutControls && "grid grid-cols-1 gap-3")}>
        {rows.map((row, rowIndex) => (
          <ConceptRowDropZones
            isDragging={Boolean(activeId)}
            key={row.map((concept) => concept.id).join("-")}
            rowIndex={rowIndex}
          >
            <div
              className="grid min-w-0 w-full max-w-full grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]"
            >
            {row.map((concept) => (
              <ConceptDropZones isDragging={Boolean(activeId)} key={concept.id} conceptId={concept.id}>
                <ConceptEditorRow
                  concept={concept}
                  concepts={concepts}
                  dragEnabled={Boolean(onReorder)}
                  enableLayoutControls={enableLayoutControls}
                  layout={layout}
                  onMove={onMove}
                  onRemove={onRemove}
                  onUpdate={onUpdate}
                  onUpdateEverywhere={onUpdateEverywhere}
                  onChangeRelation={onChangeRelation}
                  onUnlink={onUnlink}
                  readOnly={readOnly}
                  requireTitle={requireTitle}
                  showTerrenoLengthHint={showTerrenoLengthHint}
                  allConcepts={allConcepts}
                />
              </ConceptDropZones>
            ))}
            </div>
          </ConceptRowDropZones>
        ))}
      </FieldGroup>
  );

  return (
    <DndContext
      id={`concepts-${concepts[0]?.id ?? "empty"}`}
      collisionDetection={closestCenter}
      autoScroll={{ canScroll: editorCanScroll }}
      onDragCancel={() => setActiveId(null)}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragEnd={({ active, over }) => {
        if (!onReorder || !over) {
          setActiveId(null);
          return;
        }
        const overId = String(over.id);
        const rowZoneMatch = /^concept-row:(\d+):(before|after)$/.exec(overId);
        const conceptZoneMatch = /^concept:(.+):(left|right)$/.exec(overId);
        const targetConceptId = conceptZoneMatch?.[1];
        const targetRowIndex = rowZoneMatch
          ? Number(rowZoneMatch[1])
          : rows.findIndex((row) => row.some((concept) => concept.id === (targetConceptId ?? overId)));
        if (targetRowIndex < 0 || targetRowIndex >= rows.length) {
          setActiveId(null);
          return;
        }
        const position = (rowZoneMatch?.[2] as ConceptDropPosition | undefined)
          ?? (conceptZoneMatch?.[2] as ConceptDropPosition | undefined)
          ?? "inside";
        const targetRow = rows[targetRowIndex];
        const targetRowId = targetRow[0]?.rowId ?? (position === "left" || position === "right" || position === "inside" ? crypto.randomUUID() : undefined);
        onReorder(moveConceptIntoRows(concepts, {
          activeId: String(active.id),
          newRowId: position === "before" || position === "after" ? crypto.randomUUID() : undefined,
          overId: targetConceptId,
          position,
          targetRowId,
          targetRowIndex,
        }));
        setActiveId(null);
      }}
    >
      {content}
      <DragOverlay dropAnimation={null}>
        {activeConcept ? <ConceptDragOverlay concept={activeConcept} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function ConceptRowDropZones({ children, isDragging, rowIndex }: { children: ReactNode; isDragging: boolean; rowIndex: number }) {
  // Destructured so the compiler does not treat the droppable objects as refs.
  const { isOver: isOverBefore, setNodeRef: setBeforeNodeRef } = useDroppable({ id: `concept-row:${rowIndex}:before` });
  const { isOver: isOverAfter, setNodeRef: setAfterNodeRef } = useDroppable({ id: `concept-row:${rowIndex}:after` });
  const zoneClassName = (isOver: boolean) => cn(
    "min-h-1 rounded-sm",
    isDragging && isOver && "min-h-12 border border-dashed border-primary bg-primary/10",
  );

  return (
    <>
      <div className={zoneClassName(isOverBefore)} ref={setBeforeNodeRef} />
      <div className="min-w-0">
        {children}
      </div>
      <div className={zoneClassName(isOverAfter)} ref={setAfterNodeRef} />
    </>
  );
}

function ConceptDropZones({ children, conceptId, isDragging }: { children: ReactNode; conceptId: string; isDragging: boolean }) {
  // Destructured so the compiler does not treat the droppable objects as refs.
  const { isOver: isOverLeft, setNodeRef: setLeftNodeRef } = useDroppable({ id: `concept:${conceptId}:left` });
  const { isOver: isOverRight, setNodeRef: setRightNodeRef } = useDroppable({ id: `concept:${conceptId}:right` });
  const zoneClassName = (isOver: boolean, side: "left" | "right") => cn(
    "pointer-events-none absolute inset-y-0 z-10 w-1/4 rounded-sm",
    side === "left" ? "left-0" : "right-0",
    isDragging && "pointer-events-auto",
    isDragging && isOver && "border border-dashed border-primary bg-primary/10",
  );

  return (
    <div className="relative min-w-0 w-full max-w-full">
      <div className={zoneClassName(isOverLeft, "left")} ref={setLeftNodeRef} />
      <div className={zoneClassName(isOverRight, "right")} ref={setRightNodeRef} />
      {children}
    </div>
  );
}

function ConceptDragOverlay({ concept }: { concept: Concept }) {
  return (
    <div className="grid min-w-40 max-w-sm grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded-md border border-primary/40 bg-background/95 p-2 text-sm shadow-lg">
      <span className="truncate font-medium">{concept.label || "Concepto"}</span>
      <span className="truncate text-muted-foreground">{concept.value || "Sin dato"}</span>
    </div>
  );
}

function ConceptLinkStatus({
  state,
  onChangeRelation,
  onUnlink,
}: {
  state: ConceptLinkIndicator;
  onChangeRelation?: (mode: ExistingConceptRelationMode) => void;
  onUnlink?: () => void;
}) {
  if (state === "none") return null;

  const isFull = state === "full";
  const title = isFull
    ? "Vínculo completo: título y dato se actualizan en todos lados."
    : "Vínculo parcial: solo el campo vinculado se actualiza en todos lados.";
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            title={title}
            aria-label={title}
            className={cn(isFull ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400")}
          >
            {isFull ? <Link2 /> : <Link />}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 p-2">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Relación</p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Vincular concepto"
              aria-label="Vincular concepto"
              className={cn(state === "full" && "bg-muted text-blue-600 dark:text-blue-400")}
              disabled={!onChangeRelation}
              onClick={() => onChangeRelation?.("full")}
            >
              <Link2 />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Vincular solo dato"
              aria-label="Vincular solo dato"
              className={cn(state === "partial" && "bg-muted text-green-600")}
              disabled={!onChangeRelation}
              onClick={() => onChangeRelation?.("value")}
            >
              <Link />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Copiar concepto"
              aria-label="Copiar concepto"
              disabled={!onChangeRelation}
              onClick={() => onChangeRelation?.("copyConcept")}
            >
              <Copy />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Copiar solo dato"
              aria-label="Copiar solo dato"
              disabled={!onChangeRelation}
              onClick={() => onChangeRelation?.("copyValue")}
            >
              <FilePlus2 />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Desvincular"
              aria-label="Desvincular"
              disabled={!onUnlink}
              onClick={onUnlink}
            >
              <Unlink />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ConceptSpacingInline({
  concept,
  onUpdate,
  readOnly,
}: {
  concept: Concept;
  onUpdate: (conceptId: string, patch: Partial<Concept>) => void;
  readOnly: boolean;
}) {
  const spacingAfter = concept.spacingAfter ?? 0;
  const updateSpacingAfter = (value: number) => {
    if (!Number.isFinite(value)) return;
    onUpdate(concept.id, { spacingAfter: Math.max(0, value) });
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">Espacio</span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Disminuir espacio"
        disabled={readOnly || spacingAfter <= 0}
        onClick={() => updateSpacingAfter(spacingAfter - 1)}
      >
        <Minus className="size-3" />
      </Button>
      <span className="min-w-[1.5rem] text-center text-xs tabular-nums">{spacingAfter}</span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Aumentar espacio"
        disabled={readOnly}
        onClick={() => updateSpacingAfter(spacingAfter + 1)}
      >
        <Plus className="size-3" />
      </Button>
    </div>
  );
}

function ConceptValueFormatControl({
  concept,
  onUpdate,
  readOnly,
}: {
  concept: Concept;
  onUpdate: (conceptId: string, patch: Partial<Concept>) => void;
  readOnly: boolean;
}) {
  const valueFormat = resolveConceptValueFormat(concept);
  const customUnit = concept.customUnit ?? "";
  const effectiveSourceUnit = resolveEffectiveSourceUnit(concept);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Formato del valor"
            disabled={readOnly}
            title={`Formato del valor: ${conceptValueFormatLabel(concept)}`}
          >
            <Hash />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56 p-3">
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Formato del valor</p>
          <NativeSelect
            className="w-full"
            disabled={readOnly}
            size="sm"
            value={valueFormat}
            onChange={(event) => {
              const nextFormat = event.target.value as ConceptValueFormat;
              const patch: Partial<Concept> = {
                valueFormat: nextFormat,
                customUnit: nextFormat === "custom" ? customUnit : undefined,
              };
              // Initialize sourceUnit on first change to a physical unit
              if (concept.sourceUnit === undefined && effectiveSourceUnit === valueFormat) {
                patch.sourceUnit = valueFormat;
              }
              onUpdate(concept.id, patch);
            }}
          >
            {NUMERIC_VALUE_FORMAT_OPTIONS.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {valueFormat === "custom" ? (
            <Field className="gap-1.5">
              <FieldLabel className="text-xs text-muted-foreground">Unidad</FieldLabel>
              <Input
                className="h-8"
                disabled={readOnly}
                maxLength={18}
                placeholder="ft, piezas, unidades"
                value={customUnit}
                onChange={(event) => onUpdate(concept.id, { customUnit: event.target.value })}
              />
            </Field>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const DATE_FORMAT_OPTIONS: Array<{ value: ConceptDateFormat; label: string; icon: typeof Calendar; tooltip: string }> = [
  { value: "short", label: "Corta", icon: Calendar, tooltip: "Fecha corta: 12/02/2024" },
  { value: "long", label: "Larga", icon: CalendarDays, tooltip: "Fecha larga: 12 de febrero de 2024" },
];

function ConceptDateFormatControl({
  concept,
  onUpdate,
  readOnly,
}: {
  concept: Concept;
  onUpdate: (conceptId: string, patch: Partial<Concept>) => void;
  readOnly: boolean;
}) {
  const currentFormat = concept.dateFormat ?? "normal";

  return (
    <div className="flex items-center gap-0.5">
      {DATE_FORMAT_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = currentFormat === option.value ||
          (option.value === "long" && currentFormat === "normal");
        return (
          <Button
            key={option.value}
            type="button"
            size="icon-sm"
            variant={isActive ? "default" : "ghost"}
            className="h-7 w-7"
            disabled={readOnly}
            title={option.tooltip}
            onClick={() => onUpdate(concept.id, { dateFormat: option.value })}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        );
      })}
    </div>
  );
}

function ConceptCellAlignmentControl({
  columnId,
  currentPresentation,
  disabled,
  onChange,
}: {
  columnId: string;
  currentPresentation?: ConceptPresentation;
  disabled: boolean;
  onChange: (columnId: string, presentation: ConceptPresentation | undefined) => void;
}) {
  const isCustom = currentPresentation?.mode === "custom";
  const currentOffset = currentPresentation?.labelGuideOffsetPx ?? 0;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="justify-start"
            aria-label="Alineación en documento"
            disabled={disabled}
            title="Alineación en documento"
          >
            <AlignHorizontalDistributeCenter data-icon="inline-start" />
            Alineación en documento
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56 p-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Alineación en documento</p>
          <Button
            type="button"
            size="sm"
            variant={isCustom ? "outline" : "default"}
            className="w-full justify-start text-xs"
            disabled={disabled}
            onClick={() => onChange(columnId, undefined)}
          >
            Predeterminada
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isCustom ? "default" : "outline"}
            className="w-full justify-start text-xs"
            disabled={disabled}
            onClick={() => onChange(columnId, { mode: "custom", labelGuideOffsetPx: 0 })}
          >
            Personalizada
          </Button>
          {isCustom && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Ajuste</span>
                <span>{currentOffset >= 0 ? `+${currentOffset}` : currentOffset} px</span>
              </div>
              <Slider
                min={MIN_OFFSET_PX}
                max={MAX_OFFSET_PX}
                step={1}
                value={[currentOffset]}
                onValueChange={(v) => {
                  const val = Array.isArray(v) ? v[0] : v;
                  onChange(columnId, { mode: "custom", labelGuideOffsetPx: val });
                }}
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ConceptOptionsMenu({
  concept,
  concepts,
  columnId,
  currentPresentation,
  enableSpacingControl,
  enableValueFormatControl,
  onColumnPresentationChange,
  onMove,
  onRemove,
  onUpdate,
  readOnly,
  valueFormatReadOnly = false,
}: {
  concept: Concept;
  concepts: Concept[];
  columnId?: string;
  currentPresentation?: ConceptPresentation;
  enableSpacingControl: boolean;
  enableValueFormatControl: boolean;
  enableWidthControl: boolean;
  onColumnPresentationChange?: (columnId: string, presentation: ConceptPresentation | undefined) => void;
  onMove?: (conceptId: string, direction: -1 | 1) => void;
  onRemove: (conceptId: string) => void;
  onUpdate: (conceptId: string, patch: Partial<Concept>) => void;
  readOnly: boolean;
  valueFormatReadOnly?: boolean;
}) {
  const showLineBreakAction = canNormalizeConceptLineBreaks(concept);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Opciones del concepto"
            title="Opciones del concepto"
          >
            <EllipsisVertical />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex flex-col gap-1">
          {enableSpacingControl ? (
            <ConceptSpacingInline concept={concept} readOnly={readOnly} onUpdate={onUpdate} />
          ) : null}
          {enableValueFormatControl ? (
            <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
              <span>Formato del valor</span>
              <ConceptValueFormatControl concept={concept} readOnly={readOnly || valueFormatReadOnly} onUpdate={onUpdate} />
            </div>
          ) : null}
          {concept.type === "date" ? (
            <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
              <span>Formato Fecha</span>
              <ConceptDateFormatControl concept={concept} readOnly={readOnly} onUpdate={onUpdate} />
            </div>
          ) : null}
          {onMove ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start"
                aria-label={`Subir ${concept.label}`}
                disabled={readOnly || concepts[0]?.id === concept.id}
                onClick={() => onMove(concept.id, -1)}
              >
                <ChevronUp data-icon="inline-start" />
                Subir concepto
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start"
                aria-label={`Bajar ${concept.label}`}
                disabled={readOnly || concepts.at(-1)?.id === concept.id}
                onClick={() => onMove(concept.id, 1)}
              >
                <ChevronDown data-icon="inline-start" />
                Bajar concepto
              </Button>
            </>
          ) : null}
          {showLineBreakAction ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="justify-start"
              aria-label="Unir líneas"
              disabled={readOnly}
              title="Reemplazar saltos de línea por espacios"
              onClick={() => onUpdate(concept.id, { value: normalizeConceptLineBreaks(concept.value) })}
            >
              <ListPlus data-icon="inline-start" />
              Unir líneas
            </Button>
          ) : null}
          {columnId && onColumnPresentationChange ? (
            <ConceptCellAlignmentControl
              columnId={columnId}
              currentPresentation={currentPresentation}
              disabled={readOnly}
              onChange={onColumnPresentationChange}
            />
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="justify-start text-destructive hover:text-destructive"
            aria-label="Eliminar concepto"
            disabled={readOnly}
            title="Eliminar concepto"
            onClick={() => onRemove(concept.id)}
          >
            <Trash2 data-icon="inline-start" />
            Eliminar concepto
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ConceptEditorRow({
  concept,
  concepts,
  columnId,
  currentPresentation,
  dragEnabled,
  enableLayoutControls,
  layout,
  onMove,
  onRemove,
  onUpdate,
  onUpdateEverywhere,
  onChangeRelation,
  onUnlink,
  onColumnPresentationChange,
  readOnly,
  requireTitle,
  showTerrenoLengthHint,
  allConcepts,
}: {
  concept: Concept;
  concepts: Concept[];
  columnId?: string;
  currentPresentation?: ConceptPresentation;
  dragEnabled: boolean;
  enableLayoutControls: boolean;
  layout: "default" | "caratulaGrid";
  onMove?: (conceptId: string, direction: -1 | 1) => void;
  onRemove: (conceptId: string) => void;
  onUpdate: (conceptId: string, patch: Partial<Concept>) => void;
  onUpdateEverywhere?: (conceptId: string, patch: Partial<Pick<Concept, "label" | "value">>) => void;
  onChangeRelation?: (conceptId: string, mode: ExistingConceptRelationMode) => void;
  onUnlink?: (conceptId: string) => void;
  onColumnPresentationChange?: (columnId: string, presentation: ConceptPresentation | undefined) => void;
  readOnly: boolean;
  requireTitle: boolean;
  showTerrenoLengthHint: boolean;
  allConcepts: Concept[];
}) {
  const effectiveConcept = resolveEffectiveConcept(concept, allConcepts);
  const cleanConceptLabel = normalizeConceptTitle(effectiveConcept.label);
  const titleMissing = requireTitle && !cleanConceptLabel.trim();
  const [isValueFocused, setIsValueFocused] = useState(false);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const conceptType = effectiveConcept.type ?? "text";
  const usesSingleLineEditor = isSingleLineConceptType(conceptType);
  const formatIsSourceOwned = isFullLinkedSourceOwned(concept, allConcepts);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: concept.id,
    disabled: readOnly || !dragEnabled,
  });

  if (layout === "caratulaGrid") {
    const showValueFormatControl = enableLayoutControls && isNumericConcept(effectiveConcept);
    const linkState = conceptLinkIndicator(concept, allConcepts);
    const handleLinkedAwareUpdate = (patch: Partial<Pick<Concept, "label" | "value">>) => {
      if (linkState !== "none" && onUpdateEverywhere) {
        onUpdateEverywhere(concept.id, patch);
        return;
      }
      onUpdate(concept.id, patch);
    };
    const handleTitleBlur = () => {
      setIsTitleFocused(false);
      if (titleMissing) {
        handleLinkedAwareUpdate({ label: UNTITLED_CARATULA_CONCEPT });
        return;
      }
      if (cleanConceptLabel !== concept.label) handleLinkedAwareUpdate({ label: cleanConceptLabel });
    };
    return (
      <div
        className={cn(
          "grid w-full min-w-0 grid-cols-[auto_minmax(0,220px)_minmax(0,1fr)_auto] items-start gap-2 overflow-hidden",
        )}
        ref={setNodeRef}
        style={{ opacity: isDragging ? 0.35 : undefined }}
      >
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Mover concepto"
          className={cn(!dragEnabled && "invisible")}
          disabled={readOnly || !dragEnabled}
          title="Mover concepto"
          {...attributes}
          {...listeners}
        >
          <ArrowUpDown />
        </Button>
        <Field className="min-w-0" data-invalid={titleMissing}>
          <Input
            aria-invalid={titleMissing}
            className="h-10 min-w-0"
            disabled={readOnly}
            placeholder="Título"
            value={isTitleFocused ? concept.label : cleanConceptLabel}
            onBlur={handleTitleBlur}
            onChange={(event) => handleLinkedAwareUpdate({ label: event.target.value })}
            onFocus={() => setIsTitleFocused(true)}
          />
          {titleMissing ? <FieldError>Escribe un título para este campo.</FieldError> : null}
        </Field>
        {conceptType === "date" ? (
          <ValuationDateField
            allowClear
            className="h-10 min-w-0"
            display={concept.dateFormat ?? "normal"}
            readOnly={readOnly}
            value={effectiveConcept.value}
            onChange={(value) => handleLinkedAwareUpdate({ value })}
          />
        ) : conceptType === "longText" ? (
          <Textarea
            className="min-w-0"
            disabled={readOnly}
            placeholder="Dato"
            value={effectiveConcept.value}
            onChange={(event) => handleLinkedAwareUpdate({ value: event.target.value })}
          />
        ) : (
          <Input
            className="h-10 min-w-0"
            disabled={readOnly}
            inputMode={isNumericConcept(effectiveConcept) ? "decimal" : conceptType === "phone" ? "numeric" : undefined}
            placeholder="Dato"
            type={caratulaInputType(conceptType)}
            value={isNumericConcept(effectiveConcept) && isValueFocused ? effectiveConcept.value : formatCaratulaConceptValue(effectiveConcept)}
            onBlur={() => setIsValueFocused(false)}
            onChange={(event) => handleLinkedAwareUpdate({ value: normalizeCaratulaConceptValue(conceptType, event.target.value) })}
            onFocus={() => setIsValueFocused(true)}
          />
        )}
        <div className="flex shrink-0 items-center justify-end gap-1">
          <ConceptLinkStatus
            state={linkState}
            onChangeRelation={onChangeRelation ? (mode) => onChangeRelation(concept.id, mode) : undefined}
            onUnlink={onUnlink ? () => onUnlink(concept.id) : undefined}
          />
          <ConceptOptionsMenu
            concept={effectiveConcept}
            concepts={concepts}
            columnId={columnId}
            currentPresentation={currentPresentation}
            enableSpacingControl={enableLayoutControls}
            enableValueFormatControl={showValueFormatControl}
            enableWidthControl={enableLayoutControls}
            readOnly={readOnly}
            valueFormatReadOnly={formatIsSourceOwned}
            onRemove={onRemove}
            onUpdate={onUpdate}
            onColumnPresentationChange={onColumnPresentationChange}
          />
        </div>
      </div>
    );
  }

  const showValueFormatControl = enableLayoutControls && isNumericConcept(effectiveConcept);

  return (
    <div
      className={cn(
        "grid w-full min-w-0 gap-2 overflow-hidden",
        showTerrenoLengthHint && !usesSingleLineEditor
          ? "md:grid-cols-[auto_1fr_auto]"
          : "grid-cols-[auto_minmax(0,220px)_minmax(0,1fr)_auto] items-start",
      )}
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.35 : undefined }}
    >
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Mover concepto"
        className={cn(!dragEnabled && "invisible")}
        disabled={readOnly || !dragEnabled}
        title="Mover concepto"
        {...attributes}
        {...listeners}
      >
        <ArrowUpDown />
      </Button>
      {showTerrenoLengthHint && !usesSingleLineEditor ? (
        <div className="min-w-0 space-y-1">
          <Field data-invalid={titleMissing}>
            <Input
              aria-invalid={titleMissing}
              className="w-full"
              disabled={readOnly}
              value={isTitleFocused ? concept.label : cleanConceptLabel}
              onBlur={() => {
                setIsTitleFocused(false);
                if (titleMissing) {
                  onUpdate(concept.id, { label: UNTITLED_CARATULA_CONCEPT });
                  return;
                }
                if (cleanConceptLabel !== concept.label) onUpdate(concept.id, { label: cleanConceptLabel });
              }}
              onChange={(event) => onUpdate(concept.id, { label: event.target.value })}
              onFocus={() => setIsTitleFocused(true)}
            />
            {titleMissing ? <FieldError>Escribe un título para este campo.</FieldError> : null}
          </Field>
          <Textarea className="w-full" disabled={readOnly} value={effectiveConcept.value} onChange={(event) => onUpdate(concept.id, { value: event.target.value })} />
        </div>
      ) : (
        <>
          <Field className="min-w-0" data-invalid={titleMissing}>
            <Input
              aria-invalid={titleMissing}
              className="h-10 min-w-0"
              disabled={readOnly}
              value={isTitleFocused ? concept.label : cleanConceptLabel}
              onBlur={() => {
                setIsTitleFocused(false);
                if (titleMissing) {
                  onUpdate(concept.id, { label: UNTITLED_CARATULA_CONCEPT });
                  return;
                }
                if (cleanConceptLabel !== concept.label) onUpdate(concept.id, { label: cleanConceptLabel });
              }}
              onChange={(event) => onUpdate(concept.id, { label: event.target.value })}
              onFocus={() => setIsTitleFocused(true)}
            />
            {titleMissing ? <FieldError>Escribe un título para este campo.</FieldError> : null}
          </Field>
          {conceptType === "date" ? (
            <ValuationDateField
              allowClear
              className="h-10 min-w-0"
              display={concept.dateFormat ?? "normal"}
              readOnly={readOnly}
              value={effectiveConcept.value}
              onChange={(value) => onUpdate(concept.id, { value })}
            />
          ) : isNumericConcept(effectiveConcept) ? (
            <Input
              className="h-10 min-w-0"
              disabled={readOnly}
              inputMode="decimal"
              value={isValueFocused ? effectiveConcept.value : formatNumericConceptValue(effectiveConcept)}
              onBlur={() => setIsValueFocused(false)}
              onChange={(event) => onUpdate(concept.id, { value: normalizeNumericConceptInput(event.target.value) })}
              onFocus={() => setIsValueFocused(true)}
            />
          ) : usesSingleLineEditor ? (
            <Input
              className="h-10 min-w-0"
              disabled={readOnly}
              inputMode={conceptType === "phone" ? "numeric" : undefined}
              type={caratulaInputType(conceptType)}
              value={formatCaratulaConceptValue(effectiveConcept)}
              onChange={(event) => onUpdate(concept.id, { value: normalizeCaratulaConceptValue(conceptType, event.target.value) })}
            />
          ) : (
            <Textarea disabled={readOnly} value={effectiveConcept.value} onChange={(event) => onUpdate(concept.id, { value: event.target.value })} />
          )}
        </>
      )}
      <div className="flex shrink-0 items-start justify-end">
        <ConceptOptionsMenu
          concept={effectiveConcept}
          concepts={concepts}
          columnId={columnId}
          currentPresentation={currentPresentation}
          enableSpacingControl={enableLayoutControls}
          enableValueFormatControl={showValueFormatControl}
          enableWidthControl={enableLayoutControls || showTerrenoLengthHint}
          readOnly={readOnly}
          valueFormatReadOnly={formatIsSourceOwned}
          onMove={onMove}
          onRemove={onRemove}
          onUpdate={onUpdate}
          onColumnPresentationChange={onColumnPresentationChange}
        />
      </div>
      {showTerrenoLengthHint && isLongTerrenoConcept(concept) ? (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground/70 md:col-span-2 md:col-start-2">
          <LockKeyhole className="size-3" />
          Texto largo: ocupará el ancho completo en el reporte.
        </p>
      ) : null}
    </div>
  );
}

export function LongTextConceptEditor({
  concepts,
  label,
  onUpdate,
  readOnly,
}: {
  concepts: Concept[];
  label?: string;
  onUpdate: (conceptId: string, patch: Partial<Concept>) => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-3">
      {concepts.map((concept) => (
        <Field key={concept.id}>
          <FieldLabel>{label ?? concept.label}</FieldLabel>
          <Textarea
            className="min-h-36"
            disabled={readOnly}
            value={concept.value}
            onChange={(event) => onUpdate(concept.id, { value: event.target.value })}
          />
        </Field>
      ))}
    </div>
  );
}