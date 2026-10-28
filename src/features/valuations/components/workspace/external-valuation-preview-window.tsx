"use client";

import { useEffect, useRef, useState } from "react";

import { NumberPresentationProvider } from "@/features/valuations/components/number-presentation-context";
import { Button } from "@/components/ui/button";
import { ReportPreview } from "@/features/valuations/components/report-preview";
import { DEFAULT_NUMBER_PRESENTATION } from "@/features/valuations/services/number-presentation";
import { PagePresentationProvider } from "@/features/valuations/components/page-presentation-context";
import { DEFAULT_PAGE_PRESENTATION } from "@/features/valuations/services/page-presentation";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  MAIN_CLOSED_GRACE_MS,
  PREVIEW_DIRECTORY_CHANNEL,
  PREVIEW_HEARTBEAT_MS,
  PREVIEW_WINDOW_FEATURES,
  externalPreviewWindowAction,
  getExternalPreviewChannelName,
  livePreviewWindows,
  previewDirectoryAction,
  previewWindowLabel,
  previewWindowName,
  previewWindowUrl,
  type ExternalPreviewMessage,
  type ExternalPreviewPayload,
  type OpenPreviewDirectory,
  type OpenPreviewWindow,
  type PreviewDirectoryMessage,
} from "@/features/valuations/components/workspace/external-preview-sync";

/**
 * The other preview windows open, of any valuation, over a channel they all
 * share: each says it is there (with its folio and title) and the others list
 * it until it goes away or stops answering. Picking one brings it to the front.
 */
function useOtherPreviewWindows(valuationId: string | null, folio: string, title: string) {
  const [directory, setDirectory] = useState<OpenPreviewDirectory>({});
  const [now, setNow] = useState(() => Date.now());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const windowIdRef = useRef<string | null>(null);
  const announceRef = useRef<() => void>(() => {});

  useEffect(() => {
    announceRef.current = () => {
      const windowId = windowIdRef.current;
      if (!windowId) return;
      channelRef.current?.postMessage({ type: "preview-here", windowId, valuationId, folio, title } satisfies PreviewDirectoryMessage);
    };
    announceRef.current();
  }, [valuationId, folio, title]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const windowId = crypto.randomUUID();
    windowIdRef.current = windowId;
    // Found again by its name when another window asks for it.
    try { window.name = previewWindowName(valuationId); } catch {}
    const channel = new BroadcastChannel(PREVIEW_DIRECTORY_CHANNEL);
    channelRef.current = channel;
    let known: OpenPreviewDirectory = {};
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const at = Date.now();
      const action = previewDirectoryAction(known, event.data, windowId, at);
      if (action.directory !== known) {
        known = action.directory;
        setDirectory(known);
      }
      setNow(at);
      if (action.answer) announceRef.current();
      if (action.focus) window.focus();
    };
    channel.postMessage({ type: "preview-roll-call" } satisfies PreviewDirectoryMessage);
    announceRef.current();
    const heartbeat = window.setInterval(() => {
      announceRef.current();
      setNow(Date.now());
    }, PREVIEW_HEARTBEAT_MS);
    const gone = () => channel.postMessage({ type: "preview-gone", windowId } satisfies PreviewDirectoryMessage);
    window.addEventListener("pagehide", gone);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", gone);
      gone();
      channel.close();
      channelRef.current = null;
      windowIdRef.current = null;
    };
  }, [valuationId]);

  const focusWindow = (target: OpenPreviewWindow) => {
    channelRef.current?.postMessage({ type: "preview-focus", windowId: target.windowId } satisfies PreviewDirectoryMessage);
    // On the user's gesture: the window found by its name comes to the front; if this window cannot reach it, a new one of that valuation opens (and the old one gives way to it).
    try {
      const opened = window.open("", previewWindowName(target.valuationId), PREVIEW_WINDOW_FEATURES);
      if (!opened) return;
      let blank = false;
      try { blank = opened.location.pathname !== "/workspace/preview-window"; } catch { blank = false; }
      if (blank) opened.location.href = previewWindowUrl(target.valuationId);
      opened.focus();
    } catch {}
  };

  return { others: livePreviewWindows(directory, now), focusWindow };
}

/** The selector "Otras vistas abiertas": the other preview windows, to bring one to the front. */
function OtherPreviewWindows({ others, onPick }: { others: OpenPreviewWindow[]; onPick: (target: OpenPreviewWindow) => void }) {
  if (!others.length) return null;
  return (
    <div className="flex shrink-0 justify-end print:hidden" data-other-previews>
      <NativeSelect
        size="sm"
        className="max-w-full bg-background"
        aria-label="Otras vistas abiertas"
        value=""
        onChange={(event) => {
          const target = others.find((entry) => entry.windowId === event.target.value);
          if (target) onPick(target);
        }}
      >
        <NativeSelectOption value="">Otras vistas abiertas ({others.length})</NativeSelectOption>
        {others.map((entry) => <NativeSelectOption key={entry.windowId} value={entry.windowId}>{previewWindowLabel(entry)}</NativeSelectOption>)}
      </NativeSelect>
    </div>
  );
}

