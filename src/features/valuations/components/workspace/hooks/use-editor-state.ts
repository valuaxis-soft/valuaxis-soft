import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { ValuationMeta } from "@/features/valuations/services/valuation-constants";
import type { AppSection, Block, CaratulaFormData } from "@/features/valuations/model";
import { updateCompanyHeaderFields } from "@/features/valuations/services/caratula-company-header";
import type { ValuationDetail } from "@/features/valuations/repositories/valuation.repository";
import type { SaveStatus } from "@/features/valuations/components/feedback/save-status-indicator";
import { applyMetaPatchToCaratula } from "@/features/valuations/components/workspace/valuation-caratula-state";
import {
  EDITOR_HISTORY_LIMIT,
  TEXT_EDIT_GROUP_MS,
  editorSnapshotChanged,
  emptyEditorHistory,
  textEditGroupKey,
  type EditorHistory,
  type EditorHistoryOptions,
  type EditorSnapshot,
} from "../model/editor-history";
import {
  caratulaFromValuation,
  initialMetaFor,
  initialSectionsFor,
} from "../model/initial-hydration";
import { normalizeEditorSections } from "../model/section-numbering";

/**
 * Editor document state (meta, sections, carátula), its undo/redo history and
 * the save status that tracks whether it differs from the last saved snapshot.
 */
