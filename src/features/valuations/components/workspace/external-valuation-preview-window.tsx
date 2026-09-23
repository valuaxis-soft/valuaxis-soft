"use client";

import { useEffect, useState } from "react";

import { ReportPreview } from "@/features/valuations/components/report-preview";
import {
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
    channel.onmessage = (event: MessageEvent<ExternalPreviewMessage>) => {
      if (event.data?.type === "preview-state") {
        setPayload(event.data.payload);
        stopRetrying();
      }
      // After main F5, main broadcasts main-ready; external re-requests state
      if (event.data?.type === "main-ready") {
        channel.postMessage({ type: "preview-ready" } satisfies ExternalPreviewMessage);
      }
    };
    channel.postMessage({ type: "preview-ready" } satisfies ExternalPreviewMessage);

    // Retry: periodically re-request state until we receive it.
    // This handles main F5 reconnection where main-ready may be missed
    // because the main channel wasn't created yet.
    retryInterval = setInterval(() => {
      channel.postMessage({ type: "preview-ready" } satisfies ExternalPreviewMessage);
    }, 2000);

    return () => {
      stopRetrying();
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
        <ReportPreview
          caratula={payload.caratula}
          companyName={payload.companyName}
          comparables={payload.selectedComparables}
          documentHeaderImage={payload.documentHeaderImage}
          meta={payload.meta}
          principalCoverImage={payload.principalCoverImage}
          section={payload.activeSection}
        />
      )}
    </main>
  );
}
