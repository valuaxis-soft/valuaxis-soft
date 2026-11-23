/**
 * The only module that imports the Anthropic SDK. It sends one prompt and
 * returns plain objects: the validated answer and the tokens billed. It never
 * logs the prompt or the answer.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { AiGatewayError, type AiGateway, type AiPrompt, type AiUsage, type AiWebSearchOptions } from "@/features/ai/ai-gateway";

/** Extraction is a small, fast task: the cheapest current model. */
export const DEFAULT_EXTRACTION_MODEL = "claude-haiku-4-5";
/** Prose in the register of an appraisal report, at low effort. */
export const DEFAULT_DRAFTING_MODEL = "claude-opus-5-5";
/**
 * Searching listings on the web and reading them without inventing: the
 * current Opus, which runs the provider's web search with dynamic filtering.
 */
export const DEFAULT_LISTING_SEARCH_MODEL = "claude-opus-5-5";

const EXTRACTION_TIMEOUT_MS = 30_000;
const DRAFTING_TIMEOUT_MS = 45_000;
/** The SDK retries rate limits, overloads and connection errors; once is enough for a person waiting. */
const MAX_RETRIES = 1;
const EXTRACTION_MAX_TOKENS = 2048;
/** Thinking counts toward the limit on models that always think. */
const DRAFTING_MAX_TOKENS = 4096;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** A ceiling of cost for one search, thinking included; the answer itself is a few thousand tokens. */
const SEARCH_MAX_TOKENS = 32_000;
/** Times a search paused by the provider (`pause_turn`) or ended without its answer is sent back. */
const SEARCH_MAX_CONTINUATIONS = 3;
/** The client tool the model answers a web search with: its input is the answer, held to the schema. */
const REPORT_TOOL = "report_results";

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

function addUsage(total: AiUsage, usage: Anthropic.Beta.BetaUsage): AiUsage {
  return {
    model: total.model,
    inputTokens: total.inputTokens + usage.input_tokens,
    outputTokens: total.outputTokens + usage.output_tokens,
    cacheReadTokens: total.cacheReadTokens + (usage.cache_read_input_tokens ?? 0),
    cacheWriteTokens: total.cacheWriteTokens + (usage.cache_creation_input_tokens ?? 0),
    webSearches: (total.webSearches ?? 0) + (usage.server_tool_use?.web_search_requests ?? 0),
  };
}

const system = (text: string) => [{ type: "text" as const, text, cache_control: { type: "ephemeral" as const } }];

export function createAnthropicGateway(options: { apiKey: string; extractionModel?: string; draftingModel?: string; searchModel?: string }): AiGateway {
  const client = new Anthropic({ apiKey: options.apiKey, maxRetries: MAX_RETRIES });
  const extractionModel = options.extractionModel ?? DEFAULT_EXTRACTION_MODEL;
  const draftingModel = options.draftingModel ?? DEFAULT_DRAFTING_MODEL;
  const searchModel = options.searchModel ?? DEFAULT_LISTING_SEARCH_MODEL;

  return {
    async searchWeb<T>(prompt: AiPrompt, schema: z.ZodType<T>, search: AiWebSearchOptions) {
      // The SDK's time limit ends at the first byte of a stream: the whole search is timed here.
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, search.timeoutMs);
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt.user }];
      const resultUrls = new Set<string>();
      let usage: AiUsage = { model: searchModel, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0 };
      let searches = 0;
      // The provider counts the direct searches of a resumed turn itself; those run from its code execution it does not.
      let filteredSearches = 0;
      let reminded = false;
      try {
        for (let turn = 0; turn <= SEARCH_MAX_CONTINUATIONS; turn += 1) {
          const stream = client.beta.messages.stream({
            model: searchModel,
            max_tokens: SEARCH_MAX_TOKENS,
            system: system(`${prompt.system}\n\nAl terminar de buscar, entrega el resultado llamando una sola vez a la herramienta ${REPORT_TOOL}. No lo escribas como texto.`),
            messages,
            tools: [
              {
                type: "web_search_20260209",
                name: "web_search",
                max_uses: Math.max(1, search.maxSearches - filteredSearches),
                user_location: { type: "approximate", country: "MX", timezone: "America/Mexico_City" },
              },
              {
                name: REPORT_TOOL,
                description: "Entrega el resultado final de la búsqueda. Se llama una sola vez, al terminar de buscar.",
                strict: true,
                input_schema: zodOutputFormat(schema).schema as Anthropic.Beta.BetaTool.InputSchema,
              },
            ],
            // Forced tool use is rejected by this model family: the instructions name the tool.
            tool_choice: { type: "auto" },
            output_config: { effort: "medium" },
            ...(takesFallbacks(searchModel) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
          }, { signal: controller.signal });
          stream.on("contentBlock", (block) => {
            if (block.type === "server_tool_use" && block.name === "web_search") {
              searches += 1;
              if (block.caller && block.caller.type !== "direct") filteredSearches += 1;
              const query = (block.input as { query?: unknown } | null)?.query;
              search.onProgress?.({ searches, query: typeof query === "string" ? query : null });
            }
            // An error of the search comes as an object in place of the list of results.
            if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
              for (const result of block.content) resultUrls.add(result.url);
            }
          });
          const message = await stream.finalMessage();
          usage = addUsage({ ...usage, model: message.model }, message.usage);
          if (message.stop_reason === "refusal") throw new AiGatewayError("refused");
          if (message.stop_reason === "max_tokens") throw new AiGatewayError("invalid_output");
          const report = message.content.find((block) => block.type === "tool_use" && block.name === REPORT_TOOL);
          if (report?.type === "tool_use") {
            const parsed = schema.safeParse(report.input);
            if (!parsed.success) throw new AiGatewayError("invalid_output");
            return { data: parsed.data, usage, resultUrls: [...resultUrls] };
          }
          messages.push({ role: "assistant", content: message.content });
          // A paused turn is resumed by sending it back as it came, with nothing added.
          if (message.stop_reason === "pause_turn") continue;
          if (reminded) break;
          reminded = true;
          messages.push({ role: "user", content: `Entrega ahora el resultado con la herramienta ${REPORT_TOOL}, solo con lo que ya encontraste. No busques más.` });
        }
        throw new AiGatewayError("invalid_output");
      } catch (error) {
        if (timedOut) throw new AiGatewayError("timeout");
        // A request the provider rejects: web search turned off in the organization's console, or a model without it.
        if (error instanceof Anthropic.BadRequestError) {
          console.warn(`[AI] web search rejected by the provider: ${error.message}`);
          throw new AiGatewayError("configuration");
        }
        throw translate(error);
      } finally {
        clearTimeout(timer);
      }
    },

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
