import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { CONSTRUCTION_TYPE_SUGGESTIONS, OPERATION_TYPES, OPERATION_TYPE_LABELS } from "@/features/valuations/calculation/comparable-card";
import { VALIDITY_STATUSES, VALIDITY_STATUS_LABELS } from "@/features/valuations/calculation/comparable-validity";
import { COMPARABLE_TYPES, COMPARABLE_TYPE_LABELS } from "@/features/valuations/calculation/market-types";
import { cn } from "@/lib/utils";
import {
  COMPARABLE_SORTS,
  COMPARABLE_SORT_LABELS,
  COUNT_MODES,
  COUNT_MODE_LABELS,
  hasAdvancedFilters,
  hasFilters,
  type ComparableListParams,
} from "../comparable-list-params";

const number = (value: number | null) => (value === null ? "" : String(value));

function Filter({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/**
 * The filters of the firm's base, as a plain GET form: it works without
 * JavaScript, every search goes back to page 1, and the URL can be shared.
 */
export function ComparableBaseFilters({ params, attributeNames = [] }: {
  params: ComparableListParams;
  /** Names of the characteristics added to the firm's comparables, to offer while typing. */
  attributeNames?: string[];
}) {
  return (
    <form action="/comparables" method="get" role="search" className="grid gap-3" aria-label="Buscar comparables">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            name="q"
            defaultValue={params.q}
            maxLength={100}
            placeholder="Ubicación, uso, fuente o número (C-00123)"
            aria-label="Buscar comparables por ubicación, uso, fuente o número"
            className="h-9 pl-8"
          />
        </div>
        <NativeSelect name="orden" defaultValue={params.sort} aria-label="Ordenar" className="w-full sm:w-60 [&_select]:h-9">
          {COMPARABLE_SORTS.map((sort) => <NativeSelectOption key={sort} value={sort}>{COMPARABLE_SORT_LABELS[sort]}</NativeSelectOption>)}
        </NativeSelect>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="h-9 px-3">Buscar</Button>
          {hasFilters(params) ? (
            <Link href="/comparables" className={cn(buttonVariants({ variant: "ghost" }), "h-9 px-3")}>Limpiar</Link>
          ) : null}
        </div>
      </div>

      <details className="group rounded-lg border p-3" open={hasAdvancedFilters(params)}>
        <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium">
          <SlidersHorizontal className="size-4" aria-hidden="true" /> Más filtros
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Filter label="Cliente (usados en sus avalúos)" htmlFor="filtro-cliente">
            <Input id="filtro-cliente" name="cliente" defaultValue={params.client} maxLength={100} className="h-9" />
          </Filter>
          <Filter label="Estado" htmlFor="filtro-estado">
            <Input id="filtro-estado" name="estado" defaultValue={params.state} maxLength={100} className="h-9" />
          </Filter>
          <Filter label="Municipio o alcaldía" htmlFor="filtro-municipio">
            <Input id="filtro-municipio" name="municipio" defaultValue={params.municipality} maxLength={100} className="h-9" />
          </Filter>
          <Filter label="Colonia" htmlFor="filtro-colonia">
            <Input id="filtro-colonia" name="colonia" defaultValue={params.neighborhood} maxLength={100} className="h-9" />
          </Filter>
          <Filter label="Fraccionamiento" htmlFor="filtro-fraccionamiento">
            <Input id="filtro-fraccionamiento" name="fraccionamiento" defaultValue={params.subdivision} maxLength={100} className="h-9" />
          </Filter>
          <Filter label="Código postal" htmlFor="filtro-cp">
            <Input id="filtro-cp" name="cp" inputMode="numeric" pattern="\d{5}" maxLength={5} defaultValue={params.postalCode} className="h-9" />
          </Filter>
          <Filter label="Operación" htmlFor="filtro-operacion">
            <NativeSelect id="filtro-operacion" name="operacion" defaultValue={params.operation?.toLowerCase() ?? ""} className="w-full [&_select]:h-9">
              <NativeSelectOption value="">Venta y renta</NativeSelectOption>
              {OPERATION_TYPES.map((item) => <NativeSelectOption key={item} value={item.toLowerCase()}>{OPERATION_TYPE_LABELS[item]}</NativeSelectOption>)}
            </NativeSelect>
          </Filter>
          <Filter label="Tipo de construcción" htmlFor="filtro-construccion">
            <Input id="filtro-construccion" name="construccion" list="filtro-construcciones" defaultValue={params.constructionType} maxLength={100} className="h-9" />
            <datalist id="filtro-construcciones">
              {CONSTRUCTION_TYPE_SUGGESTIONS.map((item) => <option key={item} value={item} />)}
            </datalist>
          </Filter>
          <Filter label="Uso de suelo" htmlFor="filtro-uso">
            <Input id="filtro-uso" name="uso" defaultValue={params.landUse} maxLength={100} placeholder="Habitacional, H-3…" className="h-9" />
          </Filter>
          <Filter label="Característica agregada" htmlFor="filtro-caracteristica">
            <div className="flex items-center gap-1">
              <Input
                id="filtro-caracteristica"
                name="caracteristica"
                list="filtro-caracteristicas"
                defaultValue={params.attribute}
                maxLength={100}
                placeholder="Nombre: alberca…"
                className="h-9"
              />
              <Input
                name="valorCaracteristica"
                aria-label="Valor de la característica agregada"
                defaultValue={params.attributeValue}
                maxLength={100}
                placeholder="Valor: sí…"
                className="h-9"
              />
            </div>
            <datalist id="filtro-caracteristicas">
              {attributeNames.map((item) => <option key={item} value={item} />)}
            </datalist>
          </Filter>
          <Filter label="Superficie de terreno (m²)" htmlFor="filtro-terreno-min">
            <div className="flex items-center gap-1">
              <Input id="filtro-terreno-min" name="terrenoMin" inputMode="decimal" placeholder="Desde" defaultValue={number(params.landAreaMin)} className="h-9" />
              <Input name="terrenoMax" inputMode="decimal" placeholder="Hasta" aria-label="Superficie de terreno hasta" defaultValue={number(params.landAreaMax)} className="h-9" />
            </div>
          </Filter>
          <Filter label="Superficie construida o rentable (m²)" htmlFor="filtro-construida-min">
            <div className="flex items-center gap-1">
              <Input id="filtro-construida-min" name="construidaMin" inputMode="decimal" placeholder="Desde" defaultValue={number(params.builtAreaMin)} className="h-9" />
              <Input name="construidaMax" inputMode="decimal" placeholder="Hasta" aria-label="Superficie construida hasta" defaultValue={number(params.builtAreaMax)} className="h-9" />
            </div>
          </Filter>
          <Filter label="Precio u oferta ($)" htmlFor="filtro-precio-min">
            <div className="flex items-center gap-1">
              <Input id="filtro-precio-min" name="precioMin" inputMode="decimal" placeholder="Desde" defaultValue={number(params.priceMin)} className="h-9" />
              <Input name="precioMax" inputMode="decimal" placeholder="Hasta" aria-label="Precio hasta" defaultValue={number(params.priceMax)} className="h-9" />
            </div>
          </Filter>
          <Filter label="Recámaras" htmlFor="filtro-recamaras">
            <div className="flex items-center gap-1">
              <NativeSelect name="recamarasModo" defaultValue={params.bedroomsMode} aria-label="Cómo comparar las recámaras" className="w-32 [&_select]:h-9">
                {COUNT_MODES.map((mode) => <NativeSelectOption key={mode} value={mode}>{COUNT_MODE_LABELS[mode]}</NativeSelectOption>)}
              </NativeSelect>
              <Input id="filtro-recamaras" name="recamaras" inputMode="numeric" defaultValue={number(params.bedrooms)} className="h-9" />
            </div>
          </Filter>
          <Filter label="Baños (acepta medios: 2.5)" htmlFor="filtro-banos">
            <div className="flex items-center gap-1">
              <NativeSelect name="banosModo" defaultValue={params.bathroomsMode} aria-label="Cómo comparar los baños" className="w-32 [&_select]:h-9">
                {COUNT_MODES.map((mode) => <NativeSelectOption key={mode} value={mode}>{COUNT_MODE_LABELS[mode]}</NativeSelectOption>)}
              </NativeSelect>
              <Input id="filtro-banos" name="banos" inputMode="decimal" step="0.5" defaultValue={number(params.bathrooms)} className="h-9" />
            </div>
          </Filter>
          <Filter label="Alta o actualización desde" htmlFor="filtro-desde">
            <Input id="filtro-desde" name="desde" type="date" defaultValue={params.from ?? ""} className="h-9" />
          </Filter>
          <Filter label="Alta o actualización hasta" htmlFor="filtro-hasta">
            <Input id="filtro-hasta" name="hasta" type="date" defaultValue={params.to ?? ""} className="h-9" />
          </Filter>
          <Filter label="Vigencia" htmlFor="filtro-vigencia">
            <NativeSelect id="filtro-vigencia" name="vigencia" defaultValue={params.validity?.toLowerCase() ?? ""} className="w-full [&_select]:h-9">
              <NativeSelectOption value="">Vigentes y vencidos</NativeSelectOption>
              {VALIDITY_STATUSES.map((item) => <NativeSelectOption key={item} value={item.toLowerCase()}>{VALIDITY_STATUS_LABELS[item]}s</NativeSelectOption>)}
            </NativeSelect>
          </Filter>
          <fieldset className="grid gap-1 sm:col-span-2 lg:col-span-4">
            <legend className="text-xs font-medium text-muted-foreground">Tipo de inmueble y operación</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {COMPARABLE_TYPES.map((type) => (
                <label key={type} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" name="tipo" value={type} defaultChecked={params.types.includes(type)} className="size-4 accent-primary" />
                  {COMPARABLE_TYPE_LABELS[type]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </details>
    </form>
  );
}
