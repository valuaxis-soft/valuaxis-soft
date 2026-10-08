/**
 * A stand-in for the AI provider. It answers what the test scripted, keeps
 * every prompt it was sent, and bills fixed tokens, so the features can be
 * tested without the network and without spending.
 */
import type { z } from "zod";
import { AiGatewayError, type AiErrorKind, type AiGateway, type AiPrompt, type AiUsage } from "../../src/features/ai/ai-gateway";
import type { ListingExtraction } from "../../src/features/ai/listing-extraction";

export const EMPTY_EXTRACTION: ListingExtraction = {
  operation: "no_indicado", operationEvidence: "", price: "", landArea: "", builtArea: "", frontage: "", depth: "",
  street: "", neighborhood: "", municipality: "", state: "", propertyType: "", landUse: "", topography: "", services: "",
  portal: "", listingDate: "", contactName: "", contactPhone: "",
};

const usage = (model: string): AiUsage => ({ model, inputTokens: 900, outputTokens: 150, cacheReadTokens: 0, cacheWriteTokens: 0 });

export function createFakeAiGateway(script: {
  /** The model's answer to an extraction: fixed, or decided from the prompt (a model that obeys the listing). */
  extraction?: Partial<ListingExtraction> | ((prompt: AiPrompt) => Partial<ListingExtraction>);
  /** The texts the model writes, one per call, in order. */
  drafts?: string[];
  /** Every call fails this way. */
  failure?: AiErrorKind;
} = {}) {
  const prompts: Array<{ kind: "extract" | "write"; prompt: AiPrompt }> = [];
  const drafts = [...(script.drafts ?? [])];

  const gateway: AiGateway = {
    async extract<T>(prompt: AiPrompt, schema: z.ZodType<T>) {
      prompts.push({ kind: "extract", prompt });
      if (script.failure) throw new AiGatewayError(script.failure);
      const answer = typeof script.extraction === "function" ? script.extraction(prompt) : script.extraction ?? {};
      return { data: schema.parse({ ...EMPTY_EXTRACTION, ...answer }), usage: usage("fake-extraction") };
    },
    async write(prompt: AiPrompt) {
      prompts.push({ kind: "write", prompt });
      if (script.failure) throw new AiGatewayError(script.failure);
      const text = drafts.shift();
      if (text === undefined) throw new Error("The fake AI gateway has no draft left to write.");
      return { text, usage: usage("fake-drafting") };
    },
  };

  return { gateway, prompts };
}
