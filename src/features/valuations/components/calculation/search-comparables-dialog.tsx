"use client";

import { AlertTriangle, ExternalLink, Loader2, Search } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, SessionExpiredError, type ComparableSearchFilters } from "@/lib/api-client";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { formatComparableId } from "@/features/valuations/calculation/comparable-card";
import {
  MARKET_LABELS,
  isLandComparableType,
  isRentComparableType,
  type ComparableType,
  type MarketCalculationDto,
} from "@/features/valuations/calculation/market-types";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ComparableCardButton } from "./comparable-card-dialog";
import { SEARCH_TEXT_MIN, searchText } from "@/features/valuations/comparable-search/normalize";
import type { ComparableSearchHit, ComparableSearchResponse } from "@/features/valuations/comparable-search/types";

const number = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-MX", { maximumFractionDigits: 2 }));
const money = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-MX", { style: "currency", currency: "MXN" }));
/** "2026-10-07" → "07/10/2026". */
const day = (value: string | null) => (value ? value.split("-").reverse().join("/") : "—");
const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo buscar.";

const PLACE_KEYS = ["state", "municipality", "neighborhood", "postalCode", "kind", "operation", "consultedFrom", "consultedTo"] as const;
type PlaceKey = (typeof PLACE_KEYS)[number];
type RangeKey = "areaMin" | "areaMax" | "priceMin" | "priceMax";
type Draft = Record<"text" | RangeKey | PlaceKey, string>;
/** The kind and operation start as those of the market searched for; "TODOS"/"TODAS" widen them. */
const emptyDraft = (type: ComparableType): Draft => ({
  text: "", areaMin: "", areaMax: "", priceMin: "", priceMax: "",
  state: "", municipality: "", neighborhood: "", postalCode: "", consultedFrom: "", consultedTo: "",
  kind: isLandComparableType(type) ? "TERRENO" : "CONSTRUIDO",
  operation: isRentComparableType(type) ? "RENTA" : "VENTA",
});
const RANGE_LABELS: Record<RangeKey, string> = {
  areaMin: "la superficie mínima", areaMax: "la superficie máxima", priceMin: "el precio mínimo", priceMax: "el precio máximo",
};

/** The filters the form holds, or what the appraiser has to correct. */
function filtersFrom(draft: Draft, type: ComparableType): { filters: ComparableSearchFilters } | { error: string } {
  const defaults = emptyDraft(type);
  const filtered = (["areaMin", "areaMax", "priceMin", "priceMax", "state", "municipality", "neighborhood", "postalCode", "consultedFrom", "consultedTo"] as const)
    .some((key) => draft[key].trim()) || draft.kind !== defaults.kind || draft.operation !== defaults.operation;
  if (draft.text.trim() ? searchText(draft.text).length < SEARCH_TEXT_MIN : !filtered) {
    return { error: `Escribe al menos ${SEARCH_TEXT_MIN} letras de la zona, colonia, municipio o calle, o usa un filtro.` };
  }
  if (draft.postalCode.trim() && !/^\d{5}$/.test(draft.postalCode.trim())) return { error: "El código postal lleva 5 dígitos." };
  if (draft.consultedFrom && draft.consultedTo && draft.consultedFrom > draft.consultedTo) {
    return { error: "La fecha de consulta final debe ser igual o posterior a la inicial." };
  }
  const ranges = { areaMin: null, areaMax: null, priceMin: null, priceMax: null } as Pick<ComparableSearchFilters, RangeKey>;
  for (const key of Object.keys(RANGE_LABELS) as (keyof typeof RANGE_LABELS)[]) {
    if (!draft[key].trim()) continue;
    const value = parseDecimal(draft[key]);
    if (value === null || value <= 0) return { error: `Revisa ${RANGE_LABELS[key]}: debe ser un número mayor que cero.` };
    ranges[key] = value;
  }
  if (ranges.areaMin !== null && ranges.areaMax !== null && ranges.areaMin > ranges.areaMax) {
    return { error: "La superficie máxima debe ser mayor o igual que la mínima." };
  }
  if (ranges.priceMin !== null && ranges.priceMax !== null && ranges.priceMin > ranges.priceMax) {
    return { error: "El precio máximo debe ser mayor o igual que el mínimo." };
  }
  // The kind and operation of the market itself are not sent: the server starts from them.
  const places = Object.fromEntries(PLACE_KEYS.flatMap((key) =>
    draft[key].trim() && !((key === "kind" || key === "operation") && draft[key] === defaults[key]) ? [[key, draft[key].trim()]] : []));
  return { filters: { text: draft.text.trim(), ...ranges, ...places } };
}

