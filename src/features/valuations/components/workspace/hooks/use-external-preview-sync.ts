import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  getExternalPreviewChannelName,
  type ExternalPreviewMessage,
  type ExternalPreviewPayload,
} from "@/features/valuations/components/workspace/external-preview-sync";
import type {
  SplitLayout,
  WorkspaceMode,
} from "@/features/valuations/components/workspace/valuation-workspace-layout";

export function readStoredExternalPreview(): boolean {
  try {
    return localStorage.getItem("valuoExternalPreview") === "1";
  } catch {
    return false;
  }
}

/**
 * "2 pantallas" preview: opens the popup window and keeps it in sync with the
 * editor over a BroadcastChannel while the split layout is external.
 */
export function useExternalPreviewSync({
  payload: externalPreviewPayload,
  splitLayout,
  valuationId,
  workspaceMode,
}: {
  payload: ExternalPreviewPayload;
  splitLayout: SplitLayout;
  valuationId: string | null;
  workspaceMode: WorkspaceMode;
}) {
  const externalPreviewChannelRef = useRef<BroadcastChannel | null>(null);
  const externalPreviewPayloadRef = useRef<ExternalPreviewPayload | null>(null);
  const externalPreviewWindowRef = useRef<Window | null>(null);
  const externalPreviewChannelName = getExternalPreviewChannelName(valuationId);

  const postExternalPreviewState = useCallback(() => {
    const payload = externalPreviewPayloadRef.current;
    if (!payload) return;

    externalPreviewChannelRef.current?.postMessage({
      type: "preview-state",
      payload,
    } satisfies ExternalPreviewMessage);
  }, []);

  const openExternalPreviewWindow = useCallback(() => {
    if (typeof window === "undefined") return;

    const existingWindow = externalPreviewWindowRef.current;
    if (existingWindow && !existingWindow.closed) {
      existingWindow.focus();
      postExternalPreviewState();
      return;
    }

    const previewUrl = `/workspace/preview-window?id=${encodeURIComponent(valuationId ?? "draft")}`;
    const openedWindow = window.open(previewUrl, `valuation-preview-${valuationId ?? "draft"}`, "popup,width=1100,height=900");

    if (!openedWindow) {
      toast.error("No se pudo abrir la vista en 2 pantallas. Revisa el bloqueo de ventanas emergentes.");
      return;
    }

    externalPreviewWindowRef.current = openedWindow;
    openedWindow.focus();
    // Persist external preview active state so main can restore after F5
    try { localStorage.setItem("valuoExternalPreview", "1"); } catch {}
    postExternalPreviewState();
  }, [postExternalPreviewState, valuationId]);

  useEffect(() => {
    externalPreviewPayloadRef.current = externalPreviewPayload;
    postExternalPreviewState();
  }, [externalPreviewPayload, postExternalPreviewState]);

  useEffect(() => {
    if (workspaceMode !== "split" || splitLayout !== "external") {
      externalPreviewChannelRef.current?.close();
      externalPreviewChannelRef.current = null;
      // Clear external preview flag if user explicitly left external mode
      try { localStorage.removeItem("valuoExternalPreview"); } catch {}
      return;
    }

    if (typeof BroadcastChannel === "undefined") {
      toast.error("Tu navegador no permite sincronizar la vista en 2 pantallas.");
      return;
    }

    const channel = new BroadcastChannel(externalPreviewChannelName);
    externalPreviewChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<ExternalPreviewMessage>) => {
      if (event.data?.type === "preview-ready" || event.data?.type === "main-ready") {
        postExternalPreviewState();
      }
    };

    // Announce main is ready so external popup can request state after F5
    channel.postMessage({ type: "main-ready" } satisfies ExternalPreviewMessage);
    postExternalPreviewState();

    return () => {
      channel.close();
      if (externalPreviewChannelRef.current === channel) {
        externalPreviewChannelRef.current = null;
      }
    };
  }, [externalPreviewChannelName, postExternalPreviewState, splitLayout, workspaceMode]);

  useEffect(() => {
    if (workspaceMode === "split" && splitLayout === "external") {
      openExternalPreviewWindow();
    }
  }, [openExternalPreviewWindow, splitLayout, workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== "split" || splitLayout !== "external") return;

    const timer = window.setInterval(() => {
      const externalWindow = externalPreviewWindowRef.current;
      if (externalWindow?.closed) {
        externalPreviewWindowRef.current = null;
        try { localStorage.removeItem("valuoExternalPreview"); } catch {}
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [splitLayout, workspaceMode]);

  return { openExternalPreviewWindow };
}
