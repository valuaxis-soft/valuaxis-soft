"use client";

import type React from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Calculator,
  CircleCheck,
  Columns2,
  EllipsisVertical,
  Eye,
  FileDown,
  FileText,
  LayoutTemplate,
  MonitorUp,
  PencilLine,
  Redo2,
  RotateCcw,
  Rows2,
  Save,
  TextInitial,
  Undo2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppSection } from "@/features/valuations/model";
import { ValuationNavigation } from "@/features/valuations/components/workspace/valuation-navigation";
import type { ValuationMeta } from "@/features/valuations/services/valuation-constants";
import type { SaveStatus } from "@/features/valuations/components/feedback/save-status-indicator";
import {
  toCompactPane,
  type CompactPane,
  type SplitLayout,
  type WorkspaceMode,
} from "@/features/valuations/components/workspace/valuation-workspace-layout";
import {
  SegmentedControl,
  type SegmentedControlOption,
} from "@/features/valuations/components/workspace/segmented-control";
import { cn } from "@/lib/utils";

const workspaceModes: Array<SegmentedControlOption<WorkspaceMode>> = [
  {
    value: "form",
    label: "Solo formulario",
    icon: TextInitial,
  },
  {
    value: "split",
    label: "Formulario y vista",
    icon: Rows2,
  },
  {
    value: "preview",
    label: "Solo vista",
    icon: FileText,
  },
];

const splitLayouts: Array<SegmentedControlOption<SplitLayout>> = [
  {
    value: "horizontal",
    label: "Vista horizontal",
    icon: Rows2,
  },
  {
    value: "vertical",
    label: "Vista vertical",
    icon: Columns2,
  },
  {
    value: "external",
    label: "Vista en 2 pantallas",
    icon: MonitorUp,
  },
];

/** Below lg the editor and the preview are shown one at a time. */
const compactPanes: Array<SegmentedControlOption<CompactPane>> = [
  {
    value: "form",
    label: "Editar",
    icon: PencilLine,
  },
  {
    value: "preview",
    label: "Vista previa",
    icon: Eye,
  },
];

/** Conclude an open valuation, or reopen a concluded one. */
export type ValuationLifecycleAction = {
  kind: "conclude" | "reopen";
  onClick: () => void;
  disabled?: boolean;
};

