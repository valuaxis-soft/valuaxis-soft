import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api, SessionExpiredError } from "@/lib/api-client";
import { updateCompanyHeaderFields } from "@/features/valuations/services/caratula-company-header";
import { hasUntitledConcepts } from "@/features/valuations/services/caratula-blocks";
import {
  describeCaratulaErrors,
  formatMexicanPhone,
  hasCaratulaValidationErrors,
  validateCaratula,
} from "@/features/valuations/services/caratula-validation";
import { buildSectionsPayload, valuationMetaPayload } from "../model/save-payload";
import { leavingLinkHref, type PendingExit } from "../model/navigation-guard";
import { errorCodeOf, isSaveShortcut, shouldAutosave, statusAfterSave } from "../model/save-status";
import type { EditorState } from "./use-editor-state";

/**
 * Saving the editor document: validation, the full save request, the save
 * status, the unsaved-changes guards (tab close, the browser's Atrás, links of
 * the app and the exit dialog) and the session-expired dialog.
 */
export function useValuationSave({
  autosaveDelayMs,
  canEdit,
  editor,
  onLiveFormulas,
  setActiveSectionId,
  valuationId,
}: {
  /** The appraiser's autosave wait (Mi cuenta → Autoguardado); null: off. */
  autosaveDelayMs: number | null;
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
  /** The calculations the server saved again because their fields read the document (live-formulas.service.ts). */
  onLiveFormulas?: (owners: string[]) => void;
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
  // Where the appraiser was going when the editor asked about the changes; null: the dialog is closed.
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);
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

  // The browser's (or the installed app's) Atrás is a client navigation that beforeunload does not see: it
  // went back to the dashboard and the changes were lost (video 6.2, 05:44). With changes pending the editor
  // puts a copy of its own page on top of the history; Atrás takes that copy off, the page stays, and the
  // editor asks. The copy stays after a save: Atrás then goes on by itself.
  const historyGuardRef = useRef(false);
  const leavingRef = useRef(false);
  useEffect(() => {
    if (!hasUnsavedChanges || historyGuardRef.current) return;
    window.history.pushState(window.history.state, "", window.location.href);
    historyGuardRef.current = true;
  }, [hasUnsavedChanges]);
  const onHistoryBack = useEffectEvent(() => {
    if (!historyGuardRef.current || leavingRef.current) return;
    if (!hasUnsavedChanges) {
      historyGuardRef.current = false;
      window.history.back();
      return;
    }
    // Back on top, so a second Atrás while the dialog is open asks again instead of leaving.
    window.history.pushState(window.history.state, "", window.location.href);
    setPendingExit({ kind: "back" });
  });
  useEffect(() => {
    const listener = () => onHistoryBack();
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);

  // A link of the app (a menu, a toast, a page linked from the editor) asks the same, before the router sees the click.
  const onDocumentClick = useEffectEvent((event: MouseEvent) => {
    if (!hasUnsavedChanges || leavingRef.current) return;
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    const href = leavingLinkHref(event, anchor, window.location);
    if (!href) return;
    event.preventDefault();
    event.stopPropagation();
    setPendingExit({ kind: "push", href });
  });
  useEffect(() => {
    const listener = (event: MouseEvent) => onDocumentClick(event);
    document.addEventListener("click", listener, true);
    return () => document.removeEventListener("click", listener, true);
  }, []);

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
    // Name the fields: "revisa los campos marcados" left the user looking for what stopped the save.
    const caratulaErrors = validateCaratula(caratula, meta);
    const validationError = hasUntitledConcepts(caratulaSection?.blocks ?? [])
      ? "No se guardó: en la carátula hay campos sin título."
      : hasCaratulaValidationErrors(caratulaErrors)
        ? `No se guardó. Corrige en la carátula: ${describeCaratulaErrors(caratulaErrors)}`
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
        const saved = await api.valuations.saveFull(valuationId, {
          ...valuationMetaPayload(meta),
          sections: sectionsPayload,
          caratula: caratulaForSave,
        });
        const liveFormulas = saved?.liveFormulas;
        if (Array.isArray(liveFormulas) && liveFormulas.length) onLiveFormulas?.(liveFormulas.map(String));
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
      const message = err instanceof Error ? err.message : "Error desconocido";
      // The server's code («Código: G-7KX3QF») stays on screen and can be copied, to send it as is.
      const code = errorCodeOf(message);
      toast.error(`Error al guardar: ${message}`, code ? {
        duration: 30_000,
        action: { label: "Copiar código", onClick: () => void navigator.clipboard?.writeText(code).catch(() => undefined) },
      } : undefined);
      return false;
    }
  };

  // Ctrl+S (⌘S on a Mac) is the "Guardar" button, not the browser's "Guardar página".
  const saveFromShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!canEdit || !isSaveShortcut(event)) return;
    event.preventDefault();
    if (!saving) void handleSave();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => saveFromShortcut(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // Save automatically a few seconds after the last edit.
  const autosave = useEffectEvent(() => {
    void handleSave({ automatic: true });
  });
  const autosaveEnabled = shouldAutosave({ saveStatus, canEdit, valuationId, sessionExpired: sessionExpiredOpen, delayMs: autosaveDelayMs });
  useEffect(() => {
    if (!autosaveEnabled || autosaveDelayMs === null) return;
    const timer = window.setTimeout(autosave, autosaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [autosaveDelayMs, autosaveEnabled, caratula, meta, sections]);

  /** Goes where the appraiser was going, without asking again. */
  const leave = (exit: PendingExit) => {
    leavingRef.current = true;
    setPendingExit(null);
    if (exit.kind === "back") {
      // The copy the guard put back on top, the editor's own page, and then the page before it.
      window.history.go(-2);
      return;
    }
    // In place of the guard's copy of this page, so Atrás from there does not land on the editor twice.
    if (historyGuardRef.current) router.replace(exit.href);
    else router.push(exit.href);
  };

  const handleExit = () => {
    if (hasUnsavedChanges) {
      setPendingExit({ kind: "push", href: "/dashboard" });
      return;
    }
    leave({ kind: "push", href: "/dashboard" });
  };

  const handleSaveAndExit = async () => {
    const exit = pendingExit;
    const ok = await handleSave();
    if (ok && exit) leave(exit);
  };

  const exitWithoutSaving = () => {
    if (pendingExit) leave(pendingExit);
  };

  const setExitDialogOpen = (open: boolean) => {
    if (!open) setPendingExit(null);
  };

  return {
    exitDialogOpen: pendingExit !== null,
    exitWithoutSaving,
    handleExit,
    handleSave,
    handleSaveAndExit,
    hasUnsavedChanges,
    pendingExit,
    saving,
    sessionExpiredOpen,
    setExitDialogOpen,
    setSessionExpiredOpen,
  };
}
