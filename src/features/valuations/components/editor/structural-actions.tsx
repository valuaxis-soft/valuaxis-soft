"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, TextAlignStart , Eye, EyeOff, FilePlus2, LayoutList, Trash2 } from "lucide-react";
import type { ConceptPresentation } from "@/features/valuations/services/concept-presentation";
import { MIN_OFFSET_PX, MAX_OFFSET_PX } from "@/features/valuations/services/concept-presentation";
import type { ApartadoPresentationMode } from "@/features/valuations/model";

function PageBreakToggle({
  disabled = false,
  itemLabel = "sección",
  onChange,
  value,
}: {
  disabled?: boolean;
  itemLabel?: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  const label = value
    ? `Continuar ${itemLabel} de forma consecutiva`
    : `Iniciar ${itemLabel} en nueva página`;

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(value && "border-primary/50 bg-primary/10 text-primary")}
      onClick={() => onChange(!value)}
    >
      <FilePlus2 />
    </Button>
  );
}

function VisibilityToggle({
  disabled = false,
  itemLabel = "elemento",
  onChange,
  visible,
}: {
  disabled?: boolean;
  itemLabel?: string;
  onChange: (visible: boolean) => void;
  visible: boolean;
}) {
  const action = visible ? "Ocultar" : "Mostrar";
  const label = `${action} ${itemLabel}`;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!visible)}
    >
      {visible ? <EyeOff /> : <Eye />}
      {action}
    </Button>
  );
}

function MoveControls({
  canMoveDown,
  canMoveUp,
  disabled = false,
  itemLabel = "elemento",
  onMoveDown,
  onMoveUp,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  disabled?: boolean;
  itemLabel?: string;
  onMoveDown: () => void;
  onMoveUp: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label={`Mover ${itemLabel} arriba`}
        title={`Mover ${itemLabel} arriba`}
        disabled={disabled || !canMoveUp}
        onClick={onMoveUp}
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label={`Mover ${itemLabel} abajo`}
        title={`Mover ${itemLabel} abajo`}
        disabled={disabled || !canMoveDown}
        onClick={onMoveDown}
      >
        <ChevronDown />
      </Button>
    </>
  );
}

function DeleteAction({
  disabled = false,
  itemLabel = "elemento",
  onDelete,
  size = "icon-sm",
}: {
  disabled?: boolean;
  itemLabel?: string;
  onDelete: () => void;
  size?: "icon" | "icon-sm";
}) {
  const label = `Eliminar ${itemLabel}`;

  return (
    <Button
      type="button"
      size={size}
      variant="ghost"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onDelete}
    >
      <Trash2 />
    </Button>
  );
}

function ConceptPresentationControl({
  conceptPresentation,
  disabled = false,
  onChange,
  onResetAll,
}: {
  conceptPresentation?: ConceptPresentation;
  disabled?: boolean;
  onChange: (next: ConceptPresentation | undefined) => void;
  onResetAll?: () => void;
}) {
  const isCustom = conceptPresentation?.mode === "custom";
  const currentOffset = conceptPresentation?.labelGuideOffsetPx ?? 0;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Alineación de conceptos"
            title="Alineación de conceptos"
            disabled={disabled}
          >
            <TextAlignStart/>
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56 p-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Alineación de conceptos</p>
          <Button
            type="button"
            size="sm"
            variant={isCustom ? "outline" : "default"}
            className="w-full justify-start text-xs"
            disabled={disabled}
            onClick={() => onChange(undefined)}
          >
            Predeterminada
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isCustom ? "default" : "outline"}
            className="w-full justify-start text-xs"
            disabled={disabled}
            onClick={() => onChange({ mode: "custom", labelGuideOffsetPx: 0 })}
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
                  onChange({ mode: "custom", labelGuideOffsetPx: val });
                }}
              />
            </div>
          )}
          {onResetAll ? (
            <>
              <div className="border-t pt-2" />
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ApartadoPresentationModeControl({
  presentationMode,
  disabled = false,
  onChange,
}: {
  presentationMode?: ApartadoPresentationMode;
  disabled?: boolean;
  onChange: (next: ApartadoPresentationMode | undefined) => void;
}) {
  const isTechnical = presentationMode === "technical-list";

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Diseño del apartado"
            title="Diseño del apartado"
            disabled={disabled}
          >
            <LayoutList />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-48 p-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Diseño del apartado</p>
          <Button
            type="button"
            size="sm"
            variant={!isTechnical ? "default" : "outline"}
            className="w-full justify-start text-xs"
            disabled={disabled}
            onClick={() => onChange(undefined)}
          >
            Normal
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isTechnical ? "default" : "outline"}
            className="w-full justify-start text-xs"
            disabled={disabled}
            onClick={() => onChange("technical-list")}
          >
            Lista técnica
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function StructuralActions({
  conceptPresentation,
  deleteAction,
  disabled = false,
  itemLabel,
  move,
  onConceptPresentationChange,
  onPresentationModeChange,
  onResetConceptPresentations,
  pageBreak,
  presentationMode,
  visibility,
}: {
  conceptPresentation?: ConceptPresentation;
  deleteAction?: {
    onDelete: () => void;
    size?: "icon" | "icon-sm";
  };
  disabled?: boolean;
  itemLabel: string;
  move?: {
    canMoveDown: boolean;
    canMoveUp: boolean;
    onMoveDown: () => void;
    onMoveUp: () => void;
  };
  onConceptPresentationChange?: (next: ConceptPresentation | undefined) => void;
  onPresentationModeChange?: (next: ApartadoPresentationMode | undefined) => void;
  onResetConceptPresentations?: () => void;
  pageBreak?: {
    onChange: (value: boolean) => void;
    value: boolean;
  };
  presentationMode?: ApartadoPresentationMode;
  visibility?: {
    onChange: (visible: boolean) => void;
    visible: boolean;
  };
}) {
  return (
    <>
      {move ? (
        <MoveControls
          canMoveUp={move.canMoveUp}
          canMoveDown={move.canMoveDown}
          disabled={disabled}
          itemLabel={itemLabel}
          onMoveUp={move.onMoveUp}
          onMoveDown={move.onMoveDown}
        />
      ) : null}
      {visibility ? (
        <VisibilityToggle
          visible={visibility.visible}
          disabled={disabled}
          itemLabel={itemLabel}
          onChange={visibility.onChange}
        />
      ) : null}
      {pageBreak ? (
        <PageBreakToggle
          value={pageBreak.value}
          disabled={disabled}
          itemLabel={itemLabel}
          onChange={pageBreak.onChange}
        />
      ) : null}
      {onConceptPresentationChange ? (
        <ConceptPresentationControl
          conceptPresentation={conceptPresentation}
          disabled={disabled}
          onChange={onConceptPresentationChange}
          onResetAll={onResetConceptPresentations}
        />
      ) : null}
      {onPresentationModeChange ? (
        <ApartadoPresentationModeControl
          presentationMode={presentationMode}
          disabled={disabled}
          onChange={onPresentationModeChange}
        />
      ) : null}
      {deleteAction ? (
        <DeleteAction
          itemLabel={itemLabel}
          size={deleteAction.size}
          onDelete={deleteAction.onDelete}
        />
      ) : null}
    </>
  );
}