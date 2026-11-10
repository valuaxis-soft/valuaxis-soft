import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/features/dashboard/attention";
import { ValuationRowActions } from "@/features/dashboard/components/valuation-row-actions";
import { ValuationStatusBadge } from "@/features/dashboard/components/valuation-status-badge";
import { buildValuationSortHref, type ValuationListParams } from "@/features/dashboard/valuation-list-params";
import type { ValuationPageItem, ValuationSortKey } from "@/features/valuations/repositories/valuation.repository";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

/** A column header that sorts the list: a link that keeps the filters and turns the order around on the sorted column. */
function SortableHead({ children, className, params, sort }: { children: ReactNode; className?: string; params?: Partial<ValuationListParams>; sort: ValuationSortKey }) {
  if (!params) return <TableHead className={className}>{children}</TableHead>;
  const active = params.sort === sort;
  const Icon = active ? (params.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className} aria-sort={active ? (params.direction === "asc" ? "ascending" : "descending") : "none"}>
      <Link
        href={buildValuationSortHref(params, sort)}
        className={cn("inline-flex min-h-8 items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50", active && "text-foreground")}
        data-sort={sort}
        data-sort-active={active || undefined}
      >
        {children}
        <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden="true" />
      </Link>
    </TableHead>
  );
}

/** "hace 2 días", with the exact date and time on hover. */
function Modified({ date, now }: { date: Date; now?: Date }) {
  return (
    <time dateTime={date.toISOString()} title={dateFormatter.format(date)}>
      {now ? timeAgo(date, now) : dateFormatter.format(date)}
    </time>
  );
}

type TableProps = {
  items: ValuationPageItem[];
  /** The current filters and order: with them the headers sort the list. */
  params?: Partial<ValuationListParams>;
  canCreate?: boolean;
  canDelete?: boolean;
  /** The moment the list was read: with it the dates read "hace 2 días". */
  now?: Date;
};

/**
 * The list of valuations: a table from md up, cards on a phone. The folio
 * opens the editor; "Abrir" shows on hover or focus where there is a pointer
 * and always on touch screens; the "···" menu is always there.
 */
export function ValuationsTable({ items, params, canCreate = false, canDelete = false, now }: TableProps) {
  return (
    <>
      <ul className="grid gap-2 md:hidden" aria-label="Avalúos">
        {items.map((item) => (
          <li key={item.id} className="relative flex items-start gap-2 rounded-xl border border-border bg-card p-3 transition-colors duration-150 focus-within:border-ring/50 hover:border-ring/40">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/workspace?id=${item.id}`}
                  className="text-sm font-semibold outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                >
                  {item.folio}
                </Link>
                <ValuationStatusBadge status={item.status} fallbackName={item.statusName} />
              </div>
              <p className="mt-1 truncate text-sm font-medium">{item.title || "Sin título"}</p>
              <p className="truncate text-sm text-muted-foreground">{item.client || "Sin cliente"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.propertyKindName} · <Modified date={item.updatedAt} now={now} />
              </p>
            </div>
            <div className="relative z-10 -mt-1 -mr-1">
              <ValuationRowActions id={item.id} folio={item.folio} archived={item.archivedAt !== null} canCreate={canCreate} canDelete={canDelete} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableHead className="w-36" params={params} sort="folio">Folio</SortableHead>
              <SortableHead params={params} sort="titulo">Título / cliente</SortableHead>
              <TableHead className="hidden xl:table-cell">Ubicación</TableHead>
              <SortableHead className="hidden lg:table-cell" params={params} sort="tipo">Tipo</SortableHead>
              <SortableHead params={params} sort="estado">Estado</SortableHead>
              <SortableHead params={params} sort="modificacion">Última modificación</SortableHead>
              <TableHead className="text-right">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="group/row h-16 transition-colors duration-150">
                <TableCell className="font-medium">
                  <Link href={`/workspace?id=${item.id}`} className="inline-flex min-h-8 items-center rounded-sm outline-none hover:text-primary hover:underline hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50">
                    {item.folio}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[20rem]">
                  <p className="truncate font-medium">{item.title || "Sin título"}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.client || "Sin cliente"}</p>
                </TableCell>
                <TableCell className="hidden max-w-[18rem] xl:table-cell">
                  {item.location ? (
                    <p className="flex items-center gap-1.5 truncate text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.location}</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground/70">Sin ubicación</p>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <p>{item.propertyKindName}</p>
                  <p className="text-xs text-muted-foreground">{item.appraisalKindName}</p>
                </TableCell>
                <TableCell>
                  <ValuationStatusBadge status={item.status} fallbackName={item.statusName} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <Modified date={item.updatedAt} now={now} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    <Link
                      href={`/workspace?id=${item.id}`}
                      aria-label={`Abrir avalúo ${item.folio}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "gap-1 rounded-lg transition-opacity duration-150 focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100",
                      )}
                    >
                      Abrir
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                    <ValuationRowActions id={item.id} folio={item.folio} archived={item.archivedAt !== null} canCreate={canCreate} canDelete={canDelete} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
