import Link from "next/link";
import { Archive, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { STATUS_TONE_CLASSES, getStatusPresentation } from "@/features/dashboard/valuation-status";
import {
  DEFAULT_VALUATION_SORT,
  VALUATION_SEARCH_MAX_LENGTH,
  buildValuationListHref,
  defaultDirection,
  hasValuationFilters,
  type ValuationListParams,
} from "@/features/dashboard/valuation-list-params";
import { cn } from "@/lib/utils";

const chipClass = (current: boolean) =>
  cn(
    "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8 sm:px-3",
    current ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-ring/40 hover:text-foreground",
  );

type Option = { key: string; name: string };

const fieldLabel = "grid gap-1 text-xs font-medium text-muted-foreground";

/**
 * Search plus visible filters. The search and the filters are one plain GET
 * form (it works without JavaScript and goes back to page 1, keeping the
 * status, the list shown and the order); each status, «Archivados» and
 * «Papelera» is a link that keeps the rest.
 */
export function ValuationsFilters({
  params,
  statuses,
  propertyKinds,
  appraisalKinds,
  appraisers,
}: {
  params: ValuationListParams;
  statuses: Option[];
  propertyKinds: Option[];
  appraisalKinds: Option[];
  appraisers: Array<{ id: number; name: string }>;
}) {
  const { q, status, archived, trash, sort, direction } = params;
  const filtered = hasValuationFilters(params);
  const sortChanged = sort !== DEFAULT_VALUATION_SORT || direction !== defaultDirection(sort);
  const moreFilters = Boolean(params.propertyKind || params.appraisalKind || params.appraiserId || params.from || params.to);

  return (
    <div className="grid gap-3">
      <form action="/avaluos" method="get" role="search" className="grid gap-3" data-valuation-filters="">
        <div className="flex gap-2">
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
          {trash ? <input type="hidden" name="papelera" value="1" /> : archived ? <input type="hidden" name="archivados" value="1" /> : null}
          {sortChanged ? (
            <>
              <input type="hidden" name="orden" value={sort} />
              <input type="hidden" name="dir" value={direction} />
            </>
          ) : null}
          <Button type="submit" variant="secondary" className="h-11 px-4 sm:h-9">
            Buscar
          </Button>
        </div>

        <details open={moreFilters} className="group rounded-lg border border-border bg-background/60 px-3 py-2 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Más filtros: tipo, valuador y fechas
            {moreFilters ? <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">activos</span> : null}
          </summary>
          <div className="grid gap-3 pt-3 pb-1 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto_auto_auto_auto]">
            <label className={fieldLabel}>
              Tipo de bien
              <NativeSelect name="tipo" defaultValue={params.propertyKind ?? ""} className="w-full">
                <NativeSelectOption value="">Todos</NativeSelectOption>
                {propertyKinds.map((kind) => <NativeSelectOption key={kind.key} value={kind.key}>{kind.name}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <label className={fieldLabel}>
              Tipo de avalúo
              <NativeSelect name="tipoAvaluo" defaultValue={params.appraisalKind ?? ""} className="w-full">
                <NativeSelectOption value="">Todos</NativeSelectOption>
                {appraisalKinds.map((kind) => <NativeSelectOption key={kind.key} value={kind.key}>{kind.name}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <label className={fieldLabel}>
              Valuador
              <NativeSelect name="valuador" defaultValue={params.appraiserId ? String(params.appraiserId) : ""} className="w-full">
                <NativeSelectOption value="">Todos</NativeSelectOption>
                {appraisers.map((person) => <NativeSelectOption key={person.id} value={String(person.id)}>{person.name}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <label className={fieldLabel}>
              Fecha de
              <NativeSelect name="fecha" defaultValue={params.dateField} className="w-full">
                <NativeSelectOption value="creacion">Creación</NativeSelectOption>
                <NativeSelectOption value="modificacion">Última modificación</NativeSelectOption>
                <NativeSelectOption value="conclusion">Conclusión</NativeSelectOption>
              </NativeSelect>
            </label>
            <label className={fieldLabel}>
              Desde
              <Input type="date" name="desde" defaultValue={params.from ?? ""} className="h-8" />
            </label>
            <label className={fieldLabel}>
              Hasta
              <Input type="date" name="hasta" defaultValue={params.to ?? ""} className="h-8" />
            </label>
            <div className="flex items-end">
              <Button type="submit" size="sm" className="h-8 w-full sm:w-auto">Aplicar</Button>
            </div>
          </div>
        </details>
      </form>

      <div
        className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        role="group"
        aria-label="Filtrar por estado"
      >
        <Link href={buildValuationListHref({ ...params, status: null, page: 1 })} aria-current={!status ? "true" : undefined} className={chipClass(!status)}>
          Todos
        </Link>
        {statuses.map((item) => {
          const presentation = getStatusPresentation(item.key, item.name);
          const current = status === item.key;
          return (
            <Link
              key={item.key}
              href={buildValuationListHref({ ...params, status: current ? null : item.key, page: 1 })}
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
          href={buildValuationListHref({ ...params, archived: !archived, trash: false, page: 1 })}
          aria-current={archived ? "true" : undefined}
          title={archived ? "Volver a la lista principal" : "Ver los avalúos archivados"}
          className={chipClass(archived)}
          data-archived-filter
        >
          <Archive className="size-3.5" aria-hidden="true" />
          Archivados
        </Link>
        <Link
          href={buildValuationListHref({ ...params, trash: !trash, archived: false, page: 1 })}
          aria-current={trash ? "true" : undefined}
          title={trash ? "Volver a la lista principal" : "Ver los avalúos eliminados (se restauran durante 30 días)"}
          className={chipClass(trash)}
          data-trash-filter
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Papelera
        </Link>
        {filtered || archived || trash ? (
          <Link href="/avaluos" className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8">
            <X className="size-3.5" aria-hidden="true" />
            Limpiar
          </Link>
        ) : null}
      </div>
    </div>
  );
}
