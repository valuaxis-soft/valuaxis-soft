/**
 * The assisted features as the API uses them. Both run only for a valuation
 * of the user's organization that is not concluded, and both return a draft:
 * nothing here writes to the valuation. What is recorded of each call is who
 * made it and what it cost, never the text sent or received.
 */
import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { findValuation } from "@/features/valuations/calculation/access";
import { ValuationWorkflowError } from "@/features/valuations/services/valuation-workflow/errors";
import { prisma } from "@/infrastructure/database/prisma-client";
import { consumeAiRateLimit } from "@/security/rate-limit/ai-limit";
import { AiGatewayError, type AiGateway, type AiUsage } from "./ai-gateway";
import { getAiGateway } from "./ai-gateway-provider";
import { DRAFT_TOO_LITTLE_DATA, DraftRejectedError, hasEnoughFacts, usableFacts, writeDraft, type DraftInput } from "./draft-writing";
import { countProposed, extractListing, LISTING_TEXT_MIN, type ListingProposal } from "./listing-extraction";

export const AI_NOT_ENABLED = "La asistencia con IA no está habilitada en esta instalación.";

/** A failure of the assisted features the user can read, with its HTTP status. */
export class AiAssistError extends Error {
  constructor(message: string, readonly status: 422 | 429 | 503, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "AiAssistError";
  }
}

export type AiFeature = "LISTING_EXTRACT" | "DRAFT_WRITE";
type RequestOrigin = { ip: string | null; userAgent: string | null };

/** Not found for another organization's valuation; a concluded one is not assisted. */
async function assertEditableValuation(publicId: string, user: Pick<AuthUser, "organizationId">) {
  const avaluo = await findValuation(prisma, publicId, user.organizationId);
  if (avaluo.BBloqueado) throw new ValuationWorkflowError("El avalúo está concluido; reábrelo para editarlo.", 409);
}

/** The provider, once the call is allowed: enabled, and within the limits of the user and the firm. */
async function gatewayFor(user: Pick<AuthUser, "id" | "organizationId">): Promise<AiGateway> {
  const gateway = await getAiGateway();
  if (!gateway) throw new AiAssistError(AI_NOT_ENABLED, 503);
  const limit = consumeAiRateLimit(user);
  if (!limit.allowed) {
    throw new AiAssistError("Llegaste al límite de solicitudes de IA por ahora. Espera un momento antes de volver a intentarlo.", 429, limit.retryAfterSeconds);
  }
  return gateway;
}

const total = (usage: AiUsage[], key: "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens") =>
  usage.reduce((sum, item) => sum + item[key], 0);

/** Who used which feature and what it cost. Sizes and counts only: no pasted text, no data, no answer. */
function recordUsage(input: {
  feature: AiFeature;
  publicId: string;
  user: Pick<AuthUser, "id" | "organizationId">;
  origin: RequestOrigin;
  usage: AiUsage[];
  result: "EXITOSO" | "RECHAZADO";
  detail: Record<string, number>;
}) {
  if (!input.usage.length) return Promise.resolve(null);
  return recordAuditEvent({
    typeKey: "EXPORTACION",
    organizationId: input.user.organizationId,
    userId: input.user.id,
    entity: "Avaluo",
    entityId: input.publicId,
    action: `AI_${input.feature}`,
    result: input.result,
    ip: input.origin.ip,
    userAgent: input.origin.userAgent,
    metadata: {
      model: input.usage[0].model,
      calls: input.usage.length,
      inputTokens: total(input.usage, "inputTokens"),
      outputTokens: total(input.usage, "outputTokens"),
      cacheReadTokens: total(input.usage, "cacheReadTokens"),
      cacheWriteTokens: total(input.usage, "cacheWriteTokens"),
      ...input.detail,
    },
  });
}

function logFailure(feature: AiFeature, error: unknown) {
  if (error instanceof AiGatewayError) console.warn(`[AI] ${feature} failed: ${error.kind}`);
}

/** The facts of a pasted listing, proposed for the comparable form. */
export async function proposeComparableFromListing(
  publicId: string,
  user: AuthUser,
  input: { text: string; url: string | null },
  origin: RequestOrigin,
): Promise<ListingProposal> {
  await assertEditableValuation(publicId, user);
  if (input.text.trim().length < LISTING_TEXT_MIN) {
    throw new AiAssistError(`El texto es muy corto para ser un anuncio: pega al menos ${LISTING_TEXT_MIN} caracteres.`, 422);
  }
  const gateway = await gatewayFor(user);
  try {
    const { proposal, usage } = await extractListing(gateway, input);
    await recordUsage({
      feature: "LISTING_EXTRACT", publicId, user, origin, usage: [usage], result: "EXITOSO",
      detail: { characters: input.text.length, proposed: countProposed(proposal), discarded: proposal.discarded.length },
    });
    return proposal;
  } catch (error) {
    logFailure("LISTING_EXTRACT", error);
    throw error;
  }
}

/** A paragraph for a descriptive field, from the data already captured in that part of the valuation. */
export async function draftDescriptiveText(
  publicId: string,
  user: AuthUser,
  input: DraftInput,
  origin: RequestOrigin,
): Promise<{ text: string }> {
  await assertEditableValuation(publicId, user);
  if (!hasEnoughFacts(input.facts)) throw new AiAssistError(DRAFT_TOO_LITTLE_DATA, 422);
  const gateway = await gatewayFor(user);
  const detail = { facts: usableFacts(input.facts).length };
  try {
    const { text, usage, attempts } = await writeDraft(gateway, input);
    await recordUsage({ feature: "DRAFT_WRITE", publicId, user, origin, usage, result: "EXITOSO", detail: { ...detail, attempts, characters: text.length } });
    return { text };
  } catch (error) {
    if (error instanceof DraftRejectedError) {
      await recordUsage({ feature: "DRAFT_WRITE", publicId, user, origin, usage: error.usage, result: "RECHAZADO", detail: { ...detail, attempts: error.usage.length } });
      throw new AiAssistError(error.message, 422);
    }
    logFailure("DRAFT_WRITE", error);
    throw error;
  }
}
