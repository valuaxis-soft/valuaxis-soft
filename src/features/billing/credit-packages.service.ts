/**
 * Credit packages: what an organization can buy (PaqueteCreditos rows), their
 * mirror in Stripe (one Product and one one-time Price each), the hosted
 * Checkout in payment mode, and the reconciliation that credits the ledger
 * from the paid session. As with subscriptions, the success page and the
 * webhook both reconcile from the session as Stripe has it, and the ledger
 * credits a session once whichever comes first.
 */
import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import { buildPublicAppUrl } from "@/lib/public-url";
import { ForeignStripeObjectError } from "./billing-catalog.service";
import { ensureCustomer } from "./billing-customer.service";
import { BillingError, requireGateway } from "./billing-errors";
import type { BillingGateway, GatewayCheckoutSession, GatewayPrice } from "./billing-gateway";
import {
  BILLING_CURRENCY,
  BILLING_PAGE_PATH,
  BILLING_PROVIDER,
  BILLING_STATEMENT_DESCRIPTOR,
  isValuaxisObject,
  priceSyncDecision,
  valuaxisMetadata,
  type DesiredPrice,
} from "./billing-rules";
import { MAX_PURCHASE_QUANTITY, packagePricing, purchaseTotals, stripePackageLookupKey, stripePackageProductId } from "./credit-rules";
import { PAYMENT_METHODS, creditPurchase, paymentMethodLabel, type PaymentMethod, type PurchaseRecord } from "./credits.service";
import { findBillingCustomer } from "./subscription-sync.service";
import { getUnitPrice } from "./unit-price.service";
import { getEmailService } from "@/infrastructure/email/email.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function findSellablePackages(options: { packageId?: number } = {}) {
  return prisma.paqueteCreditos.findMany({
    where: { BActivo: true, BEsPublico: true, SMoneda: BILLING_CURRENCY, ...(options.packageId ? { IdPaqueteCreditos: options.packageId } : {}) },
    orderBy: [{ IOrden: "asc" }, { ICreditos: "asc" }, { IdPaqueteCreditos: "asc" }],
  });
}

export type PackageSyncReport = Array<{ package: string; productId: string; priceId: string; action: "created" | "replaced" | "unchanged" }>;

/**
 * Makes Stripe match the sellable packages: a Product and a one-time Price
 * per package, the price id stored in SIdentificadorExterno. Idempotent, and
 * a Price is never edited: a changed amount creates a new one and archives
 * the old one.
 */
export async function syncCreditPackages(gateway: BillingGateway, options: { packageId?: number } = {}): Promise<PackageSyncReport> {
  const report: PackageSyncReport = [];
  for (const pkg of await findSellablePackages(options)) {
    const productId = stripePackageProductId(pkg.UIdentificadorPublico);
    const wanted = { name: pkg.SNombre, description: pkg.SDescripcion?.trim() || null, statementDescriptor: BILLING_STATEMENT_DESCRIPTOR };
    const product = await gateway.retrieveProduct(productId);
    if (!product) {
      await gateway.createProduct({ id: productId, ...wanted, metadata: valuaxisMetadata({ paquete: pkg.SClave, creditos: String(pkg.ICreditos) }) });
    } else {
      if (!isValuaxisObject(product.metadata)) throw new ForeignStripeObjectError("product", productId);
      const same =
        product.active && product.name === wanted.name && product.description === wanted.description && product.statementDescriptor === wanted.statementDescriptor;
      if (!same) await gateway.updateProduct(productId, { ...wanted, active: true });
    }

    const desired: DesiredPrice = {
      productId,
      currency: pkg.SMoneda.toLowerCase(),
      unitAmount: packagePricing(pkg).unitAmount,
      interval: null,
      intervalCount: null,
    };
    const lookupKey = stripePackageLookupKey(pkg.UIdentificadorPublico);
    let existing: GatewayPrice | null = pkg.SIdentificadorExterno ? await gateway.retrievePrice(pkg.SIdentificadorExterno) : null;
    existing ??= await gateway.findPriceByLookupKey(lookupKey);
    if (existing && !isValuaxisObject(existing.metadata)) throw new ForeignStripeObjectError("price", existing.id);

    const decision = priceSyncDecision(existing && existing.unitAmount !== null ? { ...existing, unitAmount: existing.unitAmount } : null, desired);
    let priceId = existing?.id ?? "";
    if (decision !== "keep") {
      const created = await gateway.createPrice({
        ...desired,
        lookupKey,
        nickname: `${pkg.SNombre} (${pkg.ICreditos} ${pkg.ICreditos === 1 ? "avalúo" : "avalúos"})`,
        metadata: valuaxisMetadata({
          paquete: pkg.UIdentificadorPublico,
          creditos: String(pkg.ICreditos),
          importe: pkg.NImporte.toFixed(2),
          impuesto_porcentaje: pkg.NImpuestoPorcentaje.toString(),
        }),
      });
      if (existing?.active) await gateway.archivePrice(existing.id);
      priceId = created.id;
    }
    if (pkg.SIdentificadorExterno !== priceId) {
      await prisma.paqueteCreditos.update({ where: { IdPaqueteCreditos: pkg.IdPaqueteCreditos }, data: { SIdentificadorExterno: priceId } });
    }
    report.push({ package: pkg.SClave, productId, priceId, action: !existing ? "created" : decision === "keep" ? "unchanged" : "replaced" });
  }
  return report;
}

