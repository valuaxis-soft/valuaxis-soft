import { useEffect, useState } from "react";
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

  const handleSave = async () => {
    if (!canEdit) return false;
    const caratulaSection = sections.find((section) => section.id === "caratula");
    if (hasUntitledConcepts(caratulaSection?.blocks ?? [])) {
      setActiveSectionId("caratula");
      setSaveStatus("error");
      toast.error("Revisa los campos sin título antes de guardar.");
      return false;
    }
    if (hasCaratulaValidationErrors(validateCaratula(caratula, meta))) {
      setActiveSectionId("caratula");
      setSaveStatus("error");
      toast.error("Revisa los campos marcados antes de guardar.");
      return false;
    }
    const telefonoEmpresa = formatMexicanPhone(caratula.telefonoEmpresa);
    const caratulaForSave = { ...caratula, telefonoEmpresa };
    const sectionsForSave = updateCompanyHeaderFields(sections, { telefonoEmpresa });
    snapshotRef.current = { caratula: caratulaForSave, meta, sections: sectionsForSave };
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
      toast.success("Avaluo guardado correctamente");
      savedSnapshotRef.current = snapshotRef.current ? { ...snapshotRef.current } : null;
      setSaveStatus("saved");
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
