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
    });
  }
  return cached;
}