/**
 * A hosted Checkout in payment mode for `quantity` units of one package. The
 * page only sells the unit package (startUnitPurchase); the session's tags
 * record the credits, the quantity and the unit price shown.
 */
export async function startPackageCheckout(user: AuthUser, packagePublicId: string, gatewayOrNull: BillingGateway | null, quantity = 1): Promise<{ url: string }> {
  const gateway = requireGateway(gatewayOrNull);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PURCHASE_QUANTITY) throw new BillingError(400, `Puedes comprar de 1 a ${MAX_PURCHASE_QUANTITY} avalúos por pago.`);
  const found = await prisma.paqueteCreditos.findUnique({ where: { UIdentificadorPublico: packagePublicId } });
  const pkg = found && (await findSellablePackages({ packageId: found.IdPaqueteCreditos }))[0];
  if (!pkg) throw new BillingError(404, "El precio elegido ya no está disponible. Vuelve a cargar la página.");

  const { organization, customerId } = await ensureCustomer(gateway, user);
  await syncCreditPackages(gateway, { packageId: pkg.IdPaqueteCreditos });
  const synced = await prisma.paqueteCreditos.findUniqueOrThrow({ where: { IdPaqueteCreditos: pkg.IdPaqueteCreditos } });
  if (!synced.SIdentificadorExterno) throw new Error(`Package ${pkg.SClave} has no Stripe price after the catalog sync.`);

  const credits = pkg.ICreditos * quantity;
  const unitTotal = packagePricing(synced).total;
  const page = buildPublicAppUrl(BILLING_PAGE_PATH).toString();
  const session = await gateway.createPaymentCheckoutSession({
    customerId,
    priceId: synced.SIdentificadorExterno,
    quantity,
    clientReferenceId: organization.UIdentificadorPublico,
    description: `Valuaxis Soft: ${credits} ${credits === 1 ? "Avalúo Disponible" : "Avalúos Disponibles"}`,
    // Stripe replaces the placeholder; the page reconciles with that session.
    successUrl: `${page}?compra=exito&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${page}?compra=cancelado`,
    metadata: valuaxisMetadata({
      organizacion: organization.UIdentificadorPublico,
      paquete: pkg.UIdentificadorPublico,
      creditos: String(credits),
      cantidad: String(quantity),
      precio_unitario: unitTotal.toFixed(2),
    }),
  });
  if (!session.url) throw new Error(`Checkout session ${session.id} has no URL.`);

  await recordAuditEvent({
    typeKey: "CREACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "MovimientoCreditos",
    entityId: session.id,
    action: "BILLING_PACKAGE_CHECKOUT_STARTED",
    metadata: { package: pkg.SClave, credits, quantity, unitPrice: unitTotal },
  });
  return { url: session.url };
}

/**
 * «Pagar con tarjeta»: `quantity` Avalúos Disponibles at the current unit
 * price (commercial policies 1.2 and 3.1: by unit, no packages). A price
 * change whose date arrived applies first, so the charge is the price shown.
 */
export async function startUnitPurchase(user: AuthUser, quantity: number, gatewayOrNull: BillingGateway | null): Promise<{ url: string }> {
  requireGateway(gatewayOrNull);
  const unit = await getUnitPrice();
  if (!unit) throw new BillingError(404, "Todavía no hay precio por avalúo publicado.");
  return startPackageCheckout(user, unit.UIdentificadorPublico, gatewayOrNull, quantity);
}

export type PurchaseReconcileResult =
  | { applied: true; organizationId: number; credits: number; credited: boolean; balance: number }
  | { applied: false; reason: "NOT_FOUND" | "NOT_VALUAXIS" | "NOT_PACKAGE" | "UNKNOWN_ORGANIZATION" | "CUSTOMER_MISMATCH" | "UNKNOWN_PACKAGE" | "NOT_PAID" };

type Ignored = Extract<PurchaseReconcileResult, { applied: false }>;
const ignored = (reason: Ignored["reason"]): Ignored => ({ applied: false, reason });

