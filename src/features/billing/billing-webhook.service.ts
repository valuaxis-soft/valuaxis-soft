/**
 * The Stripe webhook. The endpoint has no session and accepts requests from
 * anywhere, so the signature over the raw body is its only authentication.
 *
 * The Stripe account is shared with another business: its events arrive here
 * too. Those are acknowledged and dropped before anything is stored or asked
 * of Stripe. A Valuaxis event is recorded by id (it is processed once) and
 * only triggers a reconciliation: the state always comes from Stripe, never
 * from the event's payload, so late or repeated events cannot roll it back.
 */
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";
import { env } from "@/lib/env";
import { WebhookSignatureError, type BillingGateway } from "./billing-gateway";
import { decideEvent } from "./billing-rules";
import { findBillingProvider, reconcileSubscription } from "./subscription-sync.service";

const MAX_BODY_BYTES = 1_000_000;

export type WebhookResponse = { status: number; body: Record<string, unknown> };

export async function handleStripeWebhook(
  input: { rawBody: string; signature: string | null },
  gateway: BillingGateway | null,
  secret = env.STRIPE_WEBHOOK_SECRET?.trim(),
): Promise<WebhookResponse> {
  // Not configured: nothing can be verified, so nothing is accepted. Stripe retries later.
  if (!gateway || !secret) return { status: 503, body: { error: "Webhook no configurado." } };
  if (!input.signature) return { status: 400, body: { error: "Firma requerida." } };
  if (Buffer.byteLength(input.rawBody, "utf8") > MAX_BODY_BYTES) return { status: 413, body: { error: "Contenido demasiado grande." } };

  let event;
  try {
    event = gateway.constructEvent(input.rawBody, input.signature, secret);
  } catch (error) {
    if (!(error instanceof WebhookSignatureError)) console.warn("[STRIPE_WEBHOOK] Unreadable event", error);
    return { status: 400, body: { error: "Firma no válida." } };
  }

  const decision = decideEvent(event);
  if (decision.action === "ignore") return { status: 200, body: { received: true, ignored: decision.reason } };

  const provider = await findBillingProvider();
  const key = { IdProveedorPago: provider.IdProveedorPago, SIdentificadorEvento: event.id };
  let record = await prisma.eventoWebhookPago.findUnique({ where: { IdProveedorPago_SIdentificadorEvento: key } });
  if (!record) {
    try {
      record = await prisma.eventoWebhookPago.create({
        data: {
          ...key,
          STipoEvento: event.type,
          SHashPayload: createHash("sha256").update(input.rawBody).digest("hex"),
          // Ids only: no customer data is copied out of Stripe.
          JPayloadSanitizado: { object: event.objectId, subscription: decision.subscriptionId, livemode: event.livemode },
          BVerificado: true,
        },
      });
    } catch (error) {
      // The same event delivered twice at once: the other request owns it.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      return { status: 200, body: { received: true, duplicate: true } };
    }
  }
  if (record.BProcesado) return { status: 200, body: { received: true, duplicate: true } };

  const processed = { IIntentosProcesamiento: { increment: 1 } };
  try {
    const result = await reconcileSubscription(gateway, decision.subscriptionId);
    await prisma.eventoWebhookPago.update({
      where: { IdEventoWebhookPago: record.IdEventoWebhookPago },
      data: { ...processed, BProcesado: true, DFechaProcesamiento: new Date(), SMensajeError: result.applied ? null : result.reason },
    });
    return { status: 200, body: { received: true, ...(result.applied ? { state: result.state } : { ignored: result.reason }) } };
  } catch (error) {
    console.error(`[STRIPE_WEBHOOK] ${event.type} ${event.id} failed`, error);
    await prisma.eventoWebhookPago.update({
      where: { IdEventoWebhookPago: record.IdEventoWebhookPago },
      data: { ...processed, SMensajeError: error instanceof Error ? error.message.slice(0, 2000) : "Unknown error" },
    });
    // Not processed: Stripe delivers it again.
    return { status: 500, body: { error: "No se pudo procesar el evento." } };
  }
}
