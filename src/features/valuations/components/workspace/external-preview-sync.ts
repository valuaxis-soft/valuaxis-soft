import type {
  AppSection,
  CaratulaFormData,
  ImageContent,
  Letterhead,
  PrincipalCoverImage,
  ValuationMeta,
} from "@/features/valuations/model";
import type { NumberPresentation } from "@/features/valuations/services/number-presentation";
import type { PagePresentation } from "@/features/valuations/services/page-presentation";

export type ExternalPreviewPayload = {
  activeSection: AppSection;
  caratula: CaratulaFormData;
  letterhead: Letterhead;
  documentHeaderImage?: ImageContent | null;
  meta: ValuationMeta;
  principalCoverImage: PrincipalCoverImage | null;
  /** How the document writes its numbers; a main tab on an older version sends none. */
  numberPresentation?: NumberPresentation;
  /** How the document lays out its pages; a main tab on an older version sends none. */
  pagePresentation?: PagePresentation;
  /** Where the section shown is in the document, so the window browses it too; absent from an older main tab. */
  navigation?: ExternalPreviewNavigation;
};

/** The section the window shows among the ones it can browse. */
export type ExternalPreviewNavigation = {
  label: string;
  position: { index: number; total: number };
  canPrevious: boolean;
  canNext: boolean;
};

export type ExternalPreviewMessage =
  | { type: "preview-ready" }
  | { type: "main-ready" }
  | { payload: ExternalPreviewPayload; type: "preview-state" }
  /** The editor tab is going away (closed, or reloading). */
  | { type: "main-closed" }
  /** A preview window of the valuation just opened; any other one gives way to it. */
  | { type: "preview-opened"; windowId: string }
  /** The window asks the editor for the previous or next section of the document. */
  | { type: "preview-navigate"; direction: -1 | 1 };

/** The previous or next section the window asked for; null for any other message. */
export function externalPreviewNavigation(message: unknown): -1 | 1 | null {
  if (!message || typeof message !== "object") return null;
  const data = message as { type?: unknown; direction?: unknown };
  return data.type === "preview-navigate" && (data.direction === -1 || data.direction === 1) ? data.direction : null;
}

/**
 * How long a preview window waits, once its editor goes away, for an editor
 * to answer before closing: an editor that only reloads (F5) answers well
 * within it, so the window stays.
 */
export const MAIN_CLOSED_GRACE_MS = 4000;

/** What a preview window does with a message from its channel. */
export type ExternalPreviewWindowAction =
  | { kind: "show"; payload: ExternalPreviewPayload }
  | { kind: "request-state" }
  | { kind: "close-unless-answered" }
  | { kind: "close" }
  | { kind: "ignore" };

/**
 * The preview window's side of the channel. State from an editor shows (and
 * keeps the window open); an editor that went away closes it unless another
 * answers; a newer window of the same valuation takes its place, so clicking
 * "2 pantallas" again never leaves two.
 */
export function externalPreviewWindowAction(message: unknown, windowId: string): ExternalPreviewWindowAction {
  if (!message || typeof message !== "object") return { kind: "ignore" };
  const data = message as Partial<ExternalPreviewMessage> & { payload?: ExternalPreviewPayload; windowId?: unknown };
  switch (data.type) {
    // A main tab still on an older version (during a deploy) sends no letterhead: wait for a current one.
    case "preview-state": return data.payload?.letterhead ? { kind: "show", payload: data.payload } : { kind: "ignore" };
    case "main-ready": return { kind: "request-state" };
    case "main-closed": return { kind: "close-unless-answered" };
    case "preview-opened": return typeof data.windowId === "string" && data.windowId !== windowId ? { kind: "close" } : { kind: "ignore" };
    default: return { kind: "ignore" };
  }
}

export function getExternalPreviewChannelName(valuationId: string | null) {
  return `valuation-preview:${valuationId ?? "draft"}`;
}