/**
 * Credits the ledger from a paid payment-mode session. Like a subscription,
 * it only accepts a session tagged as Valuaxis, of a known organization,
 * held by the customer stored for that same organization, for a package we
 * know; an unpaid session (a delayed payment method) is left for the
 * async_payment_succeeded event.
 */
export async function applyPackagePurchase(session: GatewayCheckoutSession): Promise<PurchaseReconcileResult> {
  if (!isValuaxisObject(session.metadata)) return ignored("NOT_VALUAXIS");
  if (session.mode !== "payment" || session.subscriptionId) return ignored("NOT_PACKAGE");
  const organizationPublicId = session.metadata.organizacion ?? "";
  const packagePublicId = session.metadata.paquete ?? "";
  if (!UUID.test(organizationPublicId) || session.clientReferenceId !== organizationPublicId) return ignored("UNKNOWN_ORGANIZATION");
  if (!UUID.test(packagePublicId)) return ignored("UNKNOWN_PACKAGE");
  const organization = await prisma.organizacion.findUnique({ where: { UIdentificadorPublico: organizationPublicId }, select: { IdOrganizacion: true } });
  if (!organization) return ignored("UNKNOWN_ORGANIZATION");
  const customer = await findBillingCustomer(organization.IdOrganizacion);
  if (!customer || customer.SIdentificadorExterno !== session.customerId) return ignored("CUSTOMER_MISMATCH");
  const pkg = await prisma.paqueteCreditos.findUnique({ where: { UIdentificadorPublico: packagePublicId } });
  if (!pkg) return ignored("UNKNOWN_PACKAGE");
  if (session.paymentStatus !== "paid") return ignored("NOT_PAID");

  // What was sold is what the session says; the row's credits only if the tag is unusable.
  const tagged = Number(session.metadata.creditos);
  const credits = Number.isInteger(tagged) && tagged > 0 ? tagged : pkg.ICreditos;
  const amount = session.amountTotal !== null ? session.amountTotal / 100 : 0;
  // The unit price shown at checkout; a session from before it was tagged divides what was charged.
  const taggedUnit = Number(session.metadata.precio_unitario);
  const purchase: PurchaseRecord = {
    quantity: credits,
    unitPrice: Number.isFinite(taggedUnit) && taggedUnit > 0 ? taggedUnit : Math.round((amount / credits) * 100) / 100,
    amount,
    method: PAYMENT_METHODS.card,
  };
  const result = await creditPurchase({
    organizationId: organization.IdOrganizacion,
    packageId: pkg.IdPaqueteCreditos,
    credits,
    provider: BILLING_PROVIDER,
    reference: session.id,
    description: `Compra de ${credits} ${credits === 1 ? "avalúo disponible" : "avalúos disponibles"} con tarjeta`,
    purchase,
    metadata: { stripe: { session: session.id, paymentIntent: session.paymentIntentId, amountTotal: session.amountTotal } },
  });
  if (result.credited) {
    await recordAuditEvent({
      typeKey: "CREACION",
      organizationId: organization.IdOrganizacion,
      entity: "MovimientoCreditos",
      entityId: session.id,
      action: "BILLING_CREDITS_PURCHASED",
      metadata: { package: pkg.SClave, credits, amount, balance: result.balance },
    });
    await sendPurchaseConfirmation({ organizationId: organization.IdOrganizacion, credits, purchase, reference: session.id, balance: result.balance });
  }
  return { applied: true, organizationId: organization.IdOrganizacion, credits, ...result };
}

/**
 * Reads the session from Stripe and credits it. From the success page,
 * `organizationId` is the signed-in organization: any other session (another
 * organization's, the shop's, a made-up id) is not found.
 */
export async function reconcilePackageCheckout(gateway: BillingGateway, sessionId: string, options: { organizationId?: number } = {}): Promise<PurchaseReconcileResult> {
  if (!/^cs_[A-Za-z0-9_]{8,250}$/.test(sessionId)) return ignored("NOT_FOUND");
  const session = await gateway.retrieveCheckoutSession(sessionId);
  if (!session) return ignored("NOT_FOUND");
  if (options.organizationId !== undefined) {
    const organization = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: options.organizationId }, select: { UIdentificadorPublico: true } });
    if (!isValuaxisObject(session.metadata) || session.metadata.organizacion !== organization.UIdentificadorPublico) return ignored("NOT_FOUND");
  }
  const result = await applyPackagePurchase(session);
  return result.applied && options.organizationId !== undefined && result.organizationId !== options.organizationId ? ignored("NOT_FOUND") : result;
}

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dateTimeInMexico = (date: Date) =>
  date.toLocaleString("es-MX", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });

/** Who hears about a purchase: the organization's email, or its owner's. */
async function purchaseRecipient(organizationId: number) {
  const organization = await prisma.organizacion.findUniqueOrThrow({
    where: { IdOrganizacion: organizationId },
    select: { SNombre: true, SCorreo: true, usuarioPropietario: { select: { SCorreo: true } } },
  });
  return { name: organization.SNombre, email: organization.SCorreo?.trim() || organization.usuarioPropietario?.SCorreo || null };
}

