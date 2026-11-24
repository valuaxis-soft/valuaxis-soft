/**
 * A stand-in for the AI provider. It answers what the test scripted, keeps
 * every prompt it was sent, and bills fixed tokens, so the features can be
 * tested without the network and without spending.
 */
import type { z } from "zod";
import { AiGatewayError, type AiErrorKind, type AiGateway, type AiPrompt, type AiUsage, type AiWebSearchOptions } from "../../src/features/ai/ai-gateway";
import type { ListingExtraction } from "../../src/features/ai/listing-extraction";

export const EMPTY_EXTRACTION: ListingExtraction = {
  operation: "no_indicado", operationEvidence: "", price: "", landArea: "", builtArea: "", frontage: "", depth: "",
  street: "", streetNumber: "", neighborhood: "", subdivision: "", municipality: "", state: "", postalCode: "", propertyType: "",
  bedrooms: "", bathrooms: "", halfBaths: "", parking: "", levels: "", age: "", conservation: "", frontCount: "", shape: "", zone: "",
  landUse: "", topography: "", services: "", portal: "", publicationId: "", listingDate: "", contactName: "", contactPhone: "",
  amenities: [], otherFacts: [],
};

const usage = (model: string): AiUsage => ({ model, inputTokens: 900, outputTokens: 150, cacheReadTokens: 0, cacheWriteTokens: 0 });

export function createFakeAiGateway(script: {
  /** The model's answer to an extraction: fixed, or decided from the prompt (a model that obeys the listing). */
  extraction?: Partial<ListingExtraction> | ((prompt: AiPrompt) => Partial<ListingExtraction>);
  /** The texts the model writes, one per call, in order. */
  drafts?: string[];
  /** What a web search answers and the addresses the provider's search returned; its queries are reported as progress. */
  webSearch?: { answer: unknown; resultUrls?: string[]; queries?: string[]; delayMs?: number };
  /** Every call fails this way. */
  failure?: AiErrorKind;
} = {}) {
  const prompts: Array<{ kind: "extract" | "write" | "search"; prompt: AiPrompt }> = [];
  const drafts = [...(script.drafts ?? [])];

  const gateway: AiGateway = {
    async searchWeb<T>(prompt: AiPrompt, schema: z.ZodType<T>, options: AiWebSearchOptions) {
      prompts.push({ kind: "search", prompt });
      if (script.failure) throw new AiGatewayError(script.failure);
      if (!script.webSearch) throw new Error("The fake AI gateway has no web search to answer.");
      const queries = script.webSearch.queries ?? [];
      queries.forEach((query, index) => options.onProgress?.({ searches: index + 1, query }));
      if (script.webSearch.delayMs) await new Promise((resolve) => setTimeout(resolve, script.webSearch?.delayMs));
      return {
        data: schema.parse(script.webSearch.answer),
        usage: { ...usage("fake-search"), inputTokens: 42_000, outputTokens: 3_000, webSearches: queries.length },
        resultUrls: script.webSearch.resultUrls ?? [],
      };
    },
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
