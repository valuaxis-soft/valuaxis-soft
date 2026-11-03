"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { ArrowDownToLine, ChevronDown, ChevronUp, TextAlignStart , Eye, EyeOff, FilePlus2, LayoutList, SeparatorHorizontal, Trash2 } from "lucide-react";
import type { ConceptPresentation } from "@/features/valuations/services/concept-presentation";
import { MIN_OFFSET_PX, MAX_OFFSET_PX } from "@/features/valuations/services/concept-presentation";
import type { ApartadoPresentationMode } from "@/features/valuations/model";
import { PAGE_BREAK_LABELS, type PageBreakMode } from "@/features/valuations/services/document-structure";

const PAGE_BREAK_ICONS = { auto: SeparatorHorizontal, "new-page": FilePlus2, continue: ArrowDownToLine } as const;

/**
 * A control that does not apply to this item is shown disabled and says why
 * (the reason is its tooltip), so every toolbar offers the same controls.
 */
export type StructuralActionLocks = Partial<Record<"move" | "visibility" | "pageBreak" | "alignment" | "delete", string>>;

const PAGE_BREAK_HINTS: Record<PageBreakMode, string> = {
  auto: "Sigue al anterior; si su título y su primer contenido no caben, pasan juntos a la siguiente página.",
  "new-page": "Siempre empieza en una página nueva.",
  continue: "Empieza justo donde terminó el anterior, sin espacio: su título no se lleva a la página siguiente aunque su contenido continúe ahí.",
};

/** Where the block or apartado starts on the printed pages: three choices, the current one marked. */
function PageBreakControl({
  disabled = false,
  itemLabel = "sección",
  lock,
  onChange,
  value,
}: {
  disabled?: boolean;
  itemLabel?: string;
  lock?: string;
  onChange: (value: PageBreakMode) => void;
  value: PageBreakMode;
}) {
  const label = `Salto de página del ${itemLabel}: ${PAGE_BREAK_LABELS[value].toLowerCase()}`;
  return (
    <Popover>
      <PopoverTrigger
        render={
          // One icon for the control whatever its value (the stacked pages read as "copy"); the value tints it.
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={label}
            title={lock ?? label}
            disabled={disabled || Boolean(lock)}
            className={cn(value !== "auto" && "border-primary/50 bg-primary/10 text-primary")}
            data-page-break={value}
            data-structural-action="pageBreak"
          >
            <SeparatorHorizontal />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-2" role="radiogroup" aria-label={`Salto de página del ${itemLabel}`}>
          <p className="text-xs font-medium text-muted-foreground">Salto de página</p>
          {(["auto", "new-page", "continue"] as const).map((mode) => {
            const ModeIcon = PAGE_BREAK_ICONS[mode];
            return (
              <Button
                key={mode}
                type="button"
                size="sm"
                role="radio"
                aria-checked={value === mode}
                variant={value === mode ? "default" : "outline"}
                className="h-auto w-full flex-col items-start gap-0.5 py-1.5 text-left text-xs whitespace-normal"
                disabled={disabled}
                onClick={() => onChange(mode)}
              >
                <span className="flex items-center gap-1.5 font-medium"><ModeIcon className="size-3.5" />{PAGE_BREAK_LABELS[mode]}</span>
                <span className="font-normal opacity-80">{PAGE_BREAK_HINTS[mode]}</span>
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function VisibilityToggle({
  disabled = false,
  itemLabel = "elemento",
  lock,
  onChange,
  visible,
}: {
  disabled?: boolean;
  itemLabel?: string;
  lock?: string;
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
      title={lock ?? label}
      disabled={disabled || Boolean(lock)}
      data-structural-action="visibility"
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
  lock,
  onMoveDown,
  onMoveUp,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  disabled?: boolean;
  itemLabel?: string;
  lock?: string;
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
        title={lock ?? `Mover ${itemLabel} arriba`}
        disabled={disabled || Boolean(lock) || !canMoveUp}
        data-structural-action="move-up"
        onClick={onMoveUp}
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label={`Mover ${itemLabel} abajo`}
        title={lock ?? `Mover ${itemLabel} abajo`}
        disabled={disabled || Boolean(lock) || !canMoveDown}
        data-structural-action="move-down"
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
  lock,
  onDelete,
  size = "icon-sm",
}: {
  disabled?: boolean;
  itemLabel?: string;
  lock?: string;
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
      title={lock ?? label}
      disabled={disabled || Boolean(lock)}
      data-structural-action="delete"
      onClick={onDelete}
    >
      <Trash2 />
    </Button>
  );
}

function ConceptPresentationControl({
  conceptPresentation,
  disabled = false,
  lock,
  onChange,
  onResetAll,
}: {
  conceptPresentation?: ConceptPresentation;
  disabled?: boolean;
  lock?: string;
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
            title={lock ?? "Alineación de conceptos"}
            disabled={disabled || Boolean(lock)}
            data-structural-action="alignment"
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
            aria-label="Diseño del subbloque"
            title="Diseño del subbloque"
            disabled={disabled}
          >
            <LayoutList />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-48 p-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Diseño del subbloque</p>
          <Button
            type="button"
            size="sm"
            variant={!isTechnical ? "default" : "outline"}
            className="w-full justify-start text-xs"
            disabled={disabled}
            onClick={() => onChange(undefined)}
          >
            Normal: concepto y dato lado a lado
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isTechnical ? "default" : "outline"}
            className="w-full justify-start text-xs"
            disabled={disabled}
            onClick={() => onChange("technical-list")}
          >
            Lista de una columna
          </Button>
          <p className="text-[11px] leading-snug text-muted-foreground">
            En la lista cada concepto va con su dato en un renglón angosto, uno debajo de otro, como una ficha técnica. No cambia el tamaño de la letra.
          </p>
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
  locks = {},
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
  /** The controls that do not apply here, each with the reason shown in its tooltip. */
  locks?: StructuralActionLocks;
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
    onChange: (value: PageBreakMode) => void;
    value: PageBreakMode;
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
          lock={locks.move}
          onMoveUp={move.onMoveUp}
          onMoveDown={move.onMoveDown}
        />
      ) : null}
      {visibility ? (
        <VisibilityToggle
          visible={visibility.visible}
          disabled={disabled}
          itemLabel={itemLabel}
          lock={locks.visibility}
          onChange={visibility.onChange}
        />
      ) : null}
      {pageBreak ? (
        <PageBreakControl
          value={pageBreak.value}
          disabled={disabled}
          itemLabel={itemLabel}
          lock={locks.pageBreak}
          onChange={pageBreak.onChange}
        />
      ) : null}
      {onConceptPresentationChange ? (
        <ConceptPresentationControl
          conceptPresentation={conceptPresentation}
          disabled={disabled}
          lock={locks.alignment}
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
          disabled={disabled}
          itemLabel={itemLabel}
          lock={locks.delete}
          size={deleteAction.size}
          onDelete={deleteAction.onDelete}
        />
      ) : null}
    </>
  );
}