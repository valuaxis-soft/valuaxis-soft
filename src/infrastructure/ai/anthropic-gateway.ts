/**
 * The only module that imports the Anthropic SDK. It sends one prompt and
 * returns plain objects: the validated answer and the tokens billed. It never
 * logs the prompt or the answer.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { AiGatewayError, type AiGateway, type AiPrompt, type AiUsage } from "@/features/ai/ai-gateway";

/** Extraction is a small, fast task: the cheapest current model. */
export const DEFAULT_EXTRACTION_MODEL = "claude-haiku-4-5";
/** Prose in the register of an appraisal report, at low effort. */
export const DEFAULT_DRAFTING_MODEL = "claude-opus-5-5";

const EXTRACTION_TIMEOUT_MS = 30_000;
const DRAFTING_TIMEOUT_MS = 45_000;
/** The SDK retries rate limits, overloads and connection errors; once is enough for a person waiting. */
const MAX_RETRIES = 1;
const EXTRACTION_MAX_TOKENS = 2048;
/** Thinking counts toward the limit on models that always think. */
const DRAFTING_MAX_TOKENS = 4096;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Haiku 4.5 rejects `effort`; every other current model takes it. */
const takesEffort = (model: string) => !model.startsWith("claude-haiku");
/** Models whose safety classifiers may decline a request, and that can retry it on another model. */
const takesFallbacks = (model: string) => /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);

function toUsage(model: string, usage: Anthropic.Usage | Anthropic.Beta.BetaUsage): AiUsage {
  return {
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

/** The provider's failure as the user must read it. Unknown errors keep going up, to be logged. */
function translate(error: unknown): unknown {
  if (error instanceof AiGatewayError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new AiGatewayError("timeout");
  if (error instanceof Anthropic.APIConnectionError) return new AiGatewayError("unavailable");
  if (error instanceof Anthropic.RateLimitError) return new AiGatewayError("rate_limit");
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError || error instanceof Anthropic.NotFoundError) {
    return new AiGatewayError("configuration");
  }
  if (error instanceof Anthropic.APIError) {
    if (error.status === 402 || error.type === "billing_error") return new AiGatewayError("no_credit");
    if (error.status === 529 || error.type === "overloaded_error") return new AiGatewayError("overloaded");
    if (typeof error.status === "number" && error.status >= 500) return new AiGatewayError("unavailable");
  }
  return error;
}

function assertCompleted(stopReason: string | null) {
  if (stopReason === "refusal") throw new AiGatewayError("refused");
  if (stopReason === "max_tokens") throw new AiGatewayError("invalid_output");
}

const system = (text: string) => [{ type: "text" as const, text, cache_control: { type: "ephemeral" as const } }];

export function createAnthropicGateway(options: { apiKey: string; extractionModel?: string; draftingModel?: string }): AiGateway {
  const client = new Anthropic({ apiKey: options.apiKey, maxRetries: MAX_RETRIES });
  const extractionModel = options.extractionModel ?? DEFAULT_EXTRACTION_MODEL;
  const draftingModel = options.draftingModel ?? DEFAULT_DRAFTING_MODEL;

  return {
    async extract<T>(prompt: AiPrompt, schema: z.ZodType<T>) {
      try {
        const response = await client.messages.parse({
          model: extractionModel,
          max_tokens: EXTRACTION_MAX_TOKENS,
          system: system(prompt.system),
          messages: [{ role: "user", content: prompt.user }],
          output_config: { format: zodOutputFormat(schema), ...(takesEffort(extractionModel) ? { effort: "low" as const } : {}) },
        }, { timeout: EXTRACTION_TIMEOUT_MS });
        assertCompleted(response.stop_reason);
        if (response.parsed_output === null) throw new AiGatewayError("invalid_output");
        return { data: response.parsed_output as T, usage: toUsage(response.model, response.usage) };
      } catch (error) {
        throw translate(error);
      }
    },

    async write(prompt: AiPrompt) {
      try {
        const request = {
          model: draftingModel,
          max_tokens: DRAFTING_MAX_TOKENS,
          system: system(prompt.system),
          messages: [{ role: "user" as const, content: prompt.user }],
          ...(takesEffort(draftingModel) ? { output_config: { effort: "low" as const } } : {}),
        };
        const response = takesFallbacks(draftingModel)
          // A declined request is retried on the model Anthropic recommends, inside the same call.
          ? await client.beta.messages.create({ ...request, betas: [FALLBACK_BETA], fallbacks: "default" }, { timeout: DRAFTING_TIMEOUT_MS })
          : await client.messages.create(request, { timeout: DRAFTING_TIMEOUT_MS });
        assertCompleted(response.stop_reason);
        const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("").trim();
        if (!text) throw new AiGatewayError("invalid_output");
        return { text, usage: toUsage(response.model, response.usage) };
      } catch (error) {
        throw translate(error);
      }
    },
  };
}
