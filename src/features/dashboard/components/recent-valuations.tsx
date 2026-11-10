import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { timeAgo } from "@/features/dashboard/attention";
import { EmptyState } from "@/features/dashboard/components/empty-state";
import { ValuationStatusBadge } from "@/features/dashboard/components/valuation-status-badge";
import { NEW_VALUATION_HREF } from "@/features/dashboard/navigation";
import { cn } from "@/lib/utils";

type ValuationItem = {
  id: string;
  folio: string;
  title?: string;
  client: string;
  location: string;
  valuationKind: string;
  propertyKind: string;
  status: string;
  createdAt: Date;
  updatedAt?: Date;
};

/** "Continúa donde te quedaste": the last valuations touched, each one opens in the editor. */
export function RecentValuations({
  valuations,
  now = new Date(0),
  canCreate = false,
}: {
  valuations: ValuationItem[];
  /** The moment the dates are worded against ("hace 2 días"). */
  now?: Date;
  canCreate?: boolean;
}) {
  return (
    <section aria-labelledby="recientes-title" className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-6">
        <div>
          <h2 id="recientes-title" className="text-base font-semibold">
            Continúa donde te quedaste
          </h2>
          <p className="text-sm text-muted-foreground">Los avalúos que se movieron más recientemente.</p>
        </div>
        <Link href="/avaluos" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-11 shrink-0 gap-1.5 px-3 sm:h-8")}>
          Ver todos
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="p-2 sm:p-3">
        {valuations.length === 0 ? (
          <EmptyState
            compact
            illustration="valuations"
            title="Aún no hay avalúos"
            description={canCreate ? "Crea el primero y aquí lo tendrás a la mano para seguirle." : "Cuando tu despacho cree avalúos, aquí verás los más recientes."}
            action={
              canCreate ? (
                <Link href={NEW_VALUATION_HREF} className={cn(buttonVariants(), "h-11 px-4 sm:h-9")}>
                  Crear mi primer avalúo
                </Link>
              ) : null
            }
          />
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)]">
            {valuations.slice(0, 5).map((v) => (
              <li key={v.id}>
                <Link
                  href={`/workspace?id=${v.id}`}
                  className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors duration-150 outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 sm:gap-4"
                >
                  <span className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
                    <FileText className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold">{v.folio}</span>
                      <ValuationStatusBadge status={v.status} />
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {[v.title, v.client].filter(Boolean).join(" · ") || "Sin título ni cliente"}
                    </span>
                  </span>
                  {v.updatedAt ? (
                    <time dateTime={v.updatedAt.toISOString()} className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      {timeAgo(v.updatedAt, now)}
                    </time>
                  ) : null}
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground/60 transition-[transform,color] duration-150 group-hover:text-foreground motion-safe:group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