export function ExternalValuationPreviewWindow({ valuationId }: { valuationId: string | null }) {
  const [payload, setPayload] = useState<ExternalPreviewPayload | null>(null);
  const folio = payload?.meta.folio || payload?.caratula.folio || "";
  const title = payload?.caratula.tituloInmueble || payload?.meta.location || "";
  const { others, focusWindow } = useOtherPreviewWindows(valuationId, folio, title);
  // The window's title names the valuation too, so the operating system's window list tells them apart.
  useEffect(() => {
    if (payload) document.title = `Vista previa · ${previewWindowLabel({ folio, title, valuationId })}`;
  }, [payload, folio, title, valuationId]);
  // The window browses the whole document as the preview beside the editor does: it asks the editor for the section.
  const navigate = (direction: -1 | 1) => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(getExternalPreviewChannelName(valuationId));
    channel.postMessage({ type: "preview-navigate", direction } satisfies ExternalPreviewMessage);
    channel.close();
  };
  const navigation = payload?.navigation
    ? { ...payload.navigation, onPrevious: () => navigate(-1), onNext: () => navigate(1) }
    : undefined;

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(getExternalPreviewChannelName(valuationId));
    // Tracked inside the effect (not via the `payload` state, which would be a
    // stale closure here) so the retry loop stops as soon as state arrives.
    let retryInterval: ReturnType<typeof setInterval> | null = null;
    const stopRetrying = () => {
      if (retryInterval !== null) {
        clearInterval(retryInterval);
        retryInterval = null;
      }
    };
    const windowId = crypto.randomUUID();
    // Set while the editor that fed this window went away: it closes unless an editor answers first.
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    const keepOpen = () => {
      if (closeTimer !== null) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    };
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const action = externalPreviewWindowAction(event.data, windowId);
      if (action.kind === "show") {
        setPayload(action.payload);
        stopRetrying();
        keepOpen();
      }
      // After main F5, main broadcasts main-ready; external re-requests state
      if (action.kind === "request-state") {
        keepOpen();
        channel.postMessage({ type: "preview-ready" } satisfies ExternalPreviewMessage);
      }
      // The editor tab closed: so does this window, unless another editor of the valuation is still open (it answers).
      if (action.kind === "close-unless-answered" && closeTimer === null) {
        closeTimer = setTimeout(() => window.close(), MAIN_CLOSED_GRACE_MS);
        channel.postMessage({ type: "preview-ready" } satisfies ExternalPreviewMessage);
      }
      // A newer window of the same valuation was opened: one is enough.
      if (action.kind === "close") window.close();
    };
    channel.postMessage({ type: "preview-opened", windowId } satisfies ExternalPreviewMessage);
    channel.postMessage({ type: "preview-ready" } satisfies ExternalPreviewMessage);

    // Retry: periodically re-request state until we receive it.
    // This handles main F5 reconnection where main-ready may be missed
    // because the main channel wasn't created yet.
    retryInterval = setInterval(() => {
      channel.postMessage({ type: "preview-ready" } satisfies ExternalPreviewMessage);
    }, 2000);

    return () => {
      stopRetrying();
      keepOpen();
      channel.close();
    };
  }, [valuationId]);

  if (!payload) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/40 p-6 text-sm text-muted-foreground">
        Esperando vista previa del avalúo...
        <OtherPreviewWindows others={others} onPick={focusWindow} />
      </main>
    );
  }

  return (
    <main className="flex h-screen min-h-0 flex-col gap-2 bg-muted/40 p-4 text-foreground">
      <OtherPreviewWindows others={others} onPick={focusWindow} />
      <div className="min-h-0 flex-1">
      {payload.activeSection.enabled === false ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
          Esta sección está oculta en el documento.
          {navigation ? (
            <span className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!navigation.canPrevious} onClick={navigation.onPrevious}>Sección anterior</Button>
              <Button type="button" variant="outline" size="sm" disabled={!navigation.canNext} onClick={navigation.onNext}>Sección siguiente</Button>
            </span>
          ) : null}
        </div>
      ) : (
        <NumberPresentationProvider presentation={payload.numberPresentation ?? DEFAULT_NUMBER_PRESENTATION}>
        <PagePresentationProvider presentation={payload.pagePresentation ?? DEFAULT_PAGE_PRESENTATION}>
          <ReportPreview
            navigation={navigation}
            caratula={payload.caratula}
            letterhead={payload.letterhead}
            documentHeaderImage={payload.documentHeaderImage}
            meta={payload.meta}
            principalCoverImage={payload.principalCoverImage}
            section={payload.activeSection}
          />
        </PagePresentationProvider>
        </NumberPresentationProvider>
      )}
      </div>
    </main>
  );
}
