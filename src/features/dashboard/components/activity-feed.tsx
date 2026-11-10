import Link from "next/link";
import { timeAgo } from "@/features/dashboard/attention";
import { EmptyState } from "@/features/dashboard/components/empty-state";
import type { ActivityItem } from "@/features/dashboard/services/dashboard-activity.service";
import { STATUS_TONE_CLASSES, getStatusPresentation } from "@/features/dashboard/valuation-status";
import { cn } from "@/lib/utils";

/** "Actividad reciente": the last status changes of the firm, as a short timeline. */
export function ActivityFeed({ items, now }: { items: ActivityItem[]; now: Date }) {
  return (
    <section aria-labelledby="actividad-title" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 id="actividad-title" className="text-base font-semibold">
        Actividad reciente
      </h2>
      {items.length === 0 ? (
        <EmptyState compact illustration="activity" title="Sin movimientos todavía" description="Aquí verás cuando un avalúo cambie de estado." />
      ) : (
        <ol className="mt-4 grid grid-cols-[minmax(0,1fr)]">
          {items.map((item, index) => {
            const status = getStatusPresentation(item.to, item.toName);
            return (
              <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                {index < items.length - 1 ? <span aria-hidden="true" className="absolute top-4 bottom-0 left-[5px] w-px bg-border" /> : null}
                <span aria-hidden="true" className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-card", STATUS_TONE_CLASSES[status.tone].dot)} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-pretty">
                    <Link href={`/workspace?id=${item.valuationId}`} className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                      {item.folio}
                    </Link>{" "}
                    <span className="text-muted-foreground">{item.from ? "pasó a" : "quedó en"}</span> {status.label.toLowerCase()}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.who ? `${item.who} · ` : ""}
                    <time dateTime={item.at.toISOString()}>{timeAgo(item.at, now)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
