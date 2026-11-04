import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      <Link href={buildValuationSortHref(params, sort)} className="inline-flex items-center gap-1 hover:text-foreground" data-sort={sort} data-sort-active={active || undefined}>
        {children}
        <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden="true" />
      </Link>
    </TableHead>
  );
}

export function ValuationsTable({
  items,
  params,
  canCreate = false,
  canDelete = false,
}: {
  items: ValuationPageItem[];
  /** The current filters and order: with them the headers sort the list. */
  params?: Partial<ValuationListParams>;
  canCreate?: boolean;
  canDelete?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead className="w-36" params={params} sort="folio">Folio</SortableHead>
          <SortableHead params={params} sort="titulo">Título / cliente</SortableHead>
          <TableHead className="hidden lg:table-cell">Ubicación</TableHead>
          <SortableHead className="hidden md:table-cell" params={params} sort="tipo">Tipo</SortableHead>
          <SortableHead params={params} sort="estado">Estado</SortableHead>
          <SortableHead className="hidden sm:table-cell" params={params} sort="modificacion">Última modificación</SortableHead>
          <TableHead className="text-right">
            <span className="sr-only">Acciones</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.folio}</TableCell>
            <TableCell className="max-w-[18rem]">
              <p className="truncate font-medium">{item.title || "Sin título"}</p>
              <p className="truncate text-xs text-muted-foreground">{item.client || "Sin cliente"}</p>
            </TableCell>
            <TableCell className="hidden max-w-[20rem] lg:table-cell">
              <p className="truncate text-muted-foreground">{item.location || "Sin ubicación"}</p>
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <p>{item.propertyKindName}</p>
              <p className="text-xs text-muted-foreground">{item.appraisalKindName}</p>
            </TableCell>
            <TableCell>
              <ValuationStatusBadge status={item.status} fallbackName={item.statusName} />
            </TableCell>
            <TableCell className="hidden text-muted-foreground sm:table-cell">
              <time dateTime={item.updatedAt.toISOString()}>{dateFormatter.format(item.updatedAt)}</time>
            </TableCell>
            <TableCell className="text-right">
              <div className="inline-flex items-center gap-1">
                <Link
                  href={`/workspace?id=${item.id}`}
                  aria-label={`Abrir avalúo ${item.folio}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1 rounded-lg")}
                >
                  Abrir
                  <ArrowRight className="size-3.5" />
                </Link>
                <ValuationRowActions id={item.id} folio={item.folio} archived={item.archivedAt !== null} canCreate={canCreate} canDelete={canDelete} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
