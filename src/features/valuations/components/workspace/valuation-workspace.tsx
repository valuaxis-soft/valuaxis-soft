"use client";

import { useMemo, useState } from "react";

import { ReadOnlyValuationAlert } from "@/features/valuations/components/feedback/valuation-error-alert";
import { FormulaEditingProvider } from "@/features/valuations/components/editor/formula-editing";
import { CustomUnitsProvider } from "@/features/valuations/components/editor/custom-units-context";
import { NumberPresentationProvider } from "@/features/valuations/components/number-presentation-context";
import { documentNumberPresentation } from "@/features/valuations/services/number-presentation";
import { PagePresentationProvider } from "@/features/valuations/components/page-presentation-context";
import { documentPagePresentation } from "@/features/valuations/services/page-presentation";
import { AiAssistProvider } from "@/features/ai/ai-assist-context";
import { ValuationEditorPanel } from "@/features/valuations/components/workspace/valuation-editor-panel";
import type { SplitLayout, WorkspaceMode } from "@/features/valuations/components/workspace/valuation-workspace-layout";
import type { ExternalPreviewPayload } from "@/features/valuations/components/workspace/external-preview-sync";
import { ValuationPreviewPanel } from "@/features/valuations/components/workspace/valuation-preview-panel";
import { ValuationTopBar } from "@/features/valuations/components/workspace/valuation-top-bar";
import {
  ConcludeValuationDialog,
  ReopenValuationDialog,
} from "@/features/valuations/components/workspace/valuation-lifecycle-dialogs";
import {
  SessionExpiredDialog,
  UnsavedChangesExitDialog,
} from "@/features/valuations/components/workspace/valuation-workspace-dialogs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { AuthUser } from "@/features/auth/model";
import type { Letterhead } from "@/features/valuations/model";
import type { ValuationDetail } from "@/features/valuations/repositories/valuation.repository";
import { canEditProject, canExportProject, hasPermission } from "@/features/auth/permissions";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { isMachineryPropertyKind } from "@/features/valuations/calculation/machinery-types";
import { ConclusionPanel } from "@/features/valuations/components/calculation/conclusion-panel";
import { ConstructionTypesPanel } from "@/features/valuations/components/calculation/construction-types-panel";
import { CostCalculationPanel } from "@/features/valuations/components/calculation/cost-calculation-panel";
import { IncomeCalculationPanel } from "@/features/valuations/components/calculation/income-calculation-panel";
import { MachineryCostPanel, MachineryMarketPanel } from "@/features/valuations/components/calculation/machinery-calculation-panel";
import { MarketCalculationPanel } from "@/features/valuations/components/calculation/market-calculation-panel";
import { RENT_COMPARABLE_TYPES } from "@/features/valuations/calculation/market-types";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import { removeCustomSection, renameSection } from "@/features/valuations/services/section-edit-operations";
import { createCustomSection } from "./model/content-factories";
import { adjacentPreviewSectionId, previewSectionPosition } from "./model/preview-navigation";
import { flattenSectionConcepts, resolveSectionConceptsForDisplay } from "./model/section-content";
import { sectionIconMap } from "./model/section-icons";
import { sectionDisplayName } from "./model/section-numbering";
import { useBlockMutations } from "./hooks/use-block-mutations";
import { useCalculationDocumentSync } from "./hooks/use-calculation-document-sync";
import { useEditorState } from "./hooks/use-editor-state";
import { useExternalPreviewSync } from "./hooks/use-external-preview-sync";
import { useImageMutations } from "./hooks/use-image-mutations";
import { useSessionHeartbeat } from "./hooks/use-session-heartbeat";
import { useTableMutations } from "./hooks/use-table-mutations";
import { useValuationLifecycle } from "./hooks/use-valuation-lifecycle";
import { useValuationSave } from "./hooks/use-valuation-save";
import { useWorkspaceLayout } from "./hooks/use-workspace-layout";
import { StructureTransferProvider } from "./structure-transfer-context";
import { SaveAsTemplateDialog } from "./template-dialogs";

// Kept for existing imports of the section numbering helper.
export { resequenceSections } from "./model/section-numbering";

/**
 * Valuation editor workspace. Coordinates the editor state and its hooks
 * (history, save, images, lifecycle, external preview) and lays out the
 * top bar, editor and preview panels.
 */
