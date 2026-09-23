import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api, SessionExpiredError } from "@/lib/api-client";
import { updateCompanyHeaderFields } from "@/features/valuations/services/caratula-company-header";
import { hasUntitledConcepts } from "@/features/valuations/services/caratula-blocks";
import {
  formatMexicanPhone,
  hasCaratulaValidationErrors,
  validateCaratula,
} from "@/features/valuations/services/caratula-validation";
import { buildSectionsPayload, valuationMetaPayload } from "../model/save-payload";
import { AUTOSAVE_DELAY_MS, shouldAutosave, statusAfterSave } from "../model/save-status";
import type { EditorState } from "./use-editor-state";

/**
 * Saving the editor document: validation, the full save request, the save
 * status, the unsaved-changes guards (tab close and exit dialog) and the
 * session-expired dialog.
 */
export function useValuationSave({
  canEdit,
  editor,
  setActiveSectionId,
  valuationId,
}: {
  canEdit: boolean;
  editor: Pick<
    EditorState,
    | "caratula"
    | "meta"
    | "saveStatus"
    | "savedSnapshotRef"
    | "sections"
    | "setCaratula"
    | "setSaveStatus"
    | "setSections"
    | "snapshotRef"
  >;
  setActiveSectionId: (sectionId: string) => void;
  valuationId: string | null;
}) {
  const router = useRouter();
  const {
    caratula,
    meta,
    saveStatus,
    savedSnapshotRef,
    sections,
    setCaratula,
    setSaveStatus,
    setSections,
    snapshotRef,
  } = editor;
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [sessionExpiredOpen, setSessionExpiredOpen] = useState(false);

  const saving = saveStatus === "saving";
  const hasUnsavedChanges = saveStatus === "dirty" || saveStatus === "error";

  // Closing or reloading the tab with unsaved changes asks for confirmation.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  // Autosave stays quiet about validation problems it already reported once.
  const autosaveWarnedRef = useRef(false);

  /**
   * Saves the document. `automatic` saves do not jump to the carátula or toast
   * on success; they report a validation problem once and wait for the user.
   */
  const handleSave = async (options: { automatic?: boolean } = {}) => {
    if (!canEdit) return false;
    const automatic = options.automatic === true;
    const caratulaSection = sections.find((section) => section.id === "caratula");
    const validationError = hasUntitledConcepts(caratulaSection?.blocks ?? [])
      ? "Revisa los campos sin título antes de guardar."
      : hasCaratulaValidationErrors(validateCaratula(caratula, meta))
        ? "Revisa los campos marcados antes de guardar."
        : null;
    if (validationError) {
      if (automatic) {
        if (!autosaveWarnedRef.current) {
          autosaveWarnedRef.current = true;
          toast.warning(`Guardado automático en pausa. ${validationError}`);
        }
        return false;
      }
      setActiveSectionId("caratula");
      setSaveStatus("error");
      toast.error(validationError);
      return false;
    }
    autosaveWarnedRef.current = false;
    const telefonoEmpresa = formatMexicanPhone(caratula.telefonoEmpresa);
    const caratulaForSave = { ...caratula, telefonoEmpresa };
    const sectionsForSave = updateCompanyHeaderFields(sections, { telefonoEmpresa });
    const sentSnapshot = { caratula: caratulaForSave, meta, sections: sectionsForSave };
    snapshotRef.current = sentSnapshot;
    setCaratula(caratulaForSave);
    setSections(sectionsForSave);
    setSaveStatus("saving");
    try {
      const sectionsPayload = buildSectionsPayload(sectionsForSave);

      if (valuationId) {
        // One request: the full save updates the metadata and the sections together.
        await api.valuations.saveFull(valuationId, {
          ...valuationMetaPayload(meta),
          sections: sectionsPayload,
          caratula: caratulaForSave,
        });
      } else {
        throw new Error("Primero crea el avaluo desde el formulario de alta.");
      }
      if (!automatic) toast.success("Avalúo guardado correctamente");
      savedSnapshotRef.current = sentSnapshot;
      setSaveStatus(statusAfterSave(sentSnapshot, snapshotRef.current));
      return true;
    } catch (err) {
      setSaveStatus("error");
      if (err instanceof SessionExpiredError) {
        setSessionExpiredOpen(true);
        return false;
      }
      toast.error(`Error al guardar: ${err instanceof Error ? err.message : "Error desconocido"}`);
      return false;
    }
  };

  // Save automatically a few seconds after the last edit.
  const autosave = useEffectEvent(() => {
    void handleSave({ automatic: true });
  });
  const autosaveEnabled = shouldAutosave({ saveStatus, canEdit, valuationId, sessionExpired: sessionExpiredOpen });
  useEffect(() => {
    if (!autosaveEnabled) return;
    const timer = window.setTimeout(autosave, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, caratula, meta, sections]);

  const handleExit = () => {
    if (saveStatus === "dirty" || saveStatus === "error") {
      setExitDialogOpen(true);
      return;
    }
    router.push("/dashboard");
  };

  const handleSaveAndExit = async () => {
    const ok = await handleSave();
    if (ok) router.push("/dashboard");
  };

  const exitWithoutSaving = () => router.push("/dashboard");

  return {
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
  };
}
