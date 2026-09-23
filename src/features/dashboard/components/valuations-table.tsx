import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ValuationStatusBadge } from "@/features/dashboard/components/valuation-status-badge";
import type { ValuationPageItem } from "@/features/valuations/repositories/valuation.repository";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

export function ValuationsTable({ items }: { items: ValuationPageItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-36">Folio</TableHead>
          <TableHead>Título / cliente</TableHead>
          <TableHead className="hidden lg:table-cell">Ubicación</TableHead>
          <TableHead className="hidden md:table-cell">Tipo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="hidden sm:table-cell">Última modificación</TableHead>
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
              <Link
                href={`/workspace?id=${item.id}`}
                aria-label={`Abrir avalúo ${item.folio}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1 rounded-lg")}
              >
                Abrir
                <ArrowRight className="size-3.5" />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
