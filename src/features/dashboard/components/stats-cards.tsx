import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { STATUS_TONE_CLASSES, getStatusPresentation } from "@/features/dashboard/valuation-status";
import { buildValuationListHref } from "@/features/dashboard/valuation-list-params";
import { cn } from "@/lib/utils";

type Stats = {
  total: number;
  /** Count per lowercase status key, in display order. */
  byStatus: Record<string, number>;
};

/**
 * "Tu cartera": every valuation of the firm by status, as one bar split by
 * status and a legend whose entries open the list filtered by that status.
 */
export function StatsCards({ stats }: { stats: Stats }) {
  const entries = Object.entries(stats.byStatus).map(([key, value]) => ({ key, value, ...getStatusPresentation(key) }));

  return (
    <section aria-labelledby="cartera-title" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="cartera-title" className="text-base font-semibold">
          Tu cartera
        </h2>
        <Link
          href="/avaluos"
          className="group inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-8"
        >
          Total de avalúos: <span className="tabular-nums">{stats.total}</span>
          <ArrowRight className="size-3.5 transition-transform duration-150 motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>

      <div aria-hidden="true" className="mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {stats.total > 0
          ? entries
              .filter((entry) => entry.value > 0)
              .map((entry) => (
                <span
                  key={entry.key}
                  className={cn("h-full first:rounded-l-full last:rounded-r-full", STATUS_TONE_CLASSES[entry.tone].dot)}
                  style={{ width: `${(entry.value / stats.total) * 100}%` }}
                />
              ))
          : null}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
        {entries.map((entry) => (
          <li key={entry.key}>
            <Link
              href={buildValuationListHref({ status: entry.key })}
              title={entry.hint || undefined}
              className="group flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-2 transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", STATUS_TONE_CLASSES[entry.tone].dot)} />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground group-hover:text-foreground">{entry.pluralLabel}</span>
              <span className="text-lg font-semibold tabular-nums">{entry.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
