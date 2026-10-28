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
  RemoveSectionDialog,
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
import { canEditProject, canExportProject, canReviewComparables, hasPermission } from "@/features/auth/permissions";
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
import { StatisticalMethodsPanel } from "@/features/valuations/components/calculation/statistical-methods-panel";
import { RENT_COMPARABLE_TYPES } from "@/features/valuations/calculation/market-types";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import {
  canRemoveSection,
  listedSections,
  removeSection,
  renameSection,
  restoreSection,
  withListedOrder,
} from "@/features/valuations/services/section-edit-operations";
import { createCustomSection } from "./model/content-factories";
import { insertSectionByRole, type SectionDocumentRole } from "@/features/valuations/services/document-structure";
import { revealEditorFocus } from "./model/editor-focus-reveal";
import { adjacentPreviewSectionId, previewSectionPosition } from "./model/preview-navigation";
import { flattenSectionConcepts, resolveSectionConceptsForDisplay } from "./model/section-content";
import { sectionIconMap } from "./model/section-icons";
import { sectionDisplayName } from "./model/section-numbering";
import { useBlockMutations } from "./hooks/use-block-mutations";
import { useCalculationDocumentSync } from "./hooks/use-calculation-document-sync";
import { useEditorHistoryShortcuts, useEditorState, type AppliedHistoryStep } from "./hooks/use-editor-state";
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
  // Reviewing comparables is open to reviewers too, while the valuation is not concluded.
  const canReview = canReviewComparables(currentUser) && !locked;
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
    // Another section opens at its top: the editor's scroll used to stay where the last one was, near its end.
    if (sectionId !== activeSectionId) document.getElementById("valuation-form")?.scrollTo({ top: 0 });
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

  // The tab strip, the preview and the editor show every section but the deleted ones.
  const enabledSections = useMemo(() => listedSections(sections), [sections]);
  const removedSections = useMemo(() => sections.filter((section) => section.removed), [sections]);
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
    () => ({ bindingMargin: pagePresentationChoice.bindingMargin, titleBars: pagePresentationChoice.titleBars, titleBand: pagePresentationChoice.titleBand }),
    [pagePresentationChoice.bindingMargin, pagePresentationChoice.titleBars, pagePresentationChoice.titleBand],
  );
  const {
    label: navigationLabel,
    position: { index: navigationIndex, total: navigationTotal },
    canPrevious: navigationCanPrevious,
    canNext: navigationCanNext,
  } = previewNavigation;
  const externalPreviewPayload = useMemo<ExternalPreviewPayload>(() => ({
    activeSection: previewSection,
    caratula,
    letterhead,
    documentHeaderImage,
    meta,
    principalCoverImage,
    numberPresentation,
    pagePresentation,
    // The window browses the document too: it asks this editor for the previous or next section.
    navigation: {
      label: navigationLabel,
      position: { index: navigationIndex, total: navigationTotal },
      canPrevious: navigationCanPrevious,
      canNext: navigationCanNext,
    },
  }), [
    navigationLabel,
    navigationIndex,
    navigationTotal,
    navigationCanPrevious,
    navigationCanNext,
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
  // A chapter goes just before the conclusion, an annex at the end.
  const addSection = (role: SectionDocumentRole) => {
    const section = createCustomSection(role);
    updateSections((current) => insertSectionByRole(current, section, role));
    handleActiveSectionChange(section.id);
  };
  const handleRenameSection = (sectionId: string, title: string) => {
    updateSections((current) => renameSection(current, sectionId, title));
  };
  // Deleting asks first: the tab's trash can and the section header's button open the same dialog.
  // Any section but the required ones is deleted; a registry section can be restored from the list.
  const [removingSectionId, setRemovingSectionId] = useState<string | null>(null);
  const removingSection = sections.find((section) => section.id === removingSectionId && canRemoveSection(section) && !section.removed) ?? null;
  const handleRemoveSection = (sectionId: string) => {
    setRemovingSectionId(null);
    updateSections((current) => removeSection(current, sectionId));
    if (activeSectionId === sectionId) handleActiveSectionChange(enabledSections.find((section) => section.id !== sectionId)?.id ?? "caratula");
  };
  // An undo or a redo opens the section it changed and shows the change, lit for a moment.
  const revealHistoryStep = (step: AppliedHistoryStep | null) => {
    const focus = step?.focus;
    if (focus) {
      if (focus.sectionId !== activeSectionId && enabledSections.some((section) => section.id === focus.sectionId)) {
        handleActiveSectionChange(focus.sectionId);
      }
      revealEditorFocus(focus);
    }
    return step;
  };
  const undo = () => revealHistoryStep(undoEditorChange());
  const redo = () => revealHistoryStep(redoEditorChange());
  useEditorHistoryShortcuts({ canEdit, onUndo: undo, onRedo: redo });
  const handleRestoreSection = (sectionId: string) => {
    updateSections((current) => restoreSection(current, sectionId));
    handleActiveSectionChange(sectionId);
  };
  const { openExternalPreviewWindow } = useExternalPreviewSync({
    onNavigate: browsePreview,
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
  // So is the calculation memory, which reads the saved valuation too.
  const handleCalculationMemory = async () => {
    if (!valuationId) return;
    if (hasUnsavedChanges && !(await handleSave())) return;
    router.push(`/avaluos/${valuationId}/memoria-calculo`);
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
              <div className="grid gap-4">
                <MarketCalculationPanel
                  valuationId={valuationId}
                  readOnly={!canEdit}
                  canReview={canReview}
                  suggestedSubjectArea={calculationSync.suggestedSubjectArea}
                  onCalculation={calculationSync.onMarketCalculation}
                />
                <StatisticalMethodsPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onStatisticalCalculation} />
              </div>
            ) : getCanonicalSectionKey(section.id) === "COSTOS" ? (
              <CostCalculationPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onCostCalculation} />
            ) : !machinery && getCanonicalSectionKey(section.id) === "CONSTRUCCION" ? (
              <ConstructionTypesPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onConstructionTypes} />
            ) : getCanonicalSectionKey(section.id) === "MERCADO_RENTAS" ? (
              <div className="grid gap-4">
                <MarketCalculationPanel
                  valuationId={valuationId}
                  types={RENT_COMPARABLE_TYPES}
                  readOnly={!canEdit}
                  canReview={canReview}
                  suggestedSubjectArea={null}
                  onCalculation={calculationSync.onMarketCalculation}
                />
                <StatisticalMethodsPanel
                  valuationId={valuationId}
                  types={RENT_COMPARABLE_TYPES}
                  readOnly={!canEdit}
                  onCalculation={calculationSync.onStatisticalCalculation}
                />
              </div>
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
            onRemoveSection={setRemovingSectionId}
            onRenameSection={handleRenameSection}
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
            valuationId={valuationId}
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
            onCalculationMemory={() => void handleCalculationMemory()}
            onExport={handleExportPdf}
            onExit={handleExit}
            onRemoveSection={canEdit ? setRemovingSectionId : undefined}
            onRenameSection={handleRenameSection}
            onReorderSections={(next) => updateSections((current) => withListedOrder(current, next))}
            onRestoreSection={canEdit ? handleRestoreSection : undefined}
            onSelectSection={handleActiveSectionChange}
            onRedo={() => void redo()}
            onSave={() => void handleSave()}
            onSaveAsTemplate={valuationId && canEdit ? () => setTemplateDialogOpen(true) : undefined}
            onSplitLayoutChange={handleSplitLayoutChange}
            onUndo={() => void undo()}
            onWorkspaceModeChange={handleWorkspaceModeChange}
            readOnly={!canEdit}
            redoAvailable={canRedo}
            removedSections={removedSections}
            saveStatus={saveStatus}
            saving={saving}
            splitLayout={splitLayout}
            undoAvailable={canUndo}
            valuationId={valuationId}
            workspaceMode={workspaceMode}
          />

          {!canEdit ? (
            <ReadOnlyValuationAlert
              reason={locked ? "concluded" : "role"}
              deliverablesOf={valuationId && hasPermission(currentUser, AUTH_PERMISSIONS.exportValuations) ? valuationId : null}
            />
          ) : null}
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
        valuationId={valuationId ?? undefined}
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
      <RemoveSectionDialog
        sectionName={removingSection ? sectionDisplayName(removingSection) : null}
        restorable={Boolean(removingSection && !removingSection.custom)}
        onOpenChange={(open) => { if (!open) setRemovingSectionId(null); }}
        onConfirm={() => { if (removingSection) handleRemoveSection(removingSection.id); }}
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