/**
 * Searches comparables in the available sources and adds the chosen ones to
 * the valuation. Factors are rated afterwards, as with the Excel import.
 * With `onChoose` the chosen results go to the caller instead (the
 * statistical methods take them as rows of their own, not of the market).
 */
export function SearchComparablesDialog({
  valuationId,
  type,
  readOnly,
  onAdded,
  onChoose,
  label = "Buscar comparables",
  description,
}: {
  valuationId: string;
  type: ComparableType;
  /** A valuation that cannot be edited can search, but not add. */
  readOnly: boolean;
  onAdded?: (calculation: MarketCalculationDto) => void;
  /** Takes the chosen results instead of adding them to the market approach. */
  onChoose?: (chosen: ComparableSearchHit[]) => void;
  /** The button that opens the search, and the dialog's title. */
  label?: string;
  description?: string;
}) {
  const labels = MARKET_LABELS[type];
  const perUnit = isRentComparableType(type) ? "$/m²/mes" : "$/m²";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(type));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"search" | "add" | null>(null);
  const [found, setFound] = useState<{ text: string; response: ComparableSearchResponse } | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Only the answer to the last search is shown.
  const lastSearch = useRef(0);

  const reset = () => {
    lastSearch.current += 1;
    setDraft(emptyDraft(type));
    setError(null);
    setFound(null);
    setSelected(new Set());
    setBusy(null);
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = filtersFrom(draft, type);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    const current = ++lastSearch.current;
    setError(null);
    setBusy("search");
    try {
      const response = await api.market.searchComparables(valuationId, type, parsed.filters);
      if (current !== lastSearch.current) return;
      setFound({ text: parsed.filters.text || "los filtros elegidos", response });
      setSelected(new Set());
    } catch (failure) {
      if (current === lastSearch.current) setError(errorMessage(failure));
    } finally {
      if (current === lastSearch.current) setBusy(null);
    }
  };

  const results = found?.response.results ?? [];
  const chosen = results.filter((result) => selected.has(result.key));
  const failedSources = found?.response.sources.filter((source) => source.error) ?? [];
  const toggle = (key: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });

  const add = async () => {
    if (!chosen.length) return;
    if (onChoose) {
      onChoose(chosen);
      setOpen(false);
      reset();
      return;
    }
    setBusy("add");
    try {
      const result = await api.market.addFoundComparables(valuationId, type, chosen);
      onAdded?.(result.calculation);
      const plural = result.added === 1 ? "" : "s";
      toast.success(`${result.added} comparable${plural} agregado${plural}${result.skipped ? `; ${result.skipped} ya estaba${result.skipped === 1 ? "" : "n"} en el avalúo` : ""}. Califica sus factores.`);
      setOpen(false);
      reset();
    } catch (failure) {
      toast.error(errorMessage(failure));
      setBusy(null);
    }
  };

  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [key]: event.target.value })),
  });

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Search data-icon="inline-start" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (busy !== "add") { setOpen(next); if (!next) reset(); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {description ?? (
                "Escribe la zona, colonia, municipio, calle o el ID del comparable (C-00123), o usa los filtros, y elige las ofertas que quieras "
                + "agregar al avalúo. Se agregan con sus fotos, su pantalla de referencia y su ID; los factores se califican después."
              )}
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-3" onSubmit={(event) => void search(event)} noValidate>
            <Field>
              <FieldLabel htmlFor="comparable-search-text">Zona, colonia, municipio o calle</FieldLabel>
              <Input
                id="comparable-search-text"
                type="search"
                autoFocus
                autoComplete="off"
                maxLength={120}
                placeholder="Por ejemplo: Arandas centro"
                aria-describedby="comparable-search-hint"
                {...field("text")}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="comparable-search-state">Estado</FieldLabel>
                <Input id="comparable-search-state" placeholder="Opcional" {...field("state")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-search-municipality">Municipio</FieldLabel>
                <Input id="comparable-search-municipality" placeholder="Opcional" {...field("municipality")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-search-neighborhood">Colonia</FieldLabel>
                <Input id="comparable-search-neighborhood" placeholder="Opcional" {...field("neighborhood")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-search-postal">Código postal</FieldLabel>
                <Input id="comparable-search-postal" inputMode="numeric" maxLength={5} placeholder="Opcional" {...field("postalCode")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-search-kind">Tipo de inmueble</FieldLabel>
                <NativeSelect id="comparable-search-kind" className="w-full" {...field("kind")}>
                  <NativeSelectOption value="TERRENO">Terreno</NativeSelectOption>
                  <NativeSelectOption value="CONSTRUIDO">Inmueble construido</NativeSelectOption>
                  <NativeSelectOption value="TODOS">Cualquiera</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-search-operation">Operación</FieldLabel>
                <NativeSelect id="comparable-search-operation" className="w-full" {...field("operation")}>
                  <NativeSelectOption value="VENTA">Venta</NativeSelectOption>
                  <NativeSelectOption value="RENTA">Renta</NativeSelectOption>
                  <NativeSelectOption value="TODAS">Cualquiera</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-search-from">Consultado desde</FieldLabel>
                <Input id="comparable-search-from" type="date" {...field("consultedFrom")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-search-to">Consultado hasta</FieldLabel>
                <Input id="comparable-search-to" type="date" {...field("consultedTo")} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor="comparable-search-area-min">Superficie mín. (m²)</FieldLabel>
                <Input id="comparable-search-area-min" inputMode="decimal" placeholder="Opcional" {...field("areaMin")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-search-area-max">Superficie máx. (m²)</FieldLabel>
                <Input id="comparable-search-area-max" inputMode="decimal" placeholder="Opcional" {...field("areaMax")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-search-price-min">{labels.price} mín. ($)</FieldLabel>
                <Input id="comparable-search-price-min" inputMode="decimal" placeholder="Opcional" {...field("priceMin")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-search-price-max">{labels.price} máx. ($)</FieldLabel>
                <Input id="comparable-search-price-max" inputMode="decimal" placeholder="Opcional" {...field("priceMax")} />
              </Field>
              <Button type="submit" className="col-span-2 sm:col-span-1" disabled={busy !== null}>
                {busy === "search" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Search data-icon="inline-start" />}
                Buscar
              </Button>
            </div>
            <p id="comparable-search-hint" className={error ? "text-sm text-destructive" : "text-xs text-muted-foreground"} role={error ? "alert" : undefined}>
              {error ?? `Escribe al menos ${SEARCH_TEXT_MIN} letras, o deja el texto vacío y usa los filtros; no importan acentos ni mayúsculas.`}
            </p>
          </form>

          <div className="grid gap-2" aria-live="polite" aria-busy={busy === "search"}>
            {busy === "search" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Buscando comparables…</p>
            ) : null}

            {failedSources.map((source) => (
              <p key={source.id} className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-3.5 shrink-0" /> {source.label}: {source.error} Los demás resultados sí se muestran.
              </p>
            ))}

            {found && busy !== "search" && !results.length ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Sin resultados para «{found.text}». Por ahora la búsqueda consulta solo los comparables que tu despacho ya capturó en otros avalúos; más adelante se agregarán más fuentes.
              </p>
            ) : null}

            {results.length ? (
              <>
                <p className="text-sm">
                  <span className="font-medium">{results.length} resultado{results.length === 1 ? "" : "s"}</span>
                  <span className="text-muted-foreground"> para «{found?.text}»</span>
                </p>
                <div className="max-h-80 overflow-auto rounded-md border">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead className="sticky top-0 z-10 bg-muted">
                      <tr className="text-left">
                        {!readOnly ? (
                          <th className="w-8 px-2 py-1.5">
                            <Checkbox
                              aria-label="Elegir todos los resultados"
                              checked={chosen.length === results.length}
                              onCheckedChange={(checked) => setSelected(checked ? new Set(results.map((result) => result.key)) : new Set())}
                            />
                          </th>
                        ) : null}
                        <th className="px-2 py-1.5">ID</th>
                        <th className="px-2 py-1.5"><span className="sr-only">Foto</span></th>
                        <th className="px-2 py-1.5">Ubicación</th>
                        <th className="px-2 py-1.5 text-right">Superficie</th>
                        <th className="px-2 py-1.5 text-right">{labels.price}</th>
                        <th className="px-2 py-1.5 text-right">{perUnit}</th>
                        <th className="px-2 py-1.5">Consulta</th>
                        <th className="px-2 py-1.5"><span className="sr-only">Liga del anuncio</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result) => {
                        const { comparable } = result;
                        const unitValue = comparable.area && comparable.price ? comparable.price / comparable.area : null;
                        return (
                          <tr key={result.key} className="border-t align-top" data-selected={selected.has(result.key) || undefined}>
                            {!readOnly ? (
                              <td className="px-2 py-1.5">
                                <Checkbox
                                  aria-label={`Elegir ${comparable.location}`}
                                  checked={selected.has(result.key)}
                                  onCheckedChange={(checked) => toggle(result.key, checked)}
                                />
                              </td>
                            ) : null}
                            <td className="px-2 py-1.5 font-mono whitespace-nowrap">{formatComparableId(result.folio) ?? "—"}</td>
                            <td className="px-2 py-1.5">
                              {result.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={result.thumbnailUrl} alt="" className="size-10 rounded object-cover" />
                              ) : <span className="block size-10 rounded bg-muted" />}
                            </td>
                            <td className="px-2 py-1.5">
                              <span className="block text-sm">{comparable.location}</span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-1 text-muted-foreground">
                                <Badge variant="secondary">{result.sourceLabel}</Badge>
                                {result.origin ? <span>{result.origin}</span> : null}
                                {result.photoCount ? <span>· {result.photoCount} foto{result.photoCount === 1 ? "" : "s"}</span> : null}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{number(comparable.area)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{money(comparable.price)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{money(unitValue)}</td>
                            <td className="px-2 py-1.5 tabular-nums">{day(comparable.consultedOn ?? result.capturedOn)}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              {result.sourceId === "despacho" ? <ComparableCardButton compact comparableId={result.id} label={`Ver ficha de ${comparable.location}`} /> : null}
                              {comparable.url ? (
                                <a
                                  className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                                  href={comparable.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Abrir el anuncio de ${comparable.location} en otra pestaña`}
                                >
                                  <ExternalLink className="size-3.5" /> Anuncio
                                </a>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {readOnly ? (
                  <p className="text-xs text-muted-foreground">El avalúo es de solo lectura: puedes consultar los comparables, pero no agregarlos.</p>
                ) : null}
              </>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy === "add"} onClick={() => { setOpen(false); reset(); }}>
              {readOnly ? "Cerrar" : "Cancelar"}
            </Button>
            {!readOnly ? (
              <Button type="button" disabled={busy !== null || !chosen.length} onClick={() => void add()}>
                {busy === "add" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                Agregar seleccionados ({chosen.length})
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