export function ValuationWorkspace({
  currentUser,
  letterhead,
  valuationId: propValuationId,
  initialValuation,
  aiEnabled = false,
  customUnits = [],
}: {
  currentUser: AuthUser;
  letterhead: Letterhead;
  valuationId?: string | null;
  action?: string | null;
  initialValuation?: ValuationDetail | null;
  /** The installation has the AI assistance configured. */
  aiEnabled?: boolean;
  /** The firm's own units, offered in "Formato del valor". */
  customUnits?: string[];
}) {
  const router = useRouter();
  const {
    editorPanelRef,
    previewPanelRef,
    setSplitLayout,
    setWorkspaceMode,
    splitLayout,
    workspaceComposition,
    workspaceMode,
  } = useWorkspaceLayout();
  const handleWorkspaceModeChange = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
  };

  const valuationId = propValuationId || null;
  // A concluded valuation is read-only until it is reopened.
  const locked = initialValuation?.locked ?? false;
  const canEdit = canEditProject(currentUser) && !locked;
  const canExport = canExportProject(currentUser);
  const canConclude = !locked && Boolean(valuationId) && hasPermission(currentUser, AUTH_PERMISSIONS.concludeValuations);
  const canReopen = locked && Boolean(valuationId) && hasPermission(currentUser, AUTH_PERMISSIONS.reopenValuations);

  const editor = useEditorState({ canEdit, initialValuation, valuationId });
  const {
    canRedo,
    canUndo,
    caratula,
    meta,
    redoEditorChange,
    saveStatus,
    sections,
    undoEditorChange,
    updateCaratula,
    updateMeta,
    updateSection,
    updateSections,
  } = editor;
  const [activeSectionId, setActiveSectionId] = useState(
    initialValuation?.sections?.[0]?.id || "caratula",
  );
  // The section the preview shows when the appraiser browses away from the
  // active one; null while it follows the editor's active section.
  const [previewSectionId, setPreviewSectionId] = useState<string | null>(null);
  const handleActiveSectionChange = (sectionId: string) => {
    setActiveSectionId(sectionId);
    setPreviewSectionId(null);
  };

  const {
    exitDialogOpen,
    exitWithoutSaving,
    handleExit,
    handleSave,
    handleSaveAndExit,
    hasUnsavedChanges,
    saving,
    sessionExpiredOpen,
    setExitDialogOpen,
    setSessionExpiredOpen,
  } = useValuationSave({ canEdit, editor, setActiveSectionId, valuationId });
  const openSessionExpired = () => setSessionExpiredOpen(true);
  useSessionHeartbeat({ hasUnsavedChanges, onSessionExpired: openSessionExpired });

  const images = useImageMutations({ ...editor, canEdit, valuationId });
  const { documentHeaderImage, principalCoverImage } = images;

  const enabledSections = sections;
  const rawActiveSection =
    enabledSections.find((section) => section.id === activeSectionId) ?? enabledSections[0];
  const allConceptsForDisplay = useMemo(() => flattenSectionConcepts(sections), [sections]);
  const activeSection = useMemo(
    () => resolveSectionConceptsForDisplay(rawActiveSection, allConceptsForDisplay),
    [allConceptsForDisplay, rawActiveSection],
  );
  // What the preview shows: the section browsed to, or the active one.
  const rawPreviewSection =
    (previewSectionId ? enabledSections.find((section) => section.id === previewSectionId) : undefined) ?? rawActiveSection;
  const previewSection = useMemo(
    () => (rawPreviewSection === rawActiveSection ? activeSection : resolveSectionConceptsForDisplay(rawPreviewSection, allConceptsForDisplay)),
    [activeSection, allConceptsForDisplay, rawActiveSection, rawPreviewSection],
  );
  const browsePreview = (direction: -1 | 1) => {
    const next = adjacentPreviewSectionId(enabledSections, previewSection.id, direction);
    if (next) setPreviewSectionId(next);
  };
  const previewNavigation = {
    label: sectionDisplayName(previewSection),
    position: previewSectionPosition(enabledSections, previewSection.id),
    canPrevious: adjacentPreviewSectionId(enabledSections, previewSection.id, -1) !== null,
    canNext: adjacentPreviewSectionId(enabledSections, previewSection.id, 1) !== null,
    onPrevious: () => browsePreview(-1),
    onNext: () => browsePreview(1),
  };
  // One choice for the whole document: the editor, the preview and the external window write numbers the same way.
  const numberPresentation = useMemo(() => documentNumberPresentation(sections), [sections]);
  const pagePresentationChoice = documentPagePresentation(sections);
  // Kept by value: a new object on every edit would repaint every page of the preview.
  const pagePresentation = useMemo(
    () => ({ bindingMargin: pagePresentationChoice.bindingMargin, titleBars: pagePresentationChoice.titleBars }),
    [pagePresentationChoice.bindingMargin, pagePresentationChoice.titleBars],
  );
  const externalPreviewPayload = useMemo<ExternalPreviewPayload>(() => ({
    activeSection: previewSection,
    caratula,
    letterhead,
    documentHeaderImage,
    meta,
    principalCoverImage,
    numberPresentation,
    pagePresentation,
  }), [
    previewSection,
    caratula,
    letterhead,
    documentHeaderImage,
    meta,
    numberPresentation,
    pagePresentation,
    principalCoverImage,
  ]);

  // Sections of the appraiser's own: added at the end of the strip, renamed from the tab, removed from the editor.
  const addSection = () => {
    const section = createCustomSection();
    updateSections((current) => [...current, section]);
    handleActiveSectionChange(section.id);
  };
  const handleRenameSection = (sectionId: string, title: string) => {
    updateSections((current) => renameSection(current, sectionId, title));
  };
  const handleRemoveSection = (sectionId: string) => {
    updateSections((current) => removeCustomSection(current, sectionId));
    if (activeSectionId === sectionId) handleActiveSectionChange(enabledSections[0]?.id ?? "caratula");
  };
  const { openExternalPreviewWindow } = useExternalPreviewSync({
    payload: externalPreviewPayload,
    splitLayout,
    valuationId,
    workspaceMode,
  });
  const handleSplitLayoutChange = (layout: SplitLayout) => {
    setSplitLayout(layout);
    if (layout === "external") {
      openExternalPreviewWindow();
    }
  };

  const {
    concludeOpen,
    handleConclude,
    handleReopen,
    lifecyclePending,
    reopenOpen,
    setConcludeOpen,
    setReopenOpen,
  } = useValuationLifecycle({ handleSave, hasUnsavedChanges, onSessionExpired: openSessionExpired, valuationId });

  const blocks = useBlockMutations(editor);
  const tables = useTableMutations(editor);
  // A machinery valuation captures its cost and market approaches with the panels of the MEH format.
  const machinery = isMachineryPropertyKind(initialValuation?.propertyKind);
  const calculationSync = useCalculationDocumentSync({ ...editor, canEdit, machinery, valuationId });

  // A template is made from what is saved, so pending changes are saved first.
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const saveBeforeTemplate = async () => !hasUnsavedChanges || (await handleSave());

  // The dictamen renders what is saved, so pending changes are saved first.
  const handleExportPdf = async () => {
    if (!valuationId) return;
    if (hasUnsavedChanges && !(await handleSave())) return;
    router.push(`/avaluos/${valuationId}/dictamen`);
  };

  const editorPanel = (
    <>
      {enabledSections.map((section) => (
        <TabsContent value={section.id} key={section.id}>
          <ValuationEditorPanel
            section={section}
            calculationPanel={!valuationId ? undefined : machinery && getCanonicalSectionKey(section.id) === "COSTOS" ? (
              <MachineryCostPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onMachineryCalculation} />
            ) : machinery && getCanonicalSectionKey(section.id) === "MERCADO_VENTA" ? (
              <MachineryMarketPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onMachineryCalculation} />
            ) : getCanonicalSectionKey(section.id) === "MERCADO_VENTA" ? (
              <MarketCalculationPanel
                valuationId={valuationId}
                readOnly={!canEdit}
                suggestedSubjectArea={calculationSync.suggestedSubjectArea}
                onCalculation={calculationSync.onMarketCalculation}
              />
            ) : getCanonicalSectionKey(section.id) === "COSTOS" ? (
              <CostCalculationPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onCostCalculation} />
            ) : !machinery && getCanonicalSectionKey(section.id) === "CONSTRUCCION" ? (
              <ConstructionTypesPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onConstructionTypes} />
            ) : getCanonicalSectionKey(section.id) === "MERCADO_RENTAS" ? (
              <MarketCalculationPanel
                valuationId={valuationId}
                types={RENT_COMPARABLE_TYPES}
                readOnly={!canEdit}
                suggestedSubjectArea={null}
                onCalculation={calculationSync.onMarketCalculation}
              />
            ) : getCanonicalSectionKey(section.id) === "INGRESOS" ? (
              <IncomeCalculationPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onIncomeCalculation} />
            ) : getCanonicalSectionKey(section.id) === "CONCLUSIONES" ? (
              <ConclusionPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onConclusionCalculation} />
            ) : undefined}
            allSections={enabledSections}
            readOnly={!canEdit}
            onAddBlock={blocks.addBlock}
            onAddConcept={blocks.addConcept}
            onAddConceptFromExisting={blocks.addConceptFromExisting}
            onAddImage={images.addImage}
            onAddApartado={blocks.addApartado}
            onAddSubConcept={blocks.addSubConcept}
            onAddTable={tables.addTable}
            onAddHomologationTable={tables.addHomologationTable}
            onAddTableColumn={tables.addTableColumn}
            onAddTableRow={tables.addTableRow}
            onBlockDragEnd={blocks.onBlockDragEnd}
            onMoveBlock={blocks.moveBlock}
            onRemoveBlock={blocks.removeBlock}
            onRemoveConcept={blocks.removeConcept}
            onRemoveImage={images.removeImage}
            onRemoveApartado={blocks.removeApartado}
            onRemoveSection={handleRemoveSection}
            onRemoveSubConcept={blocks.removeSubConcept}
            onRemoveTable={tables.removeTable}
            onUpdateBlock={blocks.updateBlock}
            onUpdateSection={updateSection}
            onUpdateConcept={blocks.updateConcept}
            onUpdateConceptEverywhere={blocks.updateConceptEverywhere}
            onEditConceptOnlyHere={blocks.editConceptOnlyHere}
            onChangeConceptRelation={blocks.changeConceptRelation}
            onUnlinkConcept={blocks.unlinkConceptEverywhere}
            onUpdateImage={images.updateImage}
            onUpdateApartado={blocks.updateApartado}
            onUpdateSubConcept={blocks.updateSubConcept}
            onUpdateTable={tables.updateTable}
            caratula={caratula}
            meta={meta}
            onUpdateCaratula={updateCaratula}
            onUpdateMeta={updateMeta}
            documentHeaderImage={documentHeaderImage}
            documentHeaderImageUploading={images.uploadingDocumentHeaderImage}
            onDocumentHeaderImageRemove={images.removeDocumentHeaderImage}
            onDocumentHeaderImageUpload={images.handleDocumentHeaderImageUpload}
            principalCoverImage={principalCoverImage}
            principalCoverImageAvailable={Boolean(valuationId)}
            principalCoverImageUploading={images.uploadingCoverImage}
            onPrincipalCoverImageUpload={images.handlePrincipalCoverImageUpload}
          />
        </TabsContent>
      ))}
    </>
  );

  const previewPanel = (
    <ValuationPreviewPanel
      activeSection={previewSection}
      caratula={caratula}
      letterhead={letterhead}
      meta={meta}
      navigation={previewNavigation}
      principalCoverImage={principalCoverImage}
      documentHeaderImage={documentHeaderImage}
    />
  );

  return (
    <AiAssistProvider enabled={aiEnabled && canEdit} valuationId={valuationId}>
    <FormulaEditingProvider sections={sections}>
    <NumberPresentationProvider presentation={numberPresentation}>
    <PagePresentationProvider presentation={pagePresentation}>
    <CustomUnitsProvider initialUnits={customUnits}>
    <StructureTransferProvider sections={sections} readOnly={!canEdit} updateSections={updateSections} valuationId={valuationId}>
    <Tabs value={activeSection.id} onValueChange={handleActiveSectionChange} className="gap-0 h-full">
      <main className="min-h-0 bg-muted/40 text-foreground flex flex-col h-full overflow-hidden">
      <section className="shrink-0 border-b bg-background">
        <div className="mx-auto grid max-w-[1760px] grid-cols-1 gap-3 overflow-hidden px-3 py-3 sm:px-4 lg:gap-4 lg:px-6 lg:py-4">
          <ValuationTopBar
            activeSectionId={activeSection.id}
            canEdit={canEdit}
            lifecycleAction={
              canConclude
                ? { kind: "conclude", onClick: () => setConcludeOpen(true), disabled: saving || lifecyclePending }
                : canReopen
                  ? { kind: "reopen", onClick: () => setReopenOpen(true), disabled: lifecyclePending }
                  : null
            }
            canExport={canExport}
            enabledSections={enabledSections}
            iconMap={sectionIconMap}
            meta={meta}
            onAddSection={addSection}
            onExport={handleExportPdf}
            onExit={handleExit}
            onRenameSection={handleRenameSection}
            onReorderSections={(next) => updateSections(() => next)}
            onRedo={redoEditorChange}
            onSave={() => void handleSave()}
            onSaveAsTemplate={valuationId && canEdit ? () => setTemplateDialogOpen(true) : undefined}
            onSplitLayoutChange={handleSplitLayoutChange}
            onUndo={undoEditorChange}
            onWorkspaceModeChange={handleWorkspaceModeChange}
            readOnly={!canEdit}
            redoAvailable={canRedo}
            saveStatus={saveStatus}
            saving={saving}
            splitLayout={splitLayout}
            undoAvailable={canUndo}
            valuationId={valuationId}
            workspaceMode={workspaceMode}
          />

          {!canEdit ? <ReadOnlyValuationAlert reason={locked ? "concluded" : "role"} /> : null}
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1760px] p-2 sm:p-4 min-h-0 flex-1">
        {workspaceComposition.showEditor && !workspaceComposition.showPreview ? (
          <div id="valuation-form" className="h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain pb-4">
            {editorPanel}
          </div>
        ) : workspaceComposition.showPreview && !workspaceComposition.showEditor ? (
          <div id="valuation-preview" className="h-full min-h-0 min-w-0 overflow-hidden pb-4">
            {previewPanel}
          </div>
        ) : (
          // Only reachable on desktop: below lg the mode resolves to one pane.
          <ResizablePanelGroup
            orientation={splitLayout === "vertical" ? "horizontal" : "vertical"}
            className="h-full min-h-0 items-stretch"
          >
            {workspaceComposition.showPreview ? (
              <ResizablePanel
                id="valuation-preview"
                panelRef={previewPanelRef}
                defaultSize={splitLayout === "vertical" ? "50%" : "42%"}
                minSize="25%"
                maxSize="75%"
              >
                <div id="valuation-preview" className="h-full min-h-0 min-w-0 overflow-hidden pb-3">
                  {previewPanel}
                </div>
              </ResizablePanel>
            ) : null}
            {workspaceComposition.showSplitter ? (
              <ResizableHandle
                withHandle
                className={splitLayout === "vertical" ? "mx-1" : "my-1 w-full"}
              />
            ) : null}
            {workspaceComposition.showEditor ? (
              <ResizablePanel
                id="valuation-editor"
                panelRef={editorPanelRef}
                defaultSize={splitLayout === "vertical" ? "50%" : "58%"}
                minSize="25%"
                maxSize="75%"
              >
                <div
                  id="valuation-form"
                  className={cn(
                    "h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain pb-4",
                    splitLayout === "vertical" ? "pl-3" : "pt-3",
                  )}
                >
                  {editorPanel}
                </div>
              </ResizablePanel>
            ) : null}
          </ResizablePanelGroup>
        )}
      </div>
      <ConcludeValuationDialog
        open={concludeOpen}
        onOpenChange={setConcludeOpen}
        onConfirm={() => void handleConclude()}
        pending={lifecyclePending || saving}
        hasUnsavedChanges={hasUnsavedChanges}
      />
      <ReopenValuationDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        onConfirm={(reason) => void handleReopen(reason)}
        pending={lifecyclePending}
      />
      <SessionExpiredDialog
        open={sessionExpiredOpen}
        onOpenChange={setSessionExpiredOpen}
        onSave={() => void handleSave()}
        saving={saving}
      />
      <UnsavedChangesExitDialog
        open={exitDialogOpen}
        onOpenChange={setExitDialogOpen}
        onExitWithoutSaving={exitWithoutSaving}
        onSaveAndExit={handleSaveAndExit}
        saving={saving}
      />
      {valuationId && canEdit ? (
        <SaveAsTemplateDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          valuationId={valuationId}
          saveFirst={saveBeforeTemplate}
        />
      ) : null}
      </main>
    </Tabs>
    </StructureTransferProvider>
    </CustomUnitsProvider>
    </PagePresentationProvider>
    </NumberPresentationProvider>
    </FormulaEditingProvider>
    </AiAssistProvider>
  );
}
