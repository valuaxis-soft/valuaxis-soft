"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ReadOnlyValuationAlert } from "@/features/valuations/components/feedback/valuation-error-alert";
import { UnaccreditedEditorAlert, UnaccreditedNoticeProvider } from "@/features/accreditation/components/unaccredited-notice";
import { FormulaEditingProvider } from "@/features/valuations/components/editor/formula-editing";
import { CustomUnitsProvider } from "@/features/valuations/components/editor/custom-units-context";
import { DeleteConfirmProvider } from "@/features/valuations/components/editor/delete-confirm";
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
import { ValuationReviewBar } from "@/features/valuations/components/workspace/valuation-review-bar";
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
import type { AppSection, Letterhead } from "@/features/valuations/model";
import type { ValuationDetail } from "@/features/valuations/repositories/valuation.repository";
import { canEditProject, canExportProject, canReviewComparables, hasPermission } from "@/features/auth/permissions";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { isMachineryPropertyKind } from "@/features/valuations/calculation/machinery-types";
import { ConclusionPanel } from "@/features/valuations/components/calculation/conclusion-panel";
import { LiveFormulaOwnerProvider } from "@/features/valuations/components/calculation/formula-input";
import { sectionLiveFormulaOwner } from "@/features/valuations/services/live-formulas";
import { ConstructionCaptureAccess, ConstructionCaptureProvider } from "@/features/valuations/components/editor/construction-capture-table";
import { withTemplateCaptureTable } from "@/features/valuations/calculation/construction-capture";
import { CostCalculationPanel } from "@/features/valuations/components/calculation/cost-calculation-panel";
import { IncomeCalculationPanel } from "@/features/valuations/components/calculation/income-calculation-panel";
import { MachineryCostPanel, MachineryMarketPanel } from "@/features/valuations/components/calculation/machinery-calculation-panel";
import { MarketCalculationPanel } from "@/features/valuations/components/calculation/market-calculation-panel";
import { MarketSectionTabs } from "@/features/valuations/components/calculation/market-section-tabs";
import { StatisticalMethodsPanel } from "@/features/valuations/components/calculation/statistical-methods-panel";
import type { GoogleMapsPageConfig } from "@/features/maps/components/location-panel";
import { CroquisGeneratorProvider, CroquisSectionAccess } from "@/features/maps/components/croquis-generator";
import { RENT_COMPARABLE_TYPES } from "@/features/valuations/calculation/market-types";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import { approachIncluded, excludedReportApproaches, previewSectionForReport, withApproachIncluded, type ReportApproach } from "@/features/valuations/services/report-approaches";
import type { SectionCaptureHeaders } from "@/features/valuations/services/capture-headers";
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
import { useMarginWheel } from "./hooks/use-margin-wheel";
import { usePreviewFollow } from "./hooks/use-preview-follow";
import { previewGroupIds } from "./model/preview-follow";
import { exitDialogDescription } from "./model/navigation-guard";
import { autosaveDelayMs, DEFAULT_AUTOSAVE_SECONDS, describeAutosave, type AutosaveSeconds } from "@/features/account/user-preferences";
import { mustSaveBeforeDocument } from "./model/save-status";
import { useWorkspaceLayout } from "./hooks/use-workspace-layout";
import { useEditorViewport } from "./hooks/use-editor-viewport";
import { StructureTransferProvider } from "./structure-transfer-context";
import { SaveAsTemplateDialog } from "./template-dialogs";
import { TemplateCalculationNote, TemplateEditingNotice, type TemplateEditing } from "./template-editing";

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
  googleMaps = { apiKey: null },
  customUnits = [],
  unaccreditedNotice = null,
  autosaveSeconds = DEFAULT_AUTOSAVE_SECONDS,
  template = null,
}: {
  /**
   * «Nueva plantilla» / «Editar plantilla»: the same editor on a template of
   * the firm instead of a valuation. It saves the template's document; with no
   * valuation there is no calculation, carátula data, dictamen or memory.
   */
  template?: TemplateEditing | null;
  /** The appraiser's autosave interval (Mi cuenta → Autoguardado); 0: off. */
  autosaveSeconds?: AutosaveSeconds;
  /** The issuer is not accredited: the preview shows the notice the dictamen prints, and the editor says why. */
  unaccreditedNotice?: { issuerIsCurrentUser: boolean } | null;
  currentUser: AuthUser;
  letterhead: Letterhead;
  valuationId?: string | null;
  action?: string | null;
  initialValuation?: ValuationDetail | null;
  /** The installation has the AI assistance configured. */
  aiEnabled?: boolean;
  /** The browser key of Google Maps and the request's nonce, for the croquis panel; no key, no map. */
  googleMaps?: GoogleMapsPageConfig;
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

  const editor = useEditorState({ canEdit, initialValuation, initialDocument: template?.sections, valuationId });
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

  const liveFormulasRef = useRef<(owners: string[]) => void>(() => undefined);
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
    pendingExit,
  } = useValuationSave({
    autosaveDelayMs: autosaveDelayMs(autosaveSeconds), canEdit, editor, setActiveSectionId, valuationId,
    ...(template ? {
      saveDocument: { save: template.save, savedMessage: "Plantilla guardada. Los avalúos nuevos y «Importar» ya la usan así." },
      exitHref: "/organizacion/plantillas",
    } : {}),
    // The calculation sync comes later in this component; the save reaches it through this ref.
    onLiveFormulas: (owners) => liveFormulasRef.current(owners),
  });
  const openSessionExpired = () => setSessionExpiredOpen(true);
  useSessionHeartbeat({ hasUnsavedChanges, onSessionExpired: openSessionExpired });

  const images = useImageMutations({ ...editor, canEdit, valuationId });
  const { documentHeaderImage, principalCoverImage } = images;

  // The tab strip, the preview and the editor show every section but the deleted ones.
  const enabledSections = useMemo(() => listedSections(sections), [sections]);
  // The markets left out of the dictamen do not hold back concluding.
  const excludedApproaches = useMemo(() => excludedReportApproaches(sections), [sections]);
  const removedSections = useMemo(() => sections.filter((section) => section.removed), [sections]);
  const rawActiveSection =
    enabledSections.find((section) => section.id === activeSectionId) ?? enabledSections[0];
  const allConceptsForDisplay = useMemo(() => flattenSectionConcepts(sections), [sections]);
  const activeSection = useMemo(
    () => resolveSectionConceptsForDisplay(rawActiveSection, allConceptsForDisplay),
    [allConceptsForDisplay, rawActiveSection],
  );
  // The top bar stays put and the editor keeps its place across views.
  const workspaceRef = useRef<HTMLElement>(null);
  useEditorViewport(workspaceRef, activeSection.id);
  useMarginWheel(workspaceRef);
  // What the preview shows: the section browsed to, or the active one.
  const rawPreviewSection =
    (previewSectionId ? enabledSections.find((section) => section.id === previewSectionId) : undefined) ?? rawActiveSection;
  // As the dictamen prints it: an approach left out of the report ("Agregar al informe valuatorio") is not in the preview either.
  const previewSection = useMemo(
    () => previewSectionForReport(
      rawPreviewSection === rawActiveSection ? activeSection : resolveSectionConceptsForDisplay(rawPreviewSection, allConceptsForDisplay),
      excludedApproaches,
    ),
    [activeSection, allConceptsForDisplay, excludedApproaches, rawActiveSection, rawPreviewSection],
  );
  // «Continuar donde terminó»: the sections printed on the same pages show together, as the dictamen prints them (V6.1-09).
  const previewGroup = useMemo(() => {
    const ids = previewGroupIds(sections, previewSection.id);
    if (ids.length < 2) return undefined;
    return ids.flatMap((id) => {
      if (id === previewSection.id) return [previewSection];
      const raw = enabledSections.find((section) => section.id === id);
      return raw ? [previewSectionForReport(resolveSectionConceptsForDisplay(raw, allConceptsForDisplay), excludedApproaches)] : [];
    });
  }, [allConceptsForDisplay, enabledSections, excludedApproaches, previewSection, sections]);
  const previewStartsAfterAnother = Boolean(previewGroup && previewGroup[0]?.id !== previewSection.id);
  const previewStartBlockId = previewStartsAfterAnother ? previewSection.blocks.find((block) => block.enabled)?.id ?? null : null;
  const followedBlockId = usePreviewFollow({
    activeSection,
    previewSectionId: previewSection.id,
    sectionStartBlockId: previewStartBlockId,
  });
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
    // «Continuar donde terminó» and the block followed: the window shows and moves as the preview beside the editor.
    group: previewGroup,
    follow: { blockId: followedBlockId, startBlockId: previewStartBlockId },
  }), [
    followedBlockId,
    previewGroup,
    previewStartBlockId,
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
  useEffect(() => {
    liveFormulasRef.current = calculationSync.onLiveFormulas;
  });

  // A template is made from what is saved, so pending changes are saved first.
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const saveBeforeTemplate = async () => !hasUnsavedChanges || (await handleSave());

  // The dictamen and the calculation memory render what is saved, so pending changes are saved first.
  // When that save fails, nothing opens without saying so: the document would leave the changes out.
  const openSavedDocument = async (path: string, name: string) => {
    if (!valuationId) return;
    if (mustSaveBeforeDocument({ saving, hasUnsavedChanges }) && !(await handleSave())) {
      toast.warning(`No se abrió ${name}: los últimos cambios no se guardaron y no aparecerían. Vuelve a guardar o ábrelo con lo último guardado.`, {
        duration: 20_000,
        action: { label: "Abrir con lo guardado", onClick: () => router.push(path) },
      });
      return;
    }
    router.push(path);
  };
  const handleExportPdf = () => openSavedDocument(`/avaluos/${valuationId}/dictamen`, "el avalúo");
  const handleCalculationMemory = () => openSavedDocument(`/avaluos/${valuationId}/memoria-calculo`, "la memoria de cálculo");

  // «Quitar este enfoque» of the cost and income panels: the same switch as the section's «Agregar al informe valuatorio».
  const approachInReport = (section: AppSection, approach: ReportApproach) => ({
    included: approachIncluded(section, approach),
    onIncludedChange: (included: boolean) => updateSection(section.id, { excludedFromReport: withApproachIncluded(section, approach, included) }),
  });
  // The headers of the panel's capture tables, kept with the section and saved with the document.
  const captureHeadersOf = (section: AppSection) => ({
    captureHeaders: section.captureHeaders,
    onCaptureHeaders: (captureHeaders: SectionCaptureHeaders) => updateSection(section.id, { captureHeaders }),
  });

  // A field of a panel that reads a figure its own calculation produces is circular (live-formulas.ts).
  const withLiveFormulaOwner = (section: AppSection, panel: ReactNode) => (panel ? (
    <LiveFormulaOwnerProvider owner={sectionLiveFormulaOwner(getCanonicalSectionKey(section.id), machinery)}>{panel}</LiveFormulaOwnerProvider>
  ) : undefined);
  const editorPanel = (
    <>
      {enabledSections.map((section) => (
        <TabsContent value={section.id} key={section.id}>
          <ValuationEditorPanel
            section={section}
            calculationPanel={withLiveFormulaOwner(section, !valuationId ? (template ? <TemplateCalculationNote section={section} /> : undefined) : machinery && getCanonicalSectionKey(section.id) === "COSTOS" ? (
              <MachineryCostPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onMachineryCalculation} />
            ) : machinery && getCanonicalSectionKey(section.id) === "MERCADO_VENTA" ? (
              <MachineryMarketPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onMachineryCalculation} />
            ) : getCanonicalSectionKey(section.id) === "MERCADO_VENTA" ? (
              <MarketSectionTabs
                market={(
                  <MarketCalculationPanel
                    valuationId={valuationId}
                    readOnly={!canEdit}
                    canReview={canReview}
                    suggestedSubjectAreas={calculationSync.suggestedSubjectAreas}
                    googleMaps={googleMaps}
                    onCalculation={calculationSync.onMarketCalculation}
                  />
                )}
                methods={<StatisticalMethodsPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onStatisticalCalculation} />}
              />
            ) : getCanonicalSectionKey(section.id) === "COSTOS" ? (
              <CostCalculationPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onCostCalculation} approach={approachInReport(section, "costos")} {...captureHeadersOf(section)} />
            ) : !machinery && getCanonicalSectionKey(section.id) === "CONSTRUCCION" ? (
              // The types and installations are captured in their tables of this section (video 5.3); only a way to put one back if it is missing.
              <ConstructionCaptureAccess
                section={section}
                readOnly={!canEdit}
                onAdd={(kind) => updateSection(section.id, { blocks: withTemplateCaptureTable(section, kind).blocks })}
              />
            ) : getCanonicalSectionKey(section.id) === "MERCADO_RENTAS" ? (
              <MarketSectionTabs
                market={(
                  <MarketCalculationPanel
                    valuationId={valuationId}
                    types={RENT_COMPARABLE_TYPES}
                    readOnly={!canEdit}
                    canReview={canReview}
                    suggestedSubjectAreas={calculationSync.suggestedSubjectAreas}
                    googleMaps={googleMaps}
                    onCalculation={calculationSync.onMarketCalculation}
                  />
                )}
                methods={(
                  <StatisticalMethodsPanel
                    valuationId={valuationId}
                    types={RENT_COMPARABLE_TYPES}
                    readOnly={!canEdit}
                    onCalculation={calculationSync.onStatisticalCalculation}
                  />
                )}
              />
            ) : getCanonicalSectionKey(section.id) === "INGRESOS" ? (
              <IncomeCalculationPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onIncomeCalculation} approach={approachInReport(section, "ingresos")} {...captureHeadersOf(section)} />
            ) : getCanonicalSectionKey(section.id) === "CONCLUSIONES" ? (
              <ConclusionPanel valuationId={valuationId} readOnly={!canEdit} onCalculation={calculationSync.onConclusionCalculation} />
            ) : !machinery && getCanonicalSectionKey(section.id) === "CROQUIS_COMPARABLES" ? (
              <CroquisSectionAccess captures={["macro", "micro"]} sections={sections} />
            ) : !machinery && getCanonicalSectionKey(section.id) === "MAPA_COMPARABLES" ? (
              <CroquisSectionAccess captures={["comparables"]} sections={sections} />
            ) : undefined)}
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
            onDuplicateConcepts={blocks.duplicateConcepts}
            onMoveBlock={blocks.moveBlock}
            onRemoveBlock={blocks.removeBlock}
            onRemoveConcept={blocks.removeConcept}
            onRemoveConcepts={blocks.removeConcepts}
            onRemoveImage={images.removeImage}
            onRemoveApartado={blocks.removeApartado}
            onRemoveSection={setRemovingSectionId}
            onRenameSection={handleRenameSection}
            onRemoveSubConcept={blocks.removeSubConcept}
            onRemoveTable={tables.removeTable}
            onUpdateBlock={blocks.updateBlock}
            onUpdateSection={updateSection}
            onUpdateConcept={blocks.updateConcept}
            onUpdateConcepts={blocks.updateConcepts}
            onUpdateConceptEverywhere={blocks.updateConceptEverywhere}
            onEditConceptOnlyHere={blocks.editConceptOnlyHere}
            onChangeConceptRelation={blocks.changeConceptRelation}
            onUnlinkConcept={blocks.unlinkConceptEverywhere}
            onSetConceptCalculationLink={blocks.setConceptCalculationLink}
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
      group={previewGroup}
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
    <UnaccreditedNoticeProvider show={unaccreditedNotice !== null}>
    <FormulaEditingProvider sections={sections}>
    <NumberPresentationProvider presentation={numberPresentation}>
    <PagePresentationProvider presentation={pagePresentation}>
    <CustomUnitsProvider initialUnits={customUnits}>
    <StructureTransferProvider
      sections={sections}
      readOnly={!canEdit}
      updateSections={updateSections}
      valuationId={valuationId}
      onUndo={canEdit ? () => void undo() : undefined}
      onShowSection={handleActiveSectionChange}
    >
    <DeleteConfirmProvider onUndo={canEdit ? () => void undo() : undefined}>
    <ConstructionCaptureProvider value={calculationSync.constructionCapture}>
    <CroquisGeneratorProvider
      valuationId={valuationId}
      readOnly={!canEdit}
      googleMaps={googleMaps}
      address={meta.location}
      sections={sections}
      updateSections={updateSections}
      onUndo={() => void undo()}
    >
    <Tabs value={activeSection.id} onValueChange={handleActiveSectionChange} className="gap-0 h-full">
      {/* Clipped, not hidden: a hidden overflow still scrolls when something is brought into view, and took the top bar with it. */}
      <main ref={workspaceRef} className="min-h-0 bg-muted/40 text-foreground flex flex-col h-full overflow-clip">
      <section className="shrink-0 border-b bg-background" data-workspace-top-bar="">
        <div className="mx-auto grid max-w-[1760px] grid-cols-1 gap-3 overflow-hidden px-3 py-3 sm:px-4 lg:gap-4 lg:px-6 lg:py-4">
          <ValuationTopBar
            activeSectionId={activeSection.id}
            autosaveNote={`Guardado automático: ${describeAutosave(autosaveSeconds)}. Se cambia en Mi cuenta → Autoguardado.`}
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
            template={template ? { name: template.name, appliesTo: template.appliesTo, onEditDetails: template.onEditDetails } : undefined}
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

          {valuationId && initialValuation ? (
            <ValuationReviewBar
              valuationId={valuationId}
              folio={meta.folio}
              initialStatus={initialValuation.status}
              initialApprovedAt={initialValuation.reviewApprovedAt ?? null}
              locked={locked}
              canSend={canEditProject(currentUser)}
              canReview={hasPermission(currentUser, AUTH_PERMISSIONS.reviewValuations)}
              canExport={canExport}
              saveStatus={saveStatus}
              hasUnsavedChanges={hasUnsavedChanges}
              onSave={handleSave}
            />
          ) : null}

          {!canEdit ? (
            <ReadOnlyValuationAlert
              reason={locked ? "concluded" : "role"}
              deliverablesOf={valuationId && hasPermission(currentUser, AUTH_PERMISSIONS.exportValuations) ? valuationId : null}
            />
          ) : null}
          {template ? <TemplateEditingNotice /> : null}
          {unaccreditedNotice ? <UnaccreditedEditorAlert issuerIsCurrentUser={unaccreditedNotice.issuerIsCurrentUser} /> : null}
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
                defaultSize="50%"
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
                // A wider grab area than the hairline, so the divider is found and dragged with ease.
                className={cn("after:bg-transparent hover:bg-primary/40", splitLayout === "vertical" ? "mx-1 after:w-3" : "my-1 w-full after:h-3")}
              />
            ) : null}
            {workspaceComposition.showEditor ? (
              <ResizablePanel
                id="valuation-editor"
                panelRef={editorPanelRef}
                defaultSize="50%"
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
        excluded={excludedApproaches}
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
        description={exitDialogDescription(pendingExit)}
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
    </CroquisGeneratorProvider>
    </ConstructionCaptureProvider>
    </DeleteConfirmProvider>
    </StructureTransferProvider>
    </CustomUnitsProvider>
    </PagePresentationProvider>
    </NumberPresentationProvider>
    </FormulaEditingProvider>
    </UnaccreditedNoticeProvider>
    </AiAssistProvider>
  );
}
