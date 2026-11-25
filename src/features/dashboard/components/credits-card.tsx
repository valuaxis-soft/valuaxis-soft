import Link from "next/link";
import { ArrowRight, Coins } from "lucide-react";
import { LOW_CREDIT_BALANCE as LOW_CREDITS } from "@/features/billing/credit-rules";
import { cn } from "@/lib/utils";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" });

/** "Avalúos disponibles": the credit balance while the firm pays per created valuation or has its free trial. */
export function CreditsCard({ balance, trialAvailable = 0, trialExpiresAt = null }: { balance: number; trialAvailable?: number; trialExpiresAt?: string | null }) {
  const empty = balance <= 0;
  const low = !empty && balance <= LOW_CREDITS;
  return (
    <section aria-labelledby="creditos-title" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="creditos-title" className="text-base font-semibold">
            Avalúos disponibles
          </h2>
          <p className="text-sm text-muted-foreground">Se usa uno al crear cada avalúo.</p>
        </div>
        <span className={cn("flex size-10 items-center justify-center rounded-xl", empty ? "bg-destructive/10 text-destructive" : "bg-success/15 text-success-strong")}>
          <Coins className="size-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums">{balance}</p>
      {trialAvailable > 0 && trialExpiresAt ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {trialAvailable} de prueba gratuita, vencen el {formatDate(trialExpiresAt)}.
        </p>
      ) : null}
      {empty || low ? (
        <p role="status" className={cn("mt-1 text-sm", empty ? "text-destructive" : "text-foreground")}>
          {empty ? "Ya no te quedan. Compra avalúos para poder crear uno nuevo." : "Te quedan pocos; considera comprar más."}
        </p>
      ) : null}
      <Link
        href="/organizacion/facturacion"
        className="group mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-8"
      >
        Comprar avalúos
        <ArrowRight className="size-3.5 transition-transform duration-150 motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </section>
  );
}
