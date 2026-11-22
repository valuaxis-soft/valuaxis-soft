import { env } from "@/lib/env";
import type { AiGateway } from "./ai-gateway";

let cached: AiGateway | undefined;
let override: AiGateway | null | undefined;

/** Tests put a fake in place of the provider, or null to run as without a key; undefined restores it. */
export function overrideAiGateway(gateway: AiGateway | null | undefined) {
  override = gateway;
}

/** The assisted features are optional: without ANTHROPIC_API_KEY the app runs exactly as before. */
export function isAiEnabled() {
  if (override !== undefined) return override !== null;
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

let webSearchOverride: boolean | undefined;

/** Tests turn «Buscar con IA» on or off whatever the environment says; undefined restores it. */
export function overrideAiWebSearch(enabled: boolean | undefined) {
  webSearchOverride = enabled;
}

/**
 * Whether «Buscar con IA» can run, and when it cannot, why: there is no key
 * (`no_key`) or the installation has it turned off (`off`).
 */
export function aiWebSearchAvailability(): { enabled: true } | { enabled: false; reason: "no_key" | "off" } {
  if (!isAiEnabled()) return { enabled: false, reason: "no_key" };
  const on = webSearchOverride ?? env.AI_COMPARABLE_SEARCH_ENABLED?.trim().toLowerCase() === "true";
  return on ? { enabled: true } : { enabled: false, reason: "off" };
}

/** Null when ANTHROPIC_API_KEY is not set. */
export async function getAiGateway(): Promise<AiGateway | null> {
  if (override !== undefined) return override;
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  if (!cached) {
    const { createAnthropicGateway } = await import("@/infrastructure/ai/anthropic-gateway");
    cached = createAnthropicGateway({
      apiKey,
      extractionModel: env.AI_EXTRACTION_MODEL?.trim() || undefined,
      draftingModel: env.AI_DRAFTING_MODEL?.trim() || undefined,
      searchModel: env.AI_SEARCH_MODEL?.trim() || undefined,
    });
  }
  return cached;
}
