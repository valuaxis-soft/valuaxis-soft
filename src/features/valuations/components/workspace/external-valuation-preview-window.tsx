"use client";

import { useEffect, useState } from "react";

import { NumberPresentationProvider } from "@/features/valuations/components/number-presentation-context";
import { ReportPreview } from "@/features/valuations/components/report-preview";
import { DEFAULT_NUMBER_PRESENTATION } from "@/features/valuations/services/number-presentation";
import { PagePresentationProvider } from "@/features/valuations/components/page-presentation-context";
import { DEFAULT_PAGE_PRESENTATION } from "@/features/valuations/services/page-presentation";
import {
  MAIN_CLOSED_GRACE_MS,
  externalPreviewWindowAction,
  getExternalPreviewChannelName,
  type ExternalPreviewMessage,
  type ExternalPreviewPayload,
} from "@/features/valuations/components/workspace/external-preview-sync";

export function ExternalValuationPreviewWindow({ valuationId }: { valuationId: string | null }) {
  const [payload, setPayload] = useState<ExternalPreviewPayload | null>(null);

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
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6 text-sm text-muted-foreground">
        Esperando vista previa del avalúo...
      </main>
    );
  }

  return (
    <main className="h-screen min-h-0 bg-muted/40 p-4 text-foreground">
      {payload.activeSection.enabled === false ? (
        <div className="flex h-full items-center justify-center rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
          Esta sección está oculta en el documento.
        </div>
      ) : (
        <NumberPresentationProvider presentation={payload.numberPresentation ?? DEFAULT_NUMBER_PRESENTATION}>
        <PagePresentationProvider presentation={payload.pagePresentation ?? DEFAULT_PAGE_PRESENTATION}>
          <ReportPreview
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
    </main>
  );
}