export function useEditorState({
  canEdit,
  initialValuation,
  valuationId,
}: {
  canEdit: boolean;
  initialValuation?: ValuationDetail | null;
  valuationId: string | null;
}) {
  const [meta, setMeta] = useState<ValuationMeta>(initialMetaFor(initialValuation));
  const [sections, setSections] = useState<AppSection[]>(() => initialSectionsFor(initialValuation));
  const [caratula, setCaratula] = useState<CaratulaFormData>(() =>
    caratulaFromValuation(
      initialValuation,
      initialMetaFor(initialValuation),
      sections,
    ),
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const snapshotRef = useRef<EditorSnapshot | null>(null);
  const historyRef = useRef<EditorHistory>(emptyEditorHistory());
  const savedSnapshotRef = useRef<EditorSnapshot | null>(null);
  // Mirrors whether historyRef has past/future entries so render never reads the ref.
  const [historyAvailability, setHistoryAvailability] = useState({ past: false, future: false });
  const syncHistoryAvailability = () => {
    const past = historyRef.current.past.length > 0;
    const future = historyRef.current.future.length > 0;
    setHistoryAvailability((current) =>
      current.past === past && current.future === future ? current : { past, future },
    );
  };

  // Lazy ref initialization (null-check pattern allowed during render).
  if (snapshotRef.current === null) {
    snapshotRef.current = { caratula, meta, sections };
  }
  if (savedSnapshotRef.current === null) {
    savedSnapshotRef.current = { caratula, meta, sections };
  }

  // Reset undo/redo availability when switching valuations (adjusted during render);
  // the history refs themselves are reset in the effect below.
  const [historyValuationId, setHistoryValuationId] = useState(valuationId);
  if (historyValuationId !== valuationId) {
    setHistoryValuationId(valuationId);
    setHistoryAvailability({ past: false, future: false });
  }

  const canUndo = canEdit && historyAvailability.past;
  const canRedo = canEdit && historyAvailability.future;

  const applyEditorSnapshot = (snapshot: EditorSnapshot) => {
    snapshotRef.current = snapshot;
    setMeta(snapshot.meta);
    setSections(snapshot.sections);
    setCaratula(snapshot.caratula);
  };

  const pushEditorHistory = (snapshot: EditorSnapshot, options?: EditorHistoryOptions) => {
    const now = Date.now();
    const history = historyRef.current;
    const groupKey = options?.groupKey;
    const groupWithPrevious = Boolean(
      groupKey &&
      history.lastGroupKey === groupKey &&
      now - history.lastPushedAt <= TEXT_EDIT_GROUP_MS,
    );

    history.lastGroupKey = groupKey ?? null;
    history.lastPushedAt = now;
    history.future = [];

    if (groupWithPrevious) {
      syncHistoryAvailability();
      return;
    }

    history.past = [...history.past, snapshot].slice(-EDITOR_HISTORY_LIMIT);
    syncHistoryAvailability();
  };

  const updateEditorState = (
    updater: (current: EditorSnapshot) => EditorSnapshot,
    options?: EditorHistoryOptions,
  ) => {
    const current = snapshotRef.current ?? { caratula, meta, sections };
    const next = updater(current);
    if (!editorSnapshotChanged(current, next)) return;
    pushEditorHistory(current, options);
    applyEditorSnapshot(next);
    setSaveStatus("dirty");
  };

  const undoEditorChange = () => {
    const history = historyRef.current;
    const previous = history.past.at(-1);
    const current = snapshotRef.current;
    if (!previous || !current || !canEdit) return;

    history.past = history.past.slice(0, -1);
    history.future = [current, ...history.future].slice(0, EDITOR_HISTORY_LIMIT);
    history.lastGroupKey = null;
    history.lastPushedAt = 0;
    applyEditorSnapshot(previous);
    setSaveStatus(savedSnapshotRef.current && !editorSnapshotChanged(previous, savedSnapshotRef.current) ? "saved" : "dirty");
    syncHistoryAvailability();
  };

  const redoEditorChange = () => {
    const history = historyRef.current;
    const next = history.future[0];
    const current = snapshotRef.current;
    if (!next || !current || !canEdit) return;

    history.future = history.future.slice(1);
    history.past = [...history.past, current].slice(-EDITOR_HISTORY_LIMIT);
    history.lastGroupKey = null;
    history.lastPushedAt = 0;
    applyEditorSnapshot(next);
    setSaveStatus(savedSnapshotRef.current && !editorSnapshotChanged(next, savedSnapshotRef.current) ? "saved" : "dirty");
    syncHistoryAvailability();
  };

  useEffect(() => {
    snapshotRef.current = { caratula, meta, sections };
  }, [caratula, meta, sections]);

  // Reset history when the valuation changes (not on mount: the lazy ref init
  // above already holds the initial snapshot). Reads the state current at that commit.
  const historyResetValuationIdRef = useRef(valuationId);
  useEffect(() => {
    if (historyResetValuationIdRef.current === valuationId) return;
    historyResetValuationIdRef.current = valuationId;
    historyRef.current = emptyEditorHistory();
    snapshotRef.current = { caratula, meta, sections };
    savedSnapshotRef.current = { caratula, meta, sections };
  }, [valuationId, caratula, meta, sections]);

  const handleEditorHistoryKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!canEdit || event.defaultPrevented || (!event.ctrlKey && !event.metaKey)) return;
    const key = event.key.toLowerCase();
    const isUndo = key === "z" && !event.shiftKey;
    const isRedo = key === "y" || (key === "z" && event.shiftKey);
    if (!isUndo && !isRedo) return;

    if (isUndo && historyRef.current.past.length > 0) {
      event.preventDefault();
      undoEditorChange();
      return;
    }

    if (isRedo && historyRef.current.future.length > 0) {
      event.preventDefault();
      redoEditorChange();
    }
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => handleEditorHistoryKeyDown(event);
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const updateMeta = (patch: Partial<ValuationMeta>) => {
    updateEditorState((current) => ({
      ...current,
      caratula: applyMetaPatchToCaratula(current.caratula, patch),
      meta: { ...current.meta, ...patch },
    }), { groupKey: textEditGroupKey("meta", patch) });
  };

  const updateSections = (
    updater: (current: AppSection[]) => AppSection[],
    options?: EditorHistoryOptions,
  ) => {
    updateEditorState((current) => ({
      ...current,
      sections: (() => {
        const updatedSections = updater(current.sections);
        if (updatedSections === current.sections) return current.sections;
        // Leaf content patches (Concept value/title) don't need structural normalization
        if (options?.normalize === false) return updatedSections;
        const normalized = normalizeEditorSections(updatedSections);
        return normalized;
      })(),
    }), options);
  };

  const updateCaratula = (patch: Partial<CaratulaFormData>) => {
    updateEditorState((current) => {
      const nextCaratula = { ...current.caratula, ...patch };
      const syncCompanyHeader =
        patch.tituloInmueble !== undefined ||
        patch.direccionEmpresa !== undefined ||
        patch.telefonoEmpresa !== undefined ||
        patch.correoEmpresa !== undefined;

      return {
        ...current,
        caratula: nextCaratula,
        sections: syncCompanyHeader
          ? normalizeEditorSections(updateCompanyHeaderFields(current.sections, patch))
          : current.sections,
      };
    }, { groupKey: textEditGroupKey("caratula", patch) });
  };

  const updateSectionBlocks = (
    sectionId: string,
    updater: (blocks: Block[]) => Block[],
    options?: EditorHistoryOptions,
  ) => {
    updateSections(
      (current) => {
        let changed = false;
        const nextSections = current.map((section) => {
          if (section.id !== sectionId) return section;
          const nextBlocks = updater(section.blocks);
          if (nextBlocks === section.blocks) return section;
          changed = true;
          return { ...section, blocks: nextBlocks };
        });
        return changed ? nextSections : current;
      },
      options,
    );
  };

  const updateSection = (sectionId: string, patch: Partial<AppSection>) => {
    updateSections(
      (current) =>
        current.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)),
      { groupKey: textEditGroupKey(`section:${sectionId}`, patch) },
    );
  };

  return {
    canRedo,
    canUndo,
    caratula,
    meta,
    redoEditorChange,
    saveStatus,
    savedSnapshotRef,
    sections,
    setCaratula,
    setSaveStatus,
    setSections,
    snapshotRef,
    undoEditorChange,
    updateCaratula,
    updateMeta,
    updateSection,
    updateSectionBlocks,
    updateSections,
  };
}

export type EditorState = ReturnType<typeof useEditorState>;