export function ValuationTopBar({
  activeSectionId,
  canEdit,
  canExport,
  enabledSections,
  iconMap,
  lifecycleAction = null,
  meta,
  onAddSection,
  onCalculationMemory,
  onExport,
  onExit,
  onRemoveSection,
  onRenameSection,
  onReorderSections,
  onRestoreSection,
  onSelectSection,
  onRedo,
  onSave,
  onSaveAsTemplate,
  onSplitLayoutChange = () => undefined,
  onUndo,
  onWorkspaceModeChange,
  readOnly,
  redoAvailable,
  removedSections,
  saving,
  saveStatus,
  splitLayout = "horizontal",
  undoAvailable,
  valuationId,
  workspaceMode,
}: {
  activeSectionId: string;
  canEdit: boolean;
  canExport: boolean;
  enabledSections: AppSection[];
  iconMap: Record<string, LucideIcon>;
  lifecycleAction?: ValuationLifecycleAction | null;
  meta: ValuationMeta;
  onAddSection?: () => void;
  /** Opens the calculation memory (memoria de cálculo), beside the dictamen. */
  onCalculationMemory: () => void;
  onExport: () => void;
  onExit: () => void;
  onRemoveSection?: (sectionId: string) => void;
  onRenameSection?: (sectionId: string, title: string) => void;
  onReorderSections: (nextSections: AppSection[]) => void;
  onRestoreSection?: (sectionId: string) => void;
  onSelectSection?: (sectionId: string) => void;
  onRedo: () => void;
  onSave: () => void;
  /** "Guardar como plantilla"; absent for those who do not edit. */
  onSaveAsTemplate?: () => void;
  onSplitLayoutChange?: (layout: SplitLayout) => void;
  onUndo: () => void;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  readOnly: boolean;
  redoAvailable: boolean;
  /** Registry sections the appraiser deleted, offered to restore in the list of sections. */
  removedSections?: AppSection[];
  saving: boolean;
  saveStatus: SaveStatus;
  splitLayout?: SplitLayout;
  undoAvailable: boolean;
  valuationId: string | null;
  workspaceMode: WorkspaceMode;
}) {
  const hasPendingChanges =
    saveStatus === "dirty" || saveStatus === "error";

  // Prevent browsers such as Firefox from restoring stale dynamic disabled
  // state across reloads before React hydration.
  type BrowserRestorationButtonProps =
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      autoComplete?: string;
    };
  const browserStateRestorationProps: BrowserRestorationButtonProps = {
    autoComplete: "off",
  };

  const saveLabel = saving
    ? "Guardando..."
    : hasPendingChanges
      ? "Guardar cambios pendientes"
      : "Guardar cambios";

  return (
    <div className="flex min-w-0 flex-col gap-2 lg:gap-3 xl:flex-row xl:items-center">
      <div className="flex min-w-0 shrink-0 items-center gap-2 lg:gap-3">
        <Button
          type="button"
          size="icon-lg"
          aria-label="Volver al dashboard"
          title="Volver al dashboard"
          onClick={onExit}
          className="max-lg:size-10"
        >
          <ArrowLeft />
        </Button>

        <Badge
          variant="secondary"
          title={meta.folio}
          className="h-9 min-w-0 shrink rounded-full px-4 text-sm font-semibold max-lg:h-10 max-lg:px-3"
        >
          <span className="truncate">{meta.folio}</span>
        </Badge>

        {/* Desktop: view mode and split layout, always visible. */}
        <div className="hidden flex-none items-center gap-2 pl-1 lg:flex">
          <SegmentedControl
            aria-label="Modo de vista del espacio de trabajo"
            className="h-9 gap-1 p-1"
            labelClassName="sr-only"
            onValueChange={onWorkspaceModeChange}
            options={workspaceModes}
            segmentClassName="size-7 px-0"
            value={workspaceMode}
          />

          {workspaceMode === "split" ? (
            <SegmentedControl
              aria-label="Diseño de formulario y vista"
              className="h-9 gap-1 p-1"
              labelClassName="sr-only"
              onValueChange={onSplitLayoutChange}
              options={splitLayouts}
              segmentClassName="size-7 px-0"
              value={splitLayout}
            />
          ) : null}
        </div>

        <div className="hidden flex-none items-center gap-2 lg:flex">
          <button
            {...browserStateRestorationProps}
            type="button"
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
            aria-label="Deshacer"
            title="Deshacer"
            disabled={!canEdit || !undoAvailable}
            onClick={onUndo}
          >
            <Undo2 />
          </button>

          <button
            {...browserStateRestorationProps}
            type="button"
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
            aria-label="Rehacer"
            title="Rehacer"
            disabled={!canEdit || !redoAvailable}
            onClick={onRedo}
          >
            <Redo2 />
          </button>
        </div>

        {/* Below lg: one pane at a time, Guardar and an overflow menu. */}
        <div className="ml-auto flex flex-none items-center gap-2 lg:hidden">
          <SegmentedControl
            aria-label="Vista del avalúo"
            labelClassName="sr-only sm:not-sr-only"
            onValueChange={onWorkspaceModeChange}
            options={compactPanes}
            segmentClassName="h-10 min-w-10 px-0 sm:px-3"
            value={toCompactPane(workspaceMode)}
          />

          <Button
            type="button"
            variant={hasPendingChanges ? "default" : "outline"}
            disabled={!canEdit || saving}
            onClick={onSave}
            aria-label={saveLabel}
            title={saveLabel}
            className={cn(
              "h-10 min-w-10 flex-none px-0 sm:px-3",
              hasPendingChanges &&
                "border-amber-600 bg-amber-600 text-white hover:bg-amber-700",
            )}
          >
            <Save />
            <span className="hidden sm:inline">
              {saving ? "Guardando..." : "Guardar"}
            </span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Más acciones"
                  title="Más acciones"
                  className="size-10"
                >
                  <EllipsisVertical />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                className="min-h-10"
                closeOnClick={false}
                disabled={!canEdit || !undoAvailable}
                onClick={onUndo}
              >
                <Undo2 />
                Deshacer
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-10"
                closeOnClick={false}
                disabled={!canEdit || !redoAvailable}
                onClick={onRedo}
              >
                <Redo2 />
                Rehacer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="min-h-10"
                disabled={!canExport || !valuationId}
                onClick={onExport}
              >
                <FileDown />
                Generar avalúo
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-10"
                disabled={!canExport || !valuationId}
                onClick={onCalculationMemory}
              >
                <Calculator />
                Memoria de cálculo
              </DropdownMenuItem>
              {onSaveAsTemplate ? (
                <DropdownMenuItem className="min-h-10" onClick={onSaveAsTemplate}>
                  <LayoutTemplate />
                  Guardar como plantilla
                </DropdownMenuItem>
              ) : null}
              {lifecycleAction ? <DropdownMenuSeparator /> : null}
              {lifecycleAction ? (
                <DropdownMenuItem
                  className="min-h-10"
                  disabled={lifecycleAction.disabled}
                  onClick={lifecycleAction.onClick}
                >
                  {lifecycleAction.kind === "conclude" ? (
                    <>
                      <CircleCheck />
                      Concluir
                    </>
                  ) : (
                    <>
                      <RotateCcw />
                      Reabrir
                    </>
                  )}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ValuationNavigation
        activeSectionId={activeSectionId}
        enabledSections={enabledSections}
        iconMap={iconMap}
        onAddSection={onAddSection}
        onRemoveSection={onRemoveSection}
        onRenameSection={onRenameSection}
        onReorder={onReorderSections}
        onRestoreSection={onRestoreSection}
        onSelectSection={onSelectSection}
        readOnly={readOnly}
        removedSections={removedSections}
      />

      <div className="hidden flex-none flex-nowrap items-center justify-end gap-2 lg:flex">
        <Button
          type="button"
          variant={hasPendingChanges ? "default" : "outline"}
          disabled={!canEdit || saving}
          onClick={onSave}
          className={cn(
            "flex-none whitespace-nowrap",
            hasPendingChanges &&
              "group/save min-w-38 border-amber-600 bg-amber-600 text-white hover:bg-amber-700",
          )}
        >
          <Save data-icon="inline-start" />

          {saving ? (
            "Guardando..."
          ) : hasPendingChanges ? (
            <>
              <span className="group-hover/save:hidden">
                Cambios pendientes
              </span>
              <span className="hidden group-hover/save:inline">
                Guardar cambios
              </span>
            </>
          ) : (
            "Guardar cambios"
          )}
        </Button>

        {onSaveAsTemplate ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Guardar como plantilla"
            title="Guardar como plantilla"
            onClick={onSaveAsTemplate}
            className="flex-none"
          >
            <LayoutTemplate />
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          disabled={!canExport || !valuationId}
          onClick={onCalculationMemory}
          className="flex-none whitespace-nowrap"
        >
          <Calculator data-icon="inline-start" />
          Memoria de cálculo
        </Button>

        <Button
          type="button"
          disabled={!canExport || !valuationId}
          onClick={onExport}
          className="flex-none whitespace-nowrap"
        >
          <FileDown data-icon="inline-start" />
          Generar avalúo
        </Button>

        {/* Concluir closes the valuation: at the far end, set apart from the strip's arrow and the
            other actions, so it is not pressed by mistake. It still asks before concluding. */}
        {lifecycleAction ? (
          <div className="ml-4 flex flex-none items-center border-l pl-4" data-lifecycle-action="">
            <Button
              type="button"
              variant="outline"
              disabled={lifecycleAction.disabled}
              onClick={lifecycleAction.onClick}
              className="flex-none whitespace-nowrap"
            >
              {lifecycleAction.kind === "conclude" ? (
                <>
                  <CircleCheck data-icon="inline-start" />
                  Concluir
                </>
              ) : (
                <>
                  <RotateCcw data-icon="inline-start" />
                  Reabrir
                </>
              )}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