/**
 * The confirmation of a purchase by email, with the resulting balance
 * (matrix 1.8; the screen shows it on return from Stripe). Sent once, by
 * whoever credited the payment; a failure is logged and never undoes the
 * purchase. Each one sent is audited with its recipient and date.
 */
async function sendPurchaseConfirmation(input: { organizationId: number; credits: number; purchase: PurchaseRecord; reference: string; balance: number }) {
  try {
    const recipient = await purchaseRecipient(input.organizationId);
    if (!recipient.email) return false;
    const plural = input.credits === 1 ? "avalúo disponible" : "avalúos disponibles";
    await getEmailService().sendBillingNotice({
      to: recipient.email,
      subject: "Confirmación de tu compra en Valuaxis Soft",
      greeting: `Hola, ${recipient.name}:`,
      lines: [
        `Recibimos tu pago y abonamos ${input.credits} ${plural} a tu saldo.`,
        `Tu saldo es de ${input.balance} ${input.balance === 1 ? "avalúo disponible" : "avalúos disponibles"}. Los avalúos disponibles pagados no vencen.`,
      ],
      details: [
        { label: "Avalúos comprados", value: String(input.purchase.quantity) },
        { label: "Precio por avalúo", value: `${money.format(input.purchase.unitPrice)} (IVA incluido)` },
        { label: "Total pagado", value: `${money.format(input.purchase.amount)} MXN (IVA incluido, sin comisiones)` },
        { label: "Forma de pago", value: paymentMethodLabel(input.purchase.method) },
        { label: "Referencia", value: input.reference },
        { label: "Fecha", value: dateTimeInMexico(new Date()) },
      ],
      link: { label: "Ver tu saldo en Plan y facturación", url: buildPublicAppUrl(BILLING_PAGE_PATH).toString() },
    });
    await recordAuditEvent({
      typeKey: "CREACION",
      organizationId: input.organizationId,
      entity: "MovimientoCreditos",
      entityId: input.reference,
      action: "BILLING_PURCHASE_CONFIRMATION_SENT",
      metadata: { to: recipient.email, sentAt: new Date().toISOString(), credits: input.credits, balance: input.balance },
    });
    return true;
  } catch (error) {
    console.error("[BILLING_PURCHASE_CONFIRMATION]", { organizationId: input.organizationId, reference: input.reference }, error);
    return false;
  }
}

/**
 * A transfer or cash deposit the operator confirmed in the bank (commercial
 * policies 5.1), from `pnpm billing:credits payment`: the Avalúos Disponibles
 * at the current unit price, once per (method, reference), and the same
 * confirmation email as a card purchase.
 */
export async function recordOfflinePayment(input: { organizationId: number; credits: number; method: Exclude<PaymentMethod, "TARJETA">; reference: string; userId?: number | null }) {
  if (!Number.isInteger(input.credits) || input.credits < 1) throw new Error("Los avalúos deben ser un entero positivo.");
  const reference = input.reference.trim();
  if (!reference) throw new Error("Falta la referencia del pago (folio o número de operación).");
  if (input.method !== PAYMENT_METHODS.transfer && input.method !== PAYMENT_METHODS.deposit) throw new Error("La forma de pago es TRANSFERENCIA o DEPOSITO.");
  const unit = await getUnitPrice();
  if (!unit) throw new Error("No hay precio por avalúo publicado (pnpm billing:set-unit-price).");
  const totals = purchaseTotals(packagePricing(unit), input.credits);
  const purchase: PurchaseRecord = { quantity: input.credits, unitPrice: totals.unitTotal, amount: totals.total, method: input.method };
  const result = await creditPurchase({
    organizationId: input.organizationId,
    packageId: unit.IdPaqueteCreditos,
    credits: input.credits,
    provider: input.method,
    reference,
    description: `Compra de ${input.credits} ${input.credits === 1 ? "avalúo disponible" : "avalúos disponibles"} por ${paymentMethodLabel(input.method).toLowerCase()}`,
    purchase,
    userId: input.userId ?? null,
  });
  if (result.credited) {
    await recordAuditEvent({
      typeKey: "CREACION",
      organizationId: input.organizationId,
      userId: input.userId ?? undefined,
      entity: "MovimientoCreditos",
      entityId: reference,
      action: "BILLING_CREDITS_PURCHASED",
      metadata: { method: input.method, credits: input.credits, amount: purchase.amount, balance: result.balance },
    });
    await sendPurchaseConfirmation({ organizationId: input.organizationId, credits: input.credits, purchase, reference, balance: result.balance });
  }
  return { ...result, purchase };
}
