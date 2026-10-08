"use client";

import { AlertTriangle, CheckCircle2, CreditCard, Info, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { BillingOverviewDto, BillingPlanDto } from "../billing.service";

/** What the page learned on the way back from Stripe. */
export type BillingNotice = "paid" | "confirming" | "cancelled" | "unreachable" | null;

// A fixed time zone, so the server and the browser print the same day.
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });

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
  cancelled: { title: "No se realizó ningún cargo", text: "Saliste del pago antes de terminar. Puedes contratar cuando quieras.", tone: "info" },
  unreachable: {
    title: "No pudimos consultar a Stripe",
    text: "Se muestra el último estado conocido de tu plan. Vuelve a intentarlo en unos minutos.",
    tone: "warning",
  },
};

export function BillingPanel({ overview, canManage, notice }: { overview: BillingOverviewDto; canManage: boolean; notice: BillingNotice }) {
  const [busy, setBusy] = useState<string | null>(null);
  const { current, plans } = overview;

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

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {current ? current.planName : "Sin plan"}
            {current ? <Badge variant={current.paidUse || !current.paid ? "secondary" : "destructive"}>{current.stateLabel}</Badge> : null}
          </CardTitle>
          <CardDescription>El plan actual de tu organización.</CardDescription>
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
            <p className="text-sm text-muted-foreground">
              {current ? "Tu organización está en el plan gratuito." : "Tu organización todavía no tiene un plan asignado."}
            </p>
          )}
          {canManage && current?.paid && overview.enabled ? (
            <div>
              <Button variant="outline" onClick={openPortal} disabled={busy !== null}>
                {busy === "portal" ? <Loader2 className="animate-spin" /> : <CreditCard />}
                Administrar pago
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Tarjeta, facturas, cambio de plan y cancelación se administran en el portal seguro de Stripe.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!overview.enabled ? (
        <Alert>
          <Info />
          <AlertTitle>Los pagos en línea no están habilitados</AlertTitle>
          <AlertDescription>Por ahora no es posible contratar ni cambiar de plan desde aquí. Tu organización sigue funcionando con normalidad.</AlertDescription>
        </Alert>
      ) : plans.length === 0 ? (
        <Alert>
          <Info />
          <AlertTitle>Todavía no hay planes publicados</AlertTitle>
          <AlertDescription>Cuando haya planes disponibles aparecerán aquí para contratarlos.</AlertDescription>
        </Alert>
      ) : (
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
      )}
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
