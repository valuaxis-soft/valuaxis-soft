"use client";

import type React from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Columns2,
  FileDown,
  FileText,
  MonitorUp,
  Redo2,
  Rows2,
  Save,
  TextInitial,
  Undo2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { AppSection } from "@/features/valuations/model";
import { ValuationNavigation } from "@/features/valuations/components/workspace/valuation-navigation";
import type { ValuationMeta } from "@/features/valuations/services/valuation-constants";
import type { SaveStatus } from "@/features/valuations/components/feedback/save-status-indicator";
import type { SplitLayout, WorkspaceMode } from "@/features/valuations/components/workspace/valuation-workspace-layout";
import { cn } from "@/lib/utils";

const workspaceModes: Array<{
  icon: LucideIcon;
  label: string;
  value: WorkspaceMode;
}> = [
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

const splitLayouts: Array<{
  icon: LucideIcon;
  label: string;
  value: SplitLayout;
}> = [
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

export function ValuationTopBar({
  activeSectionId,
  canEdit,
  canExport,
  enabledSections,
  iconMap,
  meta,
  onExport,
  onExit,
  onReorderSections,
  onRedo,
  onSave,
  onSplitLayoutChange = () => undefined,
  onUndo,
  onWorkspaceModeChange,
  readOnly,
  redoAvailable,
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
  meta: ValuationMeta;
  onExport: () => void;
  onExit: () => void;
  onReorderSections: (nextSections: AppSection[]) => void;
  onRedo: () => void;
  onSave: () => void;
  onSplitLayoutChange?: (layout: SplitLayout) => void;
  onUndo: () => void;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  readOnly: boolean;
  redoAvailable: boolean;
  saving: boolean;
  saveStatus: SaveStatus;
  splitLayout?: SplitLayout;
  undoAvailable: boolean;
  valuationId: string | null;
  workspaceMode: WorkspaceMode;
}) {
  const hasPendingChanges =
    saveStatus === "dirty" || saveStatus === "error";

  const selectedWorkspaceMode =
    workspaceModes.find((mode) => mode.value === workspaceMode) ??
    workspaceModes[0];

  const SelectedWorkspaceIcon = selectedWorkspaceMode.icon;

  const otherWorkspaceModes = workspaceModes.filter(
    (mode) => mode.value !== workspaceMode,
  );

  // Prevent browsers such as Firefox from restoring stale dynamic disabled
  // state across reloads before React hydration.
  type BrowserRestorationButtonProps =
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      autoComplete?: string;
    };
  const browserStateRestorationProps: BrowserRestorationButtonProps = {
    autoComplete: "off",
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center min-[1440px]:relative min-[1440px]:justify-between">
      <div className="flex shrink-0 items-center gap-3">
        <Button
          type="button"
          size="icon-lg"
          aria-label="Volver al dashboard"
          onClick={onExit}
        >
          <ArrowLeft />
        </Button>

        <Badge
          variant="secondary"
          className="h-9 rounded-full px-4 text-sm font-semibold"
        >
          {meta.folio}
        </Badge>

        <div className="flex flex-none items-center gap-2 pl-1">
          <div
            aria-label="Modo de vista del espacio de trabajo"
            className="group/view-mode relative flex h-9 w-9 items-center justify-center rounded-md border bg-background transition-[width] duration-200 hover:w-28 focus-within:w-28"
            role="radiogroup"
          >
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-checked="true"
              aria-label={selectedWorkspaceMode.label}
              title={selectedWorkspaceMode.label}
              className="absolute left-1/2 z-10 -translate-x-1/2"
              role="radio"
              onClick={() =>
                onWorkspaceModeChange(selectedWorkspaceMode.value)
              }
            >
              <SelectedWorkspaceIcon />
            </Button>

            {otherWorkspaceModes.map((mode, index) => {
              const Icon = mode.icon;

              return (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-checked="false"
                  aria-label={mode.label}
                  title={mode.label}
                  className={cn(
                    "absolute opacity-0 transition duration-200 group-hover/view-mode:opacity-100 group-focus-within/view-mode:opacity-100",
                    index === 0
                      ? "left-0 -translate-x-2 group-hover/view-mode:translate-x-0 group-focus-within/view-mode:translate-x-0"
                      : "right-0 translate-x-2 group-hover/view-mode:translate-x-0 group-focus-within/view-mode:translate-x-0",
                  )}
                  key={mode.value}
                  role="radio"
                  onClick={() => onWorkspaceModeChange(mode.value)}
                >
                  <Icon />
                </Button>
              );
            })}
          </div>

          {workspaceMode === "split" ? (
            <div
              aria-label="Diseño de formulario y vista"
              className="flex h-9 items-center gap-1 rounded-md border bg-background p-1"
              role="radiogroup"
            >
              {splitLayouts.map((layout) => {
                const Icon = layout.icon;
                const selected = layout.value === splitLayout;

                return (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={selected ? "secondary" : "ghost"}
                    aria-checked={selected}
                    aria-label={layout.label}
                    title={layout.label}
                    key={layout.value}
                    role="radio"
                    onClick={() => onSplitLayoutChange(layout.value)}
                  >
                    <Icon />
                  </Button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex flex-none items-center gap-2">
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
      </div>

      <ValuationNavigation
        activeSectionId={activeSectionId}
        enabledSections={enabledSections}
        iconMap={iconMap}
        onReorder={onReorderSections}
        readOnly={readOnly}
      />

      <div className="flex flex-none flex-nowrap items-center justify-end gap-2">

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

        <Button
          type="button"
          disabled={!canExport || !valuationId}
          onClick={onExport}
          className="flex-none whitespace-nowrap"
        >
          <FileDown data-icon="inline-start" />
          Generar avalúo
        </Button>
      </div>
    </div>
  );
}
