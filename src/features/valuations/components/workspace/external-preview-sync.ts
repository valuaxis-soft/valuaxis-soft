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
};

export type ExternalPreviewMessage =
  | { type: "preview-ready" }
  | { type: "main-ready" }
  | { payload: ExternalPreviewPayload; type: "preview-state" }
  /** The editor tab is going away (closed, or reloading). */
  | { type: "main-closed" }
  /** A preview window of the valuation just opened; any other one gives way to it. */
  | { type: "preview-opened"; windowId: string };

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
