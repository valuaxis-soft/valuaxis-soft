"use client";

import { AlertTriangle, CheckCircle2, CreditCard, Download, Info, Landmark, Loader2, Minus, Plus, RotateCw, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { BillingOverviewDto, BillingPlanDto, CreditsOverviewDto } from "../billing.service";
import type { CreditMovementDto } from "../credits.service";
import type { MovementInvoiceDto } from "../invoicing.service";
import type { UnitPriceDto } from "../unit-price.service";
import { PriceChangeAlert } from "./price-change-alert";
import { FiscalDataCard } from "./fiscal-data-card";

/** The words next to the balance; a negative balance counts valuations created without paying. */
function balanceWords(balance: number) {
  const one = Math.abs(balance) === 1;
  if (balance < 0) return one ? "avalúo pendiente de pago" : "avalúos pendientes de pago";
  return one ? "avalúo disponible" : "avalúos disponibles";
}

/** What the page learned on the way back from Stripe. */
export type BillingNotice = "paid" | "confirming" | "purchased" | "purchase-confirming" | "cancelled" | "unreachable" | null;

// A fixed time zone, so the server and the browser print the same day.
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof SessionExpiredError
    ? "Tu sesión expiró. Vuelve a iniciar sesión."
    : error instanceof Error
      ? error.message
      : fallback;

const NOTICES: Record<Exclude<BillingNotice, null>, { title: string; text: string; tone: "ok" | "info" | "warning" }> = {
  paid: { title: "Suscripción confirmada", text: "Stripe confirmó tu suscripción. Gracias por contratar.", tone: "ok" },
  confirming: {
    title: "Estamos confirmando tu pago",
    text: "Stripe todavía no confirma la suscripción. Suele tardar unos segundos: vuelve a cargar la página.",
    tone: "info",
  },
  purchased: {
    title: "Compra confirmada",
    text: "Stripe confirmó tu pago y los avalúos ya están en tu saldo. Te enviamos la confirmación por correo; la factura aparece en Movimientos en cuanto se emite.",
    tone: "ok",
  },
  "purchase-confirming": {
    title: "Estamos confirmando tu pago",
    text: "Stripe todavía no confirma el pago. Suele tardar unos segundos: vuelve a cargar la página.",
    tone: "info",
  },
  cancelled: { title: "No se realizó ningún cargo", text: "Saliste del pago antes de terminar. Puedes comprar cuando quieras.", tone: "info" },
  unreachable: {
    title: "No pudimos consultar a Stripe",
    text: "Se muestra el último estado conocido. Vuelve a intentarlo en unos minutos.",
    tone: "warning",
  },
};

export function BillingPanel({
  overview,
  canManage,
  canManageInvoicing,
  notice,
}: {
  overview: BillingOverviewDto;
  canManage: boolean;
  /** FACTURACION_ADMINISTRAR: fiscal data and «Reintentar factura». */
  canManageInvoicing: boolean;
  notice: BillingNotice;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const { current, plans, credits } = overview;

  // The session id in the address has served its purpose once the page rendered.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const leaveTo = async (key: string, open: () => Promise<{ url: string }>, fallback: string) => {
    setBusy(key);
    try {
      window.location.assign((await open()).url);
    } catch (error) {
      toast.error(errorMessage(error, fallback));
      setBusy(null);
    }
  };
  const openPortal = () => leaveTo("portal", api.billing.portal, "No se pudo abrir el portal de pago.");
  const buyCredits = (quantity: number) => leaveTo("comprar", () => api.billing.buyCredits(quantity), "No se pudo iniciar el pago.");
  const shown = notice ? NOTICES[notice] : null;

  return (
    <div className="grid gap-6">
      {shown ? (
        <Alert variant={shown.tone === "warning" ? "destructive" : "default"} data-billing-notice={notice}>
          {shown.tone === "ok" ? <CheckCircle2 /> : shown.tone === "warning" ? <AlertTriangle /> : <Info />}
          <AlertTitle>{shown.title}</AlertTitle>
          <AlertDescription>
            {shown.text}
            {notice === "purchased" ? (
              <span className="mt-1 block font-medium text-foreground">
                Tu saldo: {credits.balance} {balanceWords(credits.balance)}.
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {overview.priceNotice ? <PriceChangeAlert notice={overview.priceNotice} /> : null}

      <CreditsCard credits={credits} canManage={canManage} enabled={overview.enabled} hasCustomer={overview.hasCustomer} busy={busy} onPortal={openPortal} />

      {!credits.unitPrice ? (
        <Alert>
          <Info />
          <AlertTitle>Todavía no hay precio publicado</AlertTitle>
          <AlertDescription>Cuando el precio por avalúo esté publicado podrás comprar avalúos disponibles aquí.</AlertDescription>
        </Alert>
      ) : (
        <BuyCard
          maxQuantity={credits.maxQuantity}
          unitPrice={credits.unitPrice}
          cardEnabled={overview.enabled}
          canManage={canManage}
          busy={busy}
          bankTransfer={overview.bankTransfer}
          onPay={buyCredits}
        />
      )}

      <MovementsCard credits={credits} invoicingEnabled={overview.invoicing.enabled} canRetry={canManageInvoicing && overview.invoicing.enabled} />

      <FiscalDataCard invoicing={overview.invoicing} canManage={canManageInvoicing} />

      {current?.stateKey === "PAGO_PENDIENTE" || current?.stateKey === "SUSPENDIDA" ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{current.stateKey === "SUSPENDIDA" ? "Suscripción suspendida por falta de pago" : "No pudimos cobrar tu suscripción"}</AlertTitle>
          <AlertDescription>
            {current.paidUse && current.graceEndsAt
              ? `Stripe volverá a intentar el cobro. Actualiza tu forma de pago antes del ${formatDate(current.graceEndsAt)} para no perder tu plan.`
              : "Actualiza tu forma de pago para reactivar tu plan."}
            {canManage ? " Usa “Administrar pago”." : " Pide a un administrador que la actualice."}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* No plans on offer while the commercial policies rule out subscriptions (7.2); one already paid would still show. */}
      {current?.paid || (overview.subscriptionsOffered && plans.length > 0) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {current ? current.planName : "Sin plan"}
              {current ? <Badge variant={current.paidUse || !current.paid ? "secondary" : "destructive"}>{current.stateLabel}</Badge> : null}
            </CardTitle>
            <CardDescription>La suscripción actual de tu organización.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {current?.paid ? (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {current.priceLabel ? <Detail label="Precio" value={`${current.priceLabel} (IVA incluido)`} /> : null}
                {current.trialEndsAt ? <Detail label="La prueba termina el" value={formatDate(current.trialEndsAt)} /> : null}
                {current.cancelsAt ? (
                  <Detail label="Se cancelará el" value={`${formatDate(current.cancelsAt)} (no se renovará)`} />
                ) : current.periodEndsAt ? (
                  <Detail label={current.trialEndsAt ? "Primer cobro" : current.paidUse ? "Próximo cobro" : "Periodo en curso hasta"} value={formatDate(current.periodEndsAt)} />
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Tu organización no tiene una suscripción de pago.</p>
            )}
            {overview.enabled && overview.subscriptionsOffered && plans.length > 0 ? (
              <section aria-label="Planes disponibles" className="grid gap-4 sm:grid-cols-2">
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    canManage={canManage}
                    subscribed={Boolean(current?.paid)}
                    busy={busy}
                    onChoose={(priceId) =>
                      current?.paid ? openPortal() : leaveTo(priceId, () => api.billing.checkout(priceId), "No se pudo iniciar el pago.")
                    }
                  />
                ))}
              </section>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function CreditsCard({
  credits,
  canManage,
  enabled,
  hasCustomer,
  busy,
  onPortal,
}: {
  credits: CreditsOverviewDto;
  canManage: boolean;
  enabled: boolean;
  hasCustomer: boolean;
  busy: string | null;
  onPortal: () => void;
}) {
  const negative = credits.balance < 0;
  const trial = credits.trial;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Avalúos disponibles
          {credits.enforced ? <Badge variant="secondary">Cobro por avalúo activo</Badge> : null}
          {negative ? <Badge variant="destructive">Pendiente de pago</Badge> : null}
        </CardTitle>
        <CardDescription>Se usa uno al crear cada avalúo. Concluirlo, cancelarlo o reabrirlo no usa otro.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p data-credit-balance={credits.balance}>
          <span className={`text-4xl font-bold tracking-tight tabular-nums ${negative ? "text-destructive" : ""}`}>{Math.abs(credits.balance)}</span>{" "}
          <span className="text-sm text-muted-foreground">{balanceWords(credits.balance)}</span>
        </p>
        {trial ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2" data-credit-trial>
            <Detail label="Pagados (no vencen)" value={String(Math.max(credits.paid, 0))} />
            <Detail
              label={trial.expired ? "Prueba gratuita" : `De prueba gratuita (vencen el ${formatDate(trial.expiresAt)})`}
              value={trial.expired ? `Venció el ${formatDate(trial.expiresAt)}` : `${trial.available} de ${trial.granted}`}
            />
          </dl>
        ) : null}
        {negative ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Avalúos pendientes de pago</AlertTitle>
            <AlertDescription>
              Se usaron {Math.abs(credits.balance)} {Math.abs(credits.balance) === 1 ? "avalúo" : "avalúos"} sin saldo. Compra avalúos para ponerte al corriente.
            </AlertDescription>
          </Alert>
        ) : credits.enforced && credits.balance === 0 ? (
          <Alert>
            <Info />
            <AlertTitle>Sin avalúos disponibles</AlertTitle>
            <AlertDescription>Para crear un avalúo es necesario comprar al menos uno.</AlertDescription>
          </Alert>
        ) : null}
        {canManage && hasCustomer && enabled ? (
          <div>
            <Button variant="outline" onClick={onPortal} disabled={busy !== null}>
              {busy === "portal" ? <Loader2 className="animate-spin" /> : <CreditCard />}
              Administrar pago
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">Tarjeta y recibos se administran en el portal seguro de Stripe.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Centavos, so the browser adds what Stripe will charge without floating point. */
const cents = (amount: number) => Math.round(amount * 100);

/**
 * «Comprar avalúos»: by unit (commercial policies 3.1), with the total to pay,
 * taxes and every charge in sight before the pay button, and the payment terms
 * and forms (LFPC 7 Bis and 76 Bis V).
 */
function BuyCard({
  maxQuantity,
  unitPrice,
  cardEnabled,
  canManage,
  busy,
  bankTransfer,
  onPay,
}: {
  maxQuantity: number;
  unitPrice: UnitPriceDto;
  cardEnabled: boolean;
  canManage: boolean;
  busy: string | null;
  bankTransfer: BillingOverviewDto["bankTransfer"];
  onPay: (quantity: number) => void;
}) {
  const [text, setText] = useState("1");
  const parsed = Number(text);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= maxQuantity;
  const quantity = valid ? parsed : 1;
  const totalCents = cents(unitPrice.total) * quantity;
  const subtotalCents = cents(unitPrice.subtotal) * quantity;
  const total = money.format(totalCents / 100);
  const step = (delta: number) => setText(String(Math.min(maxQuantity, Math.max(1, quantity + delta))));

  return (
    <Card aria-labelledby="comprar-title">
      <CardHeader>
        <CardTitle id="comprar-title">Comprar avalúos</CardTitle>
        <CardDescription>
          Cada avalúo disponible cuesta {money.format(unitPrice.total)} MXN con IVA incluido. Se compran por unidad: no hay paquetes, membresía ni suscripción.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="cantidad-avaluos">¿Cuántos avalúos?</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="Uno menos" onClick={() => step(-1)} disabled={quantity <= 1}>
              <Minus />
            </Button>
            <Input
              id="cantidad-avaluos"
              inputMode="numeric"
              autoComplete="off"
              className="w-24 text-center tabular-nums"
              value={text}
              onChange={(event) => setText(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
              aria-invalid={!valid}
              aria-describedby="cantidad-ayuda"
            />
            <Button type="button" variant="outline" size="icon" aria-label="Uno más" onClick={() => step(1)} disabled={quantity >= maxQuantity}>
              <Plus />
            </Button>
          </div>
          <p id="cantidad-ayuda" className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}>
            {valid ? `De 1 a ${maxQuantity} por pago.` : `Escribe una cantidad de 1 a ${maxQuantity}.`}
          </p>
        </div>

        <section aria-label="Total a pagar" className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4" data-purchase-total={totalCents / 100}>
          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                {quantity} × {money.format(unitPrice.total)}
              </dt>
              <dd className="tabular-nums">{total}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Subtotal antes de IVA</dt>
              <dd className="tabular-nums">{money.format(subtotalCents / 100)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">IVA ({unitPrice.taxPercent} %), incluido</dt>
              <dd className="tabular-nums">{money.format((totalCents - subtotalCents) / 100)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Comisiones y otros cargos</dt>
              <dd className="tabular-nums">{money.format(0)}</dd>
            </div>
          </dl>
          <p className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-primary/20 pt-3">
            <span className="text-base font-semibold">Total a pagar</span>
            <span className="text-3xl font-bold tracking-tight tabular-nums">
              {total} <span className="text-sm font-medium text-muted-foreground">MXN</span>
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Un solo cargo con IVA incluido. No hay comisiones ni cobros adicionales.</p>
        </section>

        <div className="grid gap-2 text-sm">
          <p className="font-medium">Términos y formas de pago</p>
          <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
            <li>Tarjeta de crédito o débito, en la página segura de Stripe. Valuaxis no ve ni guarda tu tarjeta.</li>
            <li>Pago único: no es suscripción y no hay cobros automáticos recurrentes.</li>
            <li>Los avalúos se abonan a tu saldo en cuanto Stripe confirma el pago; recibes la confirmación en pantalla y por correo.</li>
            <li>Los avalúos pagados no vencen. Los de la prueba gratuita vencen al mes del registro.</li>
            <li>Puedes revocar la compra de los avalúos que no hayas usado dentro de los cinco días hábiles siguientes (Políticas comerciales, sección 6.1).</li>
            <li>También puedes pagar por transferencia o depósito en efectivo con los datos de abajo.</li>
          </ul>
        </div>

        {canManage ? (
          cardEnabled ? (
            <Button className="w-fit" size="lg" onClick={() => onPay(quantity)} disabled={busy !== null || !valid} data-pay-button>
              {busy === "comprar" ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
              Pagar {total} con tarjeta
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">El pago con tarjeta todavía no está habilitado. Puedes pagar por transferencia o depósito.</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Solo quien administra el despacho puede comprar avalúos.</p>
        )}

        <section aria-labelledby="transferencia-title" className="grid gap-2 rounded-xl border p-4">
          <h3 id="transferencia-title" className="flex items-center gap-2 text-sm font-semibold">
            <Landmark className="size-4" aria-hidden="true" />
            Transferencia o depósito en efectivo
          </h3>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {bankTransfer.rows.map((row) => (
              <Detail key={row.label} label={row.label} value={row.value} />
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            {bankTransfer.ready
              ? `Transfiere o deposita el total (${total} por ${quantity} ${quantity === 1 ? "avalúo" : "avalúos"}) y envía tu comprobante con el nombre de tu despacho. Al confirmarlo te avisamos por correo con tu saldo.`
              : "Los datos bancarios se publicarán aquí. Mientras tanto, paga con tarjeta."}
          </p>
        </section>
      </CardContent>
    </Card>
  );
}

/** «3 × $170.00 = $510.00 · Tarjeta (Stripe) · cs_…»: what a purchase cost and how it was paid. */
function purchaseDetail(purchase: NonNullable<CreditMovementDto["purchase"]>) {
  const parts = [`${purchase.quantity} × ${money.format(purchase.unitPrice)} = ${money.format(purchase.amount)}`, purchase.methodLabel];
  if (purchase.reference) parts.push(`Ref. ${purchase.reference}`);
  return parts.join(" · ");
}

function MovementsCard({ credits, invoicingEnabled, canRetry }: { credits: CreditsOverviewDto; invoicingEnabled: boolean; canRetry: boolean }) {
  const [movements, setMovements] = useState(credits.movements);
  const [retrying, setRetrying] = useState<string | null>(null);
  const showInvoices = invoicingEnabled || movements.some((movement) => movement.invoice);

  const retry = async (invoice: MovementInvoiceDto) => {
    setRetrying(invoice.id);
    try {
      const next = await api.billing.retryInvoice(invoice.id);
      setMovements((current) => current.map((movement) => (movement.invoice?.id === next.id ? { ...movement, invoice: next } : movement)));
      if (next.state === "EMITIDA" && next.emailed) toast.success("Factura emitida y enviada por correo.");
      else if (next.state === "EMITIDA") toast.warning("La factura se emitió, pero no se pudo enviar por correo.");
      else toast.error(next.error ?? "No se pudo emitir la factura.");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo reintentar la factura."));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimientos</CardTitle>
        <CardDescription>Compras, avalúos creados, prueba gratuita y ajustes, del más reciente al más antiguo (se muestran hasta 50).</CardDescription>
      </CardHeader>
      <CardContent>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Movimiento</TableHead>
                <TableHead>Detalle</TableHead>
                {showInvoices ? <TableHead>Factura</TableHead> : null}
                <TableHead className="text-right">Avalúos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(movement.createdAt)}</TableCell>
                  <TableCell>{movement.typeLabel}</TableCell>
                  <TableCell className="whitespace-normal">
                    {movement.valuation ? (
                      <Link href={`/workspace?id=${movement.valuation.id}`} className="underline underline-offset-2">
                        {movement.valuation.folio}
                      </Link>
                    ) : movement.purchase ? (
                      <span className="tabular-nums">{purchaseDetail(movement.purchase)}</span>
                    ) : (
                      movement.description
                    )}
                    {movement.userName ? <span className="text-muted-foreground"> · {movement.userName}</span> : null}
                  </TableCell>
                  {showInvoices ? (
                    <TableCell className="whitespace-normal">
                      <InvoiceCell movement={movement} canRetry={canRetry} retrying={retrying === movement.invoice?.id} onRetry={retry} />
                    </TableCell>
                  ) : null}
                  <TableCell className={`text-right font-medium tabular-nums ${movement.credits < 0 ? "text-destructive" : ""}`}>
                    {movement.credits > 0 ? `+${movement.credits}` : movement.credits}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const monthLabel = (period: string) =>
  new Date(`${period}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "America/Mexico_City" });

/** The CFDI of a purchase: links to its PDF and XML, where it went, or why it failed and «Reintentar factura». */
function InvoiceCell({
  movement,
  canRetry,
  retrying,
  onRetry,
}: {
  movement: CreditMovementDto;
  canRetry: boolean;
  retrying: boolean;
  onRetry: (invoice: MovementInvoiceDto) => void;
}) {
  const invoice = movement.invoice;
  if (movement.type !== "COMPRA") return null;
  if (!invoice) return <span className="text-xs text-muted-foreground">Sin factura todavía</span>;
  if (invoice.kind === "GLOBAL") {
    return (
      <span className="text-xs text-muted-foreground">
        {invoice.state === "EMITIDA" && invoice.globalPeriod ? `En la factura global de ${monthLabel(invoice.globalPeriod)}` : "En la factura global del mes"}
      </span>
    );
  }
  const base = `/api/organizacion/facturacion/facturas/${invoice.id}`;
  return (
    <div className="grid gap-1 text-xs">
      {invoice.state === "EMITIDA" ? (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Factura {invoice.label ?? ""}</Badge>
          {invoice.downloadable ? (
            <>
              <a href={`${base}/pdf`} className="inline-flex items-center gap-1 underline underline-offset-2">
                <Download className="size-3" /> PDF
              </a>
              <a href={`${base}/xml`} className="inline-flex items-center gap-1 underline underline-offset-2">
                <Download className="size-3" /> XML
              </a>
            </>
          ) : null}
        </span>
      ) : invoice.state === "PENDIENTE" ? (
        <span className="text-muted-foreground">Emitiendo la factura…</span>
      ) : (
        <Badge variant="destructive" className="w-fit">No se pudo emitir</Badge>
      )}
      {invoice.error ? <span className="text-muted-foreground">{invoice.error}</span> : null}
      {canRetry && invoice.retryable ? (
        <Button type="button" size="sm" variant="outline" className="w-fit" disabled={retrying} onClick={() => onRetry(invoice)}>
          {retrying ? <Loader2 className="animate-spin" /> : <RotateCw />}
          Reintentar factura
        </Button>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function PlanCard({
  plan,
  canManage,
  subscribed,
  busy,
  onChoose,
}: {
  plan: BillingPlanDto;
  canManage: boolean;
  subscribed: boolean;
  busy: string | null;
  onChoose: (priceId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        {plan.description ? <CardDescription>{plan.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {plan.prices.map((price) => (
          <div key={price.id} className="grid gap-2 rounded-lg border p-3">
            <p>
              <span className="text-2xl font-bold tracking-tight">{money.format(price.total)}</span>{" "}
              <span className="text-sm text-muted-foreground">MXN {price.periodLabel}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {price.tax > 0
                ? `${money.format(price.subtotal)} + ${money.format(price.tax)} de IVA (${price.taxPercent}%). IVA incluido en el cobro.`
                : "Es el importe total que se cobra en cada periodo."}
            </p>
            {plan.trialDays && !subscribed ? <p className="text-xs text-muted-foreground">Incluye {plan.trialDays} días de prueba sin costo.</p> : null}
            {price.current ? (
              <Badge variant="secondary" className="w-fit">Tu plan actual</Badge>
            ) : canManage ? (
              <Button className="w-fit" onClick={() => onChoose(price.id)} disabled={busy !== null}>
                {busy === price.id ? <Loader2 className="animate-spin" /> : null}
                {subscribed ? "Cambiar" : "Contratar"}
              </Button>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
