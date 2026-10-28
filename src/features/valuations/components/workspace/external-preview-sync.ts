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

/* ── Other preview windows open, of other valuations ─────────────────── */

/** The channel every preview window shares, whatever its valuation: they list each other there. */
export const PREVIEW_DIRECTORY_CHANNEL = "valuation-preview-windows";

/** How often a preview window says it is still open, and how long the others wait before dropping it. */
export const PREVIEW_HEARTBEAT_MS = 5000;
const PREVIEW_STALE_MS = 3 * PREVIEW_HEARTBEAT_MS;

/** A preview window as the others list it. */
export type OpenPreviewWindow = { windowId: string; valuationId: string | null; folio: string; title: string };

export type PreviewDirectoryMessage =
  /** A window opened: the others say they are there. */
  | { type: "preview-roll-call" }
  /** "I am open", with what it shows: on a roll call, when its folio or title changes and every PREVIEW_HEARTBEAT_MS. */
  | ({ type: "preview-here" } & OpenPreviewWindow)
  | { type: "preview-gone"; windowId: string }
  /** The window `windowId` is asked to come to the front. */
  | { type: "preview-focus"; windowId: string };

/** The windows another window knows of, by id, with when each was last heard. */
export type OpenPreviewDirectory = Record<string, OpenPreviewWindow & { seenAt: number }>;

/**
 * What a window does with a message of the directory: the list of the other
 * windows as it changes (never itself), and whether to answer a roll call or
 * come to the front.
 */
export function previewDirectoryAction(
  directory: OpenPreviewDirectory,
  message: unknown,
  windowId: string,
  now: number,
): { directory: OpenPreviewDirectory; answer: boolean; focus: boolean } {
  const unchanged = { directory, answer: false, focus: false };
  if (!message || typeof message !== "object") return unchanged;
  const data = message as Partial<{ type: string; windowId: unknown; valuationId: unknown; folio: unknown; title: unknown }>;
  switch (data.type) {
    case "preview-roll-call": return { ...unchanged, answer: true };
    case "preview-here": {
      if (typeof data.windowId !== "string" || data.windowId === windowId) return unchanged;
      const entry = {
        windowId: data.windowId,
        valuationId: typeof data.valuationId === "string" ? data.valuationId : null,
        folio: typeof data.folio === "string" ? data.folio : "",
        title: typeof data.title === "string" ? data.title : "",
        seenAt: now,
      };
      return { ...unchanged, directory: { ...directory, [entry.windowId]: entry } };
    }
    case "preview-gone": {
      if (typeof data.windowId !== "string" || !(data.windowId in directory)) return unchanged;
      const { [data.windowId]: _gone, ...rest } = directory;
      return { ...unchanged, directory: rest };
    }
    case "preview-focus": return { ...unchanged, focus: data.windowId === windowId };
    default: return unchanged;
  }
}

/** The other windows still open (heard within three heartbeats), by folio. */
export function livePreviewWindows(directory: OpenPreviewDirectory, now: number): OpenPreviewWindow[] {
  return Object.values(directory)
    .filter((entry) => now - entry.seenAt <= PREVIEW_STALE_MS)
    .sort((a, b) => a.folio.localeCompare(b.folio, "es") || a.windowId.localeCompare(b.windowId))
    .map(({ seenAt: _seenAt, ...entry }) => entry);
}

/** How a window is listed: "Folio 123 · Casa habitación". */
export function previewWindowLabel(entry: Pick<OpenPreviewWindow, "folio" | "title" | "valuationId">) {
  const folio = entry.folio.trim() ? `Folio ${entry.folio.trim()}` : entry.valuationId ? "Avalúo sin folio" : "Borrador";
  return entry.title.trim() ? `${folio} · ${entry.title.trim()}` : folio;
}

/** The name the editor gives the preview window of a valuation, so it can be found again. */
export const previewWindowName = (valuationId: string | null) => `valuation-preview-${valuationId ?? "draft"}`;

export const PREVIEW_WINDOW_FEATURES = "popup,width=1100,height=900";

/** The address of the preview window of a valuation. */
export const previewWindowUrl = (valuationId: string | null) => `/workspace/preview-window?id=${encodeURIComponent(valuationId ?? "draft")}`;
