import type { ValuationMeta } from "@/features/valuations/services/valuation-constants";
import type { AppSection, CaratulaFormData } from "@/features/valuations/model";

export const EDITOR_HISTORY_LIMIT = 50;
export const TEXT_EDIT_GROUP_MS = 1200;

export type EditorSnapshot = {
  caratula: CaratulaFormData;
  meta: ValuationMeta;
  sections: AppSection[];
};

export type EditorHistoryOptions = {
  groupKey?: string;
  /** Skip structural normalization for leaf content patches (Concept value/title). */
  normalize?: boolean;
};

export type EditorHistory = {
  future: EditorSnapshot[];
  lastGroupKey: string | null;
  lastPushedAt: number;
  past: EditorSnapshot[];
};

export function emptyEditorHistory(): EditorHistory {
  return {
    future: [],
    lastGroupKey: null,
    lastPushedAt: 0,
    past: [],
  };
}

export function editorSnapshotChanged(current: EditorSnapshot, next: EditorSnapshot) {
  return current.caratula !== next.caratula ||
    current.meta !== next.meta ||
    current.sections !== next.sections;
}

export function textEditGroupKey(scope: string, patch: object) {
  const entries = Object.entries(patch).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length || entries.some(([, value]) => typeof value !== "string")) return undefined;
  const keys = entries.map(([key]) => key);
  return `${scope}:${keys.join(",")}`;
}
