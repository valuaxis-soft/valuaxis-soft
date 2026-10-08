"use client";

import { createContext, useContext, type ReactNode } from "react";

type AiAssist = {
  /** The installation has the AI key and this user may edit this valuation. */
  enabled: boolean;
  valuationId: string | null;
};

const AiAssistContext = createContext<AiAssist>({ enabled: false, valuationId: null });

/** Tells the editor whether to offer the AI assistance. Without it, nothing is offered. */
export function AiAssistProvider({ enabled, valuationId, children }: AiAssist & { children: ReactNode }) {
  return <AiAssistContext value={{ enabled: enabled && Boolean(valuationId), valuationId }}>{children}</AiAssistContext>;
}

export const useAiAssist = () => useContext(AiAssistContext);

/** The note every AI dialog carries. */
export const AI_NOTICE = "El texto se envía a un servicio de IA para procesarlo. El resultado es un borrador: revísalo antes de usarlo.";
