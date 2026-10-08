/**
 * Reconciliation: makes the organization's Suscripcion row say what Stripe
 * says. The success page of the checkout, the billing page and the webhook
 * all end here, always from a subscription freshly read from Stripe, so the
 * order in which they run (or how many times) does not matter.
 *
 * An organization has exactly one current row (DFechaFinalizacion IS NULL).
 * A Stripe subscription takes the place of the free base row; when Stripe
 * ends it, the organization gets a new base row, as a new organization does.
 */
import { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import type { BillingGateway, GatewaySubscription } from "./billing-gateway";
import { BILLING_PROVIDER, isValuaxisObject, subscriptionFields } from "./billing-rules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE_PLAN = "BORRADOR";

export type ReconcileResult =
  | { applied: true; organizationId: number; state: string }
  | {
      applied: false;
      reason:
        | "NOT_FOUND"
        | "NOT_VALUAXIS"
        | "UNKNOWN_ORGANIZATION"
        | "CUSTOMER_MISMATCH"
        | "UNKNOWN_PRICE"
        | "ALREADY_ENDED"
        | "SUPERSEDED";
    };

type Ignored = Extract<ReconcileResult, { applied: false }>;
const ignored = (reason: Ignored["reason"]): Ignored => ({ applied: false, reason });

export async function findBillingProvider() {
  return prisma.proveedorPago.findUniqueOrThrow({ where: { SClave: BILLING_PROVIDER } });
}

/** The organization's customer in Stripe, or null before its first checkout. */
export async function findBillingCustomer(organizationId: number) {
  const provider = await findBillingProvider();
  return prisma.clientePago.findUnique({
    where: { IdOrganizacion_IdProveedorPago: { IdOrganizacion: organizationId, IdProveedorPago: provider.IdProveedorPago } },
  });
}

/** The PrecioPlan a Stripe price stands for: by its stored id, or by our tag on a price since replaced. */
async function findPlanPrice(subscription: GatewaySubscription) {
  if (!subscription.priceId) return null;
  const current = await prisma.precioPlan.findFirst({ where: { SIdentificadorExterno: subscription.priceId } });
  if (current) return current;
  const tagged = isValuaxisObject(subscription.priceMetadata) ? subscription.priceMetadata.precio : undefined;
  return tagged && UUID.test(tagged) ? prisma.precioPlan.findUnique({ where: { UIdentificadorPublico: tagged } }) : null;
}

/**
 * Writes one Stripe subscription into the database. It only accepts a
 * subscription tagged as Valuaxis, of a known organization, held by the
 * customer stored for that same organization: an id or a tag alone is never
 * enough to act on an organization.
 */
export async function applySubscription(subscription: GatewaySubscription): Promise<ReconcileResult> {
  if (!isValuaxisObject(subscription.metadata)) return ignored("NOT_VALUAXIS");
  const organizationPublicId = subscription.metadata.organizacion ?? "";
  if (!UUID.test(organizationPublicId)) return ignored("UNKNOWN_ORGANIZATION");
  const organization = await prisma.organizacion.findUnique({ where: { UIdentificadorPublico: organizationPublicId } });
  if (!organization) return ignored("UNKNOWN_ORGANIZATION");
  const customer = await findBillingCustomer(organization.IdOrganizacion);
  if (!customer || customer.SIdentificadorExterno !== subscription.customerId) return ignored("CUSTOMER_MISMATCH");

  const planPrice = await findPlanPrice(subscription);
  const fields = subscriptionFields(subscription);
  const organizationId = organization.IdOrganizacion;

  const outcome = await prisma.$transaction(async (tx) => {
    // One reconciliation at a time per organization: the page and the webhook often arrive together.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${7261}::int, ${organizationId}::int)`;
    const state = await tx.estadoSuscripcion.findUniqueOrThrow({ where: { SClave: fields.state } });
    const existing = await tx.suscripcion.findFirst({
      where: { SProveedorPago: BILLING_PROVIDER, SIdentificadorExterno: subscription.id },
      include: { estadoSuscripcion: true },
    });
    if (existing && existing.IdOrganizacion !== organizationId) return ignored("CUSTOMER_MISMATCH");

    const columns = { ...fields.columns, IdEstadoSuscripcion: state.IdEstadoSuscripcion };
    let previousState: string | null;
    if (existing) {
      previousState = existing.estadoSuscripcion.SClave;
      await tx.suscripcion.update({
        where: { IdSuscripcion: existing.IdSuscripcion },
        data: {
          ...columns,
          ...(planPrice ? { IdPlan: planPrice.IdPlan, IdPrecioPlan: planPrice.IdPrecioPlan } : {}),
          // Once finalized it stays finalized, with the date first recorded.
          DFechaFinalizacion: existing.DFechaFinalizacion ?? (fields.ended ? fields.endedAt ?? new Date() : null),
        },
      });
    } else {
      if (fields.ended) return ignored("ALREADY_ENDED");
      if (!planPrice) return ignored("UNKNOWN_PRICE");
      const current = await tx.suscripcion.findFirst({ where: { IdOrganizacion: organizationId, DFechaFinalizacion: null } });
      // Two live Stripe subscriptions should not exist; if they do, the newest one is the current one.
      if (current?.SProveedorPago === BILLING_PROVIDER && current.DFechaInicio > subscription.startDate) return ignored("SUPERSEDED");
      if (current) {
        await tx.suscripcion.update({ where: { IdSuscripcion: current.IdSuscripcion }, data: { DFechaFinalizacion: new Date() } });
      }
      previousState = null;
      await tx.suscripcion.create({
        data: { ...columns, IdOrganizacion: organizationId, IdPlan: planPrice.IdPlan, IdPrecioPlan: planPrice.IdPrecioPlan },
      });
    }

    if (fields.ended) await ensureBaseSubscription(tx, organizationId);
    return { applied: true as const, organizationId, state: fields.state, previousState };
  });

  if (!outcome.applied) return outcome;
  if (outcome.previousState !== outcome.state) {
    await recordAuditEvent({
      typeKey: outcome.previousState === null ? "CREACION" : "CAMBIO_ESTADO",
      organizationId,
      entity: "Suscripcion",
      entityId: subscription.id,
      action: "BILLING_SUBSCRIPTION_SYNCED",
      result: outcome.state,
      metadata: { previousState: outcome.previousState, stripeStatus: subscription.status },
    });
  }
  return { applied: true, organizationId, state: outcome.state };
}

/** Every organization has a current subscription: without one, the free base plan (as the database trigger gives new organizations). */
async function ensureBaseSubscription(tx: Prisma.TransactionClient, organizationId: number) {
  const current = await tx.suscripcion.findFirst({ where: { IdOrganizacion: organizationId, DFechaFinalizacion: null } });
  if (current) return;
  const [plan, state] = await Promise.all([
    tx.plan.findUniqueOrThrow({ where: { SClave: BASE_PLAN } }),
    tx.estadoSuscripcion.findUniqueOrThrow({ where: { SClave: BASE_PLAN } }),
  ]);
  await tx.suscripcion.create({
    data: { IdOrganizacion: organizationId, IdPlan: plan.IdPlan, IdEstadoSuscripcion: state.IdEstadoSuscripcion },
  });
}

/** Reads the subscription from Stripe and applies it. */
export async function reconcileSubscription(gateway: BillingGateway, subscriptionId: string): Promise<ReconcileResult> {
  const subscription = await gateway.retrieveSubscription(subscriptionId);
  return subscription ? applySubscription(subscription) : ignored("NOT_FOUND");
}

/**
 * The success page: the checkout session named in the URL must be Valuaxis',
 * for this organization and held by this organization's customer. Any other
 * session id (another organization's, the shop's, a made-up one) is not found.
 */
export async function reconcileCheckoutSession(gateway: BillingGateway, organizationId: number, sessionId: string): Promise<ReconcileResult> {
  if (!/^cs_[A-Za-z0-9_]{8,250}$/.test(sessionId)) return ignored("NOT_FOUND");
  const [organization, customer] = await Promise.all([
    prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: organizationId }, select: { UIdentificadorPublico: true } }),
    findBillingCustomer(organizationId),
  ]);
  if (!customer) return ignored("NOT_FOUND");
  const session = await gateway.retrieveCheckoutSession(sessionId);
  if (
    !session ||
    !isValuaxisObject(session.metadata) ||
    session.clientReferenceId !== organization.UIdentificadorPublico ||
    session.customerId !== customer.SIdentificadorExterno ||
    !session.subscriptionId
  ) {
    return ignored("NOT_FOUND");
  }
  const result = await reconcileSubscription(gateway, session.subscriptionId);
  return result.applied && result.organizationId !== organizationId ? ignored("NOT_FOUND") : result;
}

/** Refreshes the organization's current Stripe subscription, if it has one (after the portal, or on opening the billing page). */
export async function refreshOrganizationSubscription(gateway: BillingGateway, organizationId: number): Promise<ReconcileResult | null> {
  const current = await prisma.suscripcion.findFirst({
    where: { IdOrganizacion: organizationId, DFechaFinalizacion: null, SProveedorPago: BILLING_PROVIDER, SIdentificadorExterno: { not: null } },
  });
  if (!current?.SIdentificadorExterno) return null;
  return reconcileSubscription(gateway, current.SIdentificadorExterno);
}
