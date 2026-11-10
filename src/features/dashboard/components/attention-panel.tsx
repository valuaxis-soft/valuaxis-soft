import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CircleCheckBig, Hourglass, MapPinOff } from "lucide-react";
import { ATTENTION_LABEL, STALE_DRAFT_DAYS, type AttentionItem, type AttentionReason } from "@/features/dashboard/attention";
import { EmptyState } from "@/features/dashboard/components/empty-state";
import { cn } from "@/lib/utils";

const REASON_STYLE: Record<AttentionReason, { icon: LucideIcon; className: string }> = {
  "to-conclude": { icon: CircleCheckBig, className: "bg-primary/10 text-foreground ring-primary/30 [&_svg]:text-primary" },
  "no-comparables": { icon: MapPinOff, className: "bg-highlight/15 text-foreground ring-highlight/45 [&_svg]:text-highlight-strong" },
  "stale-draft": { icon: Hourglass, className: "bg-muted text-foreground ring-border [&_svg]:text-muted-foreground" },
};

function reasonDetail(item: AttentionItem) {
  if (item.reasons.includes("to-conclude")) return "Está en revisión: cuando lo apruebes, concluye para entregarlo.";
  if (item.reasons.includes("stale-draft")) return `Sin cambios desde hace ${item.idleDays} días.`;
  return "Todavía no tiene comparables capturados.";
}

/** "Requiere tu atención": open valuations waiting for something. It only points them out. */
export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="atencion-title" className="rounded-2xl border border-border bg-card">
      <div className="px-5 pt-5 sm:px-6">
        <h2 id="atencion-title" className="text-base font-semibold">
          Requiere tu atención
        </h2>
        <p className="text-sm text-muted-foreground">
          En revisión por concluir, sin comparables o sin movimiento en {STALE_DRAFT_DAYS} días.
        </p>
      </div>
      <div className="p-2 sm:p-3">
        {items.length === 0 ? (
          <EmptyState compact illustration="all-clear" title="Todo en orden" description="Ningún avalúo abierto está esperando algo de ti." />
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)]">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/workspace?id=${item.id}`}
                  className="group flex items-start gap-3 rounded-xl px-3 py-3 transition-colors duration-150 outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold">{item.folio}</span>
                      {item.reasons.map((reason) => {
                        const style = REASON_STYLE[reason];
                        const Icon = style.icon;
                        return (
                          <span
                            key={reason}
                            className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium ring-1 ring-inset [&_svg]:size-3.5", style.className)}
                          >
                            <Icon aria-hidden="true" />
                            {ATTENTION_LABEL[reason]}
                          </span>
                        );
                      })}
                    </span>
                    <span className="mt-0.5 block truncate text-sm">{[item.title, item.client].filter(Boolean).join(" · ") || "Sin título"}</span>
                    <span className="block text-xs text-muted-foreground">{reasonDetail(item)}</span>
                  </span>
                  <ArrowRight
                    className="mt-1 size-4 shrink-0 text-muted-foreground/60 transition-[transform,color] duration-150 group-hover:text-foreground motion-safe:group-hover:translate-x-0.5"
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
