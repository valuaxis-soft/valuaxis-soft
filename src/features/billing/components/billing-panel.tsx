"use client";

import { AlertTriangle, CheckCircle2, CreditCard, Info, Loader2, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { BillingOverviewDto, BillingPlanDto, CreditPackageDto, CreditsOverviewDto } from "../billing.service";

/** The words next to the balance; a negative balance counts valuations concluded without paying. */
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
  purchased: { title: "Compra confirmada", text: "Stripe confirmó tu pago y los avalúos ya están en tu saldo. Stripe te envía el recibo por correo.", tone: "ok" },
  "purchase-confirming": {
    title: "Estamos confirmando tu pago",
    text: "Stripe todavía no confirma el pago del paquete. Suele tardar unos segundos: vuelve a cargar la página.",
    tone: "info",
  },
  cancelled: { title: "No se realizó ningún cargo", text: "Saliste del pago antes de terminar. Puedes comprar cuando quieras.", tone: "info" },
  unreachable: {
    title: "No pudimos consultar a Stripe",
    text: "Se muestra el último estado conocido. Vuelve a intentarlo en unos minutos.",
    tone: "warning",
  },
};

export function BillingPanel({ overview, canManage, notice }: { overview: BillingOverviewDto; canManage: boolean; notice: BillingNotice }) {
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
  const buyPackage = (packageId: string) => leaveTo(packageId, () => api.billing.buyPackage(packageId), "No se pudo iniciar el pago.");
  const shown = notice ? NOTICES[notice] : null;

  return (
    <div className="grid gap-6">
      {shown ? (
        <Alert variant={shown.tone === "warning" ? "destructive" : "default"}>
          {shown.tone === "ok" ? <CheckCircle2 /> : shown.tone === "warning" ? <AlertTriangle /> : <Info />}
          <AlertTitle>{shown.title}</AlertTitle>
          <AlertDescription>{shown.text}</AlertDescription>
        </Alert>
      ) : null}

      <CreditsCard credits={credits} canManage={canManage} enabled={overview.enabled} hasCustomer={overview.hasCustomer} busy={busy} onPortal={openPortal} />

      {!overview.enabled ? (
        <Alert>
          <Info />
          <AlertTitle>Los pagos en línea no están habilitados</AlertTitle>
          <AlertDescription>Por ahora no es posible comprar paquetes desde aquí. Tu organización sigue funcionando con normalidad.</AlertDescription>
        </Alert>
      ) : credits.packages.length === 0 ? (
        <Alert>
          <Info />
          <AlertTitle>Todavía no hay paquetes publicados</AlertTitle>
          <AlertDescription>Cuando haya paquetes de avalúos disponibles aparecerán aquí para comprarlos.</AlertDescription>
        </Alert>
      ) : (
        <section aria-label="Paquetes de avalúos" className="grid gap-4 sm:grid-cols-2">
          {credits.packages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} canManage={canManage} busy={busy} onBuy={() => buyPackage(pkg.id)} />
          ))}
        </section>
      )}

      <MovementsCard credits={credits} />

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

      {/* Subscriptions (the comparables database, later) coexist with the packages; without plans on sale only a paid one shows. */}
      {current?.paid || plans.length > 0 ? (
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
            {overview.enabled && plans.length > 0 ? (
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Avalúos disponibles
          {credits.enforced ? <Badge variant="secondary">Cobro por avalúo activo</Badge> : null}
          {negative ? <Badge variant="destructive">Pendiente de pago</Badge> : null}
        </CardTitle>
        <CardDescription>Cada avalúo descuenta un crédito la primera vez que se concluye; reabrirlo y volver a concluirlo no cuesta.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p>
          <span className={`text-4xl font-bold tracking-tight ${negative ? "text-destructive" : ""}`}>{Math.abs(credits.balance)}</span>{" "}
          <span className="text-sm text-muted-foreground">{balanceWords(credits.balance)}</span>
        </p>
        {negative ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Avalúos pendientes de pago</AlertTitle>
            <AlertDescription>
              Se concluyeron {Math.abs(credits.balance)} {Math.abs(credits.balance) === 1 ? "avalúo" : "avalúos"} sin saldo. Compra un paquete para ponerte al corriente.
            </AlertDescription>
          </Alert>
        ) : credits.enforced && credits.balance === 0 ? (
          <Alert>
            <Info />
            <AlertTitle>Sin avalúos disponibles</AlertTitle>
            <AlertDescription>Para concluir un avalúo es necesario comprar un paquete.</AlertDescription>
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

function PackageCard({ pkg, canManage, busy, onBuy }: { pkg: CreditPackageDto; canManage: boolean; busy: string | null; onBuy: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{pkg.name}</CardTitle>
        <CardDescription>
          {pkg.credits} {pkg.credits === 1 ? "avalúo" : "avalúos"} · {money.format(pkg.perCredit)} por avalúo más IVA
          {pkg.description ? `. ${pkg.description}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <p>
          <span className="text-2xl font-bold tracking-tight">{money.format(pkg.total)}</span> <span className="text-sm text-muted-foreground">MXN</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {pkg.tax > 0
            ? `${money.format(pkg.subtotal)} + ${money.format(pkg.tax)} de IVA (${pkg.taxPercent}%). IVA incluido en el cobro.`
            : "Es el importe total que se cobra una sola vez."}
        </p>
        {canManage ? (
          <Button className="w-fit" onClick={onBuy} disabled={busy !== null}>
            {busy === pkg.id ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
            Comprar
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MovementsCard({ credits }: { credits: CreditsOverviewDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimientos</CardTitle>
        <CardDescription>Compras, avalúos concluidos y ajustes, del más reciente al más antiguo (se muestran hasta 50).</CardDescription>
      </CardHeader>
      <CardContent>
        {credits.movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Movimiento</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead className="text-right">Avalúos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credits.movements.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(movement.createdAt)}</TableCell>
                  <TableCell>{movement.typeLabel}</TableCell>
                  <TableCell>
                    {movement.valuation ? (
                      <Link href={`/workspace?id=${movement.valuation.id}`} className="underline underline-offset-2">
                        {movement.valuation.folio}
                      </Link>
                    ) : (
                      movement.description
                    )}
                    {movement.userName ? <span className="text-muted-foreground"> · {movement.userName}</span> : null}
                  </TableCell>
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
