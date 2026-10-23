import Link from "next/link";
import { ImageOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OPERATION_TYPE_LABELS, formatComparableId, formatDay } from "@/features/valuations/calculation/comparable-card";
import { COMPARABLE_TYPE_LABELS, isRentComparableType } from "@/features/valuations/calculation/market-types";
import { ValidityBadge } from "@/features/valuations/components/calculation/comparable-validity-badge";
import type { ComparableBaseItem } from "../comparable-base.service";

const money = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const area = (value: number | null) => (value === null ? null : `${value.toLocaleString("es-MX", { maximumFractionDigits: 2 })} m²`);

/** Land, built and rooms in one line: "Terreno 250 m² · Const. 180 m² · 3 rec. · 2.5 baños". */
function sizeLine(item: ComparableBaseItem) {
  return [
    item.landArea !== null ? `Terreno ${area(item.landArea)}` : null,
    item.builtArea !== null ? `${item.type === "INMUEBLE_RENTA" ? "Rentable" : "Const."} ${area(item.builtArea)}` : null,
    item.bedrooms !== null ? `${item.bedrooms} rec.` : null,
    item.bathrooms !== null ? `${item.bathrooms} ${item.bathrooms === 1 ? "baño" : "baños"}` : null,
  ].filter(Boolean).join(" · ") || "—";
}

/** The firm's comparables: each row opens its card and names the valuations that used it. */
export function ComparableBaseTable({ items }: { items: ComparableBaseItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Número</TableHead>
          <TableHead>Ubicación</TableHead>
          <TableHead className="hidden md:table-cell">Tipo</TableHead>
          <TableHead className="hidden lg:table-cell">Superficies</TableHead>
          <TableHead className="text-right">Precio</TableHead>
          <TableHead className="hidden sm:table-cell">Alta / actualización</TableHead>
          <TableHead>Vigencia</TableHead>
          <TableHead className="hidden xl:table-cell">Usado en</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const id = formatComparableId(item.folio);
          return (
            <TableRow key={item.id} data-comparable-row={id ?? item.id}>
              <TableCell>
                <Link href={`/comparables/${item.id}`} className="font-mono font-medium text-primary underline-offset-2 hover:underline">
                  {id ?? "Sin número"}
                </Link>
              </TableCell>
              <TableCell className="max-w-88">
                <div className="flex items-center gap-2">
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbnailUrl} alt="" className="hidden size-10 shrink-0 rounded object-cover sm:block" />
                  ) : (
                    <span className="hidden size-10 shrink-0 items-center justify-center rounded bg-muted sm:flex" aria-hidden="true">
                      <ImageOff className="size-4 text-muted-foreground" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <Link href={`/comparables/${item.id}`} className="line-clamp-2 font-medium hover:underline">
                      {item.location || "Sin ubicación"}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {[item.landUse, item.constructionType, item.sourceName].filter(Boolean).join(" · ") || " "}
                    </p>
                    <p className="truncate text-xs text-muted-foreground xl:hidden">
                      Usado en {item.uses.map((use) => use.folio).join(", ") || "—"}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <p>{COMPARABLE_TYPE_LABELS[item.type]}</p>
                <p className="text-xs text-muted-foreground">{OPERATION_TYPE_LABELS[item.operationType]}</p>
              </TableCell>
              <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{sizeLine(item)}</TableCell>
              <TableCell className="text-right tabular-nums">
                <p className="font-medium">{money(item.price)}</p>
                <p className="text-xs text-muted-foreground">
                  {item.unitValue !== null ? `${money(item.unitValue)}/m²${isRentComparableType(item.type) ? "/mes" : ""}` : ""}
                </p>
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                <time dateTime={item.validity.updatedOn}>{formatDay(item.validity.updatedOn)}</time>
              </TableCell>
              <TableCell>
                <div className="grid justify-items-start gap-1">
                  <ValidityBadge validity={item.validity} />
                  <span className="text-xs text-muted-foreground">hasta {formatDay(item.validity.validUntil)}</span>
                </div>
              </TableCell>
              <TableCell className="hidden max-w-64 xl:table-cell">
                <ul className="flex flex-wrap gap-1">
                  {item.uses.map((use) => (
                    <li key={use.valuationId}>
                      <Link href={`/workspace?id=${use.valuationId}`} title={[use.title, use.client ? `cliente ${use.client}` : null].filter(Boolean).join(" · ")}>
                        <Badge variant="outline" className="font-mono">{use.folio}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
