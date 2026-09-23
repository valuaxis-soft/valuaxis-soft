import Link from "next/link";
import { Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { getStatusPresentation } from "@/features/dashboard/valuation-status";
import { VALUATION_SEARCH_MAX_LENGTH } from "@/features/dashboard/valuation-list-params";
import { cn } from "@/lib/utils";

/** Plain GET form: works without JavaScript and resets to page 1 on every search. */
export function ValuationsFilters({
  q,
  status,
  statuses,
}: {
  q: string;
  status: string | null;
  statuses: Array<{ key: string; name: string }>;
}) {
  const hasFilters = Boolean(q || status);

  return (
    <form action="/avaluos" method="get" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={VALUATION_SEARCH_MAX_LENGTH}
          placeholder="Buscar por folio, título o cliente"
          aria-label="Buscar avalúos por folio, título o cliente"
          className="h-9 pl-8"
        />
      </div>
      <NativeSelect
        name="estado"
        defaultValue={status ?? ""}
        aria-label="Filtrar por estado"
        className="w-full sm:w-48 [&_select]:h-9"
      >
        <NativeSelectOption value="">Todos los estados</NativeSelectOption>
        {statuses.map((item) => (
          <NativeSelectOption key={item.key} value={item.key}>
            {getStatusPresentation(item.key, item.name).label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" className="h-9 px-3">
          Buscar
        </Button>
        {hasFilters ? (
          <Link href="/avaluos" className={cn(buttonVariants({ variant: "ghost" }), "h-9 px-3")}>
            Limpiar
          </Link>
        ) : null}
      </div>
    </form>
  );
}
