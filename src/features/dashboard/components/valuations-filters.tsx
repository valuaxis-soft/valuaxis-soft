import Link from "next/link";
import { Archive, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_TONE_CLASSES, getStatusPresentation } from "@/features/dashboard/valuation-status";
import { DEFAULT_VALUATION_SORT, VALUATION_SEARCH_MAX_LENGTH, buildValuationListHref, defaultDirection, type ValuationListParams } from "@/features/dashboard/valuation-list-params";
import { cn } from "@/lib/utils";

const chipClass = (current: boolean) =>
  cn(
    "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8 sm:px-3",
    current ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-ring/40 hover:text-foreground",
  );

/**
 * Search plus visible filters. The search is a plain GET form (it works
 * without JavaScript and goes back to page 1, keeping the status, the archived
 * switch and the order); each status and "Archivados" is a link that keeps the
 * search.
 */
export function ValuationsFilters({
  q,
  status,
  statuses,
  archived = false,
  sort = DEFAULT_VALUATION_SORT,
  direction,
}: {
  q: string;
  status: string | null;
  statuses: Array<{ key: string; name: string }>;
  /** The list shows the archived valuations. */
  archived?: boolean;
  sort?: ValuationListParams["sort"];
  direction?: ValuationListParams["direction"];
}) {
  const hasFilters = Boolean(q || status || archived);
  const keep = { q, status, archived, sort, direction };
  const sortChanged = sort !== DEFAULT_VALUATION_SORT || (direction !== undefined && direction !== defaultDirection(sort));

  return (
    <div className="grid gap-3">
      <form action="/avaluos" method="get" role="search" className="flex gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={VALUATION_SEARCH_MAX_LENGTH}
            placeholder="Busca por folio, título o cliente"
            aria-label="Buscar avalúos por folio, título o cliente"
            data-page-search
            className="h-11 pr-10 pl-9 text-base sm:h-9 sm:text-sm"
          />
          <kbd aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-border px-1.5 font-sans text-[11px] text-muted-foreground sm:block">
            /
          </kbd>
        </div>
        {status ? <input type="hidden" name="estado" value={status} /> : null}
        {archived ? <input type="hidden" name="archivados" value="1" /> : null}
        {sortChanged ? (
          <>
            <input type="hidden" name="orden" value={sort} />
            {direction ? <input type="hidden" name="dir" value={direction} /> : null}
          </>
        ) : null}
        <Button type="submit" variant="secondary" className="h-11 px-4 sm:h-9">
          Buscar
        </Button>
      </form>

      <div
        className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        role="group"
        aria-label="Filtrar por estado"
      >
        <Link href={buildValuationListHref({ ...keep, status: null, page: 1 })} aria-current={!status ? "true" : undefined} className={chipClass(!status)}>
          Todos
        </Link>
        {statuses.map((item) => {
          const presentation = getStatusPresentation(item.key, item.name);
          const current = status === item.key;
          return (
            <Link
              key={item.key}
              href={buildValuationListHref({ ...keep, status: current ? null : item.key, page: 1 })}
              aria-current={current ? "true" : undefined}
              className={chipClass(current)}
              data-status-filter={item.key}
            >
              <span aria-hidden="true" className={cn("size-2 rounded-full", current ? "bg-primary-foreground" : STATUS_TONE_CLASSES[presentation.tone].dot)} />
              {presentation.label}
            </Link>
          );
        })}
        <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <Link
          href={buildValuationListHref({ ...keep, archived: !archived, page: 1 })}
          aria-current={archived ? "true" : undefined}
          title={archived ? "Volver a la lista principal" : "Ver los avalúos archivados"}
          className={chipClass(archived)}
          data-archived-filter
        >
          <Archive className="size-3.5" aria-hidden="true" />
          Archivados
        </Link>
        {hasFilters ? (
          <Link href="/avaluos" className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8">
            <X className="size-3.5" aria-hidden="true" />
            Limpiar
          </Link>
        ) : null}
      </div>
    </div>
  );
}
