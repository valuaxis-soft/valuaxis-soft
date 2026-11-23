"use client";

import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, SessionExpiredError } from "@/lib/api-client";
import { formatComparableId } from "@/features/valuations/calculation/comparable-card";
import { isLandComparableType, isRentComparableType, type ComparableType, type MarketCalculationDto } from "@/features/valuations/calculation/market-types";
import {
  WEB_SEARCH_FEW_RESULTS,
  WEB_SEARCH_MAX_KNOWN,
  WEB_SEARCH_MAX_PREVIOUS,
  WEB_SEARCH_TEXT_MAX,
  WEB_SEARCH_TEXT_MIN,
} from "@/features/valuations/comparable-search/web-listings";
import type { WebSearchCandidateDto, WebSearchStatusDto } from "@/features/valuations/comparable-search/web-search.service";

const POLL_MS = 2500;
const number = (value: number) => value.toLocaleString("es-MX", { maximumFractionDigits: 2 });
const pesos = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo buscar.";

type Setup = { enabled: boolean; disabledReason: string | null; suggestion: string; maxSearches: number };
type Running = { searches: number; query: string | null; elapsedSeconds: number };
type Round = { found: number; discarded: number; marketNote: string | null; searches: number; elapsedSeconds: number };
type SortKey = "area" | "price" | "unitValue" | "zone" | "portal";
type Sort = { key: SortKey; direction: "asc" | "desc" };

const zoneOf = (candidate: WebSearchCandidateDto) =>
  [candidate.neighborhood, candidate.reference].filter(Boolean).join(" · ") || [candidate.municipality, candidate.state].filter(Boolean).join(", ");

/**
 * The state of «Buscar con IA» for one market. It lives in the component that
 * owns the dialog, not in the dialog: closing it by accident does not throw
 * away results that cost a search, and a search in course keeps going.
 */
export function useAiComparableSearch(valuationId: string, type: ComparableType, active: boolean) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [text, setText] = useState("");
  /** What was asked so far in this search, oldest first. */
  const [asked, setAsked] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<WebSearchCandidateDto[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [running, setRunning] = useState<Running | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const requested = useRef(false);
  // Bumped on unmount and on «Nueva búsqueda»: an answer of before is not applied.
  const generation = useRef(0);

  useEffect(() => {
    if (!active || requested.current) return;
    requested.current = true;
    api.ai.webSearchSetup(valuationId, type)
      .then((loaded) => {
        setSetup(loaded);
        setText((current) => current || loaded.suggestion);
      })
      .catch((failure) => {
        requested.current = false;
        setSetupError(errorMessage(failure));
      });
  }, [active, valuationId, type]);

  useEffect(() => () => { generation.current += 1; }, []);

  const search = useCallback(async () => {
    const request = text.trim();
    if (request.length < WEB_SEARCH_TEXT_MIN) {
      setError(`Describe lo que buscas con al menos ${WEB_SEARCH_TEXT_MIN} letras: tipo de inmueble, municipio y rango de superficie.`);
      return;
    }
    const current = ++generation.current;
    setError(null);
    setRunning({ searches: 0, query: null, elapsedSeconds: 0 });
    try {
      const { jobId } = await api.ai.startWebSearch(valuationId, type, {
        text: request,
        previous: asked.slice(-WEB_SEARCH_MAX_PREVIOUS),
        knownUrls: candidates.slice(-WEB_SEARCH_MAX_KNOWN).map((candidate) => candidate.url),
      });
      let missed = 0;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (current !== generation.current) return;
        let status: WebSearchStatusDto;
        try {
          status = await api.ai.webSearchStatus(valuationId, jobId);
          missed = 0;
        } catch (failure) {
          // A question that got lost does not throw away a search that is still running.
          if (failure instanceof ApiError || failure instanceof SessionExpiredError || ++missed >= 3) throw failure;
          continue;
        }
        if (current !== generation.current) return;
        if (status.status === "running") {
          setRunning({ searches: status.searches, query: status.query, elapsedSeconds: status.elapsedSeconds });
          continue;
        }
        if (status.status === "failed") throw new Error(status.error);
        // What was found before stays; a listing found again is not listed twice.
        setCandidates((previous) => {
          const known = new Set(previous.map((candidate) => candidate.key));
          return [...previous, ...status.candidates.filter((candidate) => !known.has(candidate.key))];
        });
        setRound({ found: status.candidates.length, discarded: status.discarded, marketNote: status.marketNote, searches: status.searches, elapsedSeconds: status.elapsedSeconds });
        setAsked((previous) => [...previous, request]);
        setText("");
        return;
      }
    } catch (failure) {
      if (current === generation.current) setError(errorMessage(failure));
    } finally {
      if (current === generation.current) setRunning(null);
    }
  }, [asked, candidates, text, type, valuationId]);

  const restart = useCallback(() => {
    generation.current += 1;
    setAsked([]);
    setCandidates([]);
    setSelected(new Set());
    setRunning(null);
    setRound(null);
    setError(null);
    setText(setup?.suggestion ?? "");
  }, [setup]);

  const create = useCallback(async (): Promise<MarketCalculationDto | null> => {
    const chosen = candidates.filter((candidate) => selected.has(candidate.key) && !candidate.existing?.inValuation);
    if (!chosen.length) return null;
    setCreating(true);
    try {
      const result = await api.ai.addWebListings(valuationId, type, chosen.map((candidate) => ({
        title: candidate.title, propertyType: candidate.propertyType, landArea: candidate.landArea, builtArea: candidate.builtArea,
        price: candidate.price, currency: candidate.currency, neighborhood: candidate.neighborhood, municipality: candidate.municipality,
        state: candidate.state, reference: candidate.reference, portal: candidate.portal, url: candidate.url,
        listingDate: candidate.listingDate, notes: candidate.notes,
      })));
      const keys = new Set(chosen.map((candidate) => candidate.key));
      // They are in the valuation now: shown as such, and not offered again.
      setCandidates((previous) => previous.map((candidate) => (keys.has(candidate.key)
        ? { ...candidate, existing: { comparableId: candidate.existing?.comparableId ?? "", folio: candidate.existing?.folio ?? null, inValuation: true } }
        : candidate)));
      setSelected(new Set());
      const made = result.created + result.reused;
      const parts = [
        `${made} ficha${made === 1 ? "" : "s"} en el mercado`,
        ...(result.reused ? [`${result.reused} ya estaba${result.reused === 1 ? "" : "n"} en tu base y se usó la existente`] : []),
        ...(result.skipped ? [`${result.skipped} ya estaba${result.skipped === 1 ? "" : "n"} en el avalúo`] : []),
      ];
      toast.success(`${parts.join("; ")}. Quedan «Sin revisar»: verifica cada una contra su anuncio y agrega fotos y pantalla de referencia.`);
      return result.calculation;
    } catch (failure) {
      toast.error(errorMessage(failure));
      return null;
    } finally {
      setCreating(false);
    }
  }, [candidates, selected, type, valuationId]);

  return { setup, setupError, text, setText, asked, candidates, selected, setSelected, running, round, error, creating, search, restart, create };
}

type AiSearch = ReturnType<typeof useAiComparableSearch>;

function SortHeader({ label, column, sort, onSort, align }: { label: string; column: SortKey; sort: Sort | null; onSort: (key: SortKey) => void; align?: "right" }) {
  const direction = sort?.key === column ? sort.direction : null;
  return (
    <th className={align === "right" ? "px-2 py-1.5 text-right" : "px-2 py-1.5"} aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-sm font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => onSort(column)}
        title={`Ordenar por ${label}`}
      >
        {label}
        {direction === "asc" ? <ArrowUp className="size-3" aria-hidden /> : direction === "desc" ? <ArrowDown className="size-3" aria-hidden /> : null}
      </button>
    </th>
  );
}

/**
 * «Buscar con IA»: a request in the appraiser's words, already written from
 * the subject, and the listings the web search found, in a table to choose
 * from. Every result is unverified: the table says so and links the listing.
 */
export function AiComparableSearchPanel({
  search,
  type,
  readOnly,
  onCreated,
  onClose,
}: {
  search: AiSearch;
  type: ComparableType;
  readOnly: boolean;
  onCreated: (calculation: MarketCalculationDto) => void;
  onClose: () => void;
}) {
  const { setup, candidates, selected, setSelected, running, round } = search;
  const land = isLandComparableType(type);
  const rent = isRentComparableType(type);
  const [sort, setSort] = useState<Sort | null>(null);
  const areaOf = useCallback((candidate: WebSearchCandidateDto) => (land ? candidate.landArea : candidate.builtArea), [land]);

  const rows = useMemo(() => {
    if (!sort) return candidates;
    const value = (candidate: WebSearchCandidateDto): number | string | null =>
      sort.key === "area" ? areaOf(candidate)
        : sort.key === "price" ? candidate.price
          : sort.key === "unitValue" ? candidate.unitValue
            : sort.key === "zone" ? zoneOf(candidate).toLowerCase() || null
              : candidate.portal.toLowerCase();
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...candidates].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      // Listings without the datum go last in both directions.
      if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
      return sign * (typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "es"));
    });
  }, [areaOf, candidates, sort]);

  const onSort = (key: SortKey) =>
    setSort((current) => (current?.key !== key ? { key, direction: "asc" } : current.direction === "asc" ? { key, direction: "desc" } : null));

  const selectable = candidates.filter((candidate) => !candidate.existing?.inValuation);
  const chosen = selectable.filter((candidate) => selected.has(candidate.key));
  const toggle = (key: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void search.search();
  };
  const create = async () => {
    const calculation = await search.create();
    if (calculation) {
      onCreated(calculation);
      onClose();
    }
  };

  if (!setup) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role={search.setupError ? "alert" : undefined}>
        {search.setupError ?? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Preparando la búsqueda…</>}
      </p>
    );
  }
  if (!setup.enabled) {
    return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{setup.disabledReason}</p>;
  }

  const refining = search.asked.length > 0;
  const busy = running !== null || search.creating;
  return (
    <>
      <form className="grid gap-2" onSubmit={submit} noValidate>
        {refining ? (
          <ol className="grid gap-1 text-xs text-muted-foreground" aria-label="Lo que ya buscaste">
            {search.asked.map((request, index) => <li key={index}><span className="font-medium">Búsqueda {index + 1}:</span> {request}</li>)}
          </ol>
        ) : null}
        <Field>
          <FieldLabel htmlFor="ai-search-text">{refining ? "Afina la búsqueda o pide más" : "Describe lo que buscas"}</FieldLabel>
          <Textarea
            id="ai-search-text"
            rows={refining ? 2 : 4}
            autoComplete="off"
            maxLength={WEB_SEARCH_TEXT_MAX}
            value={search.text}
            disabled={busy}
            placeholder={refining ? "Por ejemplo: también los libramientos norte y sur, hasta 9,000 m²" : "Por ejemplo: terrenos en venta de 5,000 a 7,000 m² en la mancha urbana de Arandas, Jalisco"}
            aria-describedby="ai-search-hint"
            onChange={(event) => search.setText(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy}>
            {running ? <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <Sparkles data-icon="inline-start" />}
            {refining ? "Buscar más" : "Buscar"}
          </Button>
          {refining ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={search.restart}>
              <RotateCcw data-icon="inline-start" /> Nueva búsqueda
            </Button>
          ) : null}
        </div>
        <p id="ai-search-hint" className={search.error ? "text-sm text-destructive" : "text-xs text-muted-foreground"} role={search.error ? "alert" : undefined}>
          {search.error ?? (refining
            ? "Los resultados anteriores se conservan; lo nuevo se agrega a la tabla."
            : "La descripción se arma con los datos del sujeto; edítala a tu gusto. Se envía a un servicio de IA que busca anuncios en la web. No incluyas datos del cliente.")}
        </p>
      </form>

      <div className="grid gap-2" aria-live="polite" aria-busy={running !== null}>
        {running ? (
          <div className="grid gap-1.5 rounded-md border p-3 text-sm">
            <p className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              <span>
                Buscando anuncios en la web… <span className="tabular-nums">{running.searches}</span> de hasta {setup.maxSearches} búsquedas
                {" · "}<span className="tabular-nums">{running.elapsedSeconds}</span> s
              </span>
            </p>
            <Progress value={Math.min(100, (running.searches / setup.maxSearches) * 100)} aria-label="Avance de la búsqueda" />
            <p className="text-xs text-muted-foreground">
              {running.query ? <>Última consulta: «{running.query}». </> : null}
              Suele tardar de 30 segundos a 2 minutos. Puedes cerrar esta ventana: la búsqueda sigue.
            </p>
          </div>
        ) : null}

        {round && !running ? (
          <p className="text-sm">
            <span className="font-medium">{candidates.length} anuncio{candidates.length === 1 ? "" : "s"} encontrado{candidates.length === 1 ? "" : "s"}</span>
            <span className="text-muted-foreground">
              {refining && search.asked.length > 1 ? ` (${round.found} en la última búsqueda)` : ""}
              {" · "}{round.searches} búsqueda{round.searches === 1 ? "" : "s"} en la web en {round.elapsedSeconds} s
              {round.discarded ? ` · ${round.discarded} descartado${round.discarded === 1 ? "" : "s"} por no traer una liga válida, ser de otra operación o estar repetido${round.discarded === 1 ? "" : "s"}` : ""}
            </span>
          </p>
        ) : null}

        {round && !running && candidates.length < WEB_SEARCH_FEW_RESULTS ? (
          <p className="flex items-start gap-1.5 rounded-md border border-dashed p-3 text-sm text-highlight-strong">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {candidates.length ? "Se encontraron pocos anuncios." : "No se encontraron anuncios."} El mercado publicado en la web para esa zona puede ser reducido:
              amplía el rango de superficie o la zona («también las colonias vecinas», «también los libramientos») y vuelve a buscar.
            </span>
          </p>
        ) : null}

        {round?.marketNote && !running ? (
          <p className="text-xs text-muted-foreground"><span className="font-medium">Nota de la búsqueda (escrita por la IA):</span> {round.marketNote}</p>
        ) : null}

        {candidates.length ? (
          <>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-highlight-strong" />
              <span>
                Son anuncios encontrados en internet, <span className="font-medium text-foreground">sin verificar</span>. Abre cada anuncio y confirma precio, superficie y ubicación
                antes de usarlo; lo que el anuncio no publica queda vacío.
              </span>
            </p>
            <div className="max-h-96 overflow-auto rounded-md border">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr className="text-left">
                    {!readOnly ? (
                      <th className="w-8 px-2 py-1.5">
                        <Checkbox
                          aria-label="Elegir todos los anuncios"
                          checked={selectable.length > 0 && chosen.length === selectable.length}
                          disabled={!selectable.length}
                          onCheckedChange={(checked) => setSelected(checked ? new Set(selectable.map((candidate) => candidate.key)) : new Set())}
                        />
                      </th>
                    ) : null}
                    <th className="px-2 py-1.5">Anuncio</th>
                    <SortHeader label={land ? "Superficie" : "Sup. construida"} column="area" sort={sort} onSort={onSort} align="right" />
                    <SortHeader label={rent ? "Renta mensual" : "Precio"} column="price" sort={sort} onSort={onSort} align="right" />
                    <SortHeader label={rent ? "$/m²/mes" : "$/m²"} column="unitValue" sort={sort} onSort={onSort} align="right" />
                    <SortHeader label="Zona" column="zone" sort={sort} onSort={onSort} />
                    <SortHeader label="Fuente" column="portal" sort={sort} onSort={onSort} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((candidate) => {
                    const area = areaOf(candidate);
                    const folio = formatComparableId(candidate.existing?.folio);
                    return (
                      <tr key={candidate.key} className="border-t align-top" data-selected={selected.has(candidate.key) || undefined}>
                        {!readOnly ? (
                          <td className="px-2 py-1.5">
                            <Checkbox
                              aria-label={`Elegir ${candidate.title}`}
                              checked={selected.has(candidate.key) && !candidate.existing?.inValuation}
                              disabled={Boolean(candidate.existing?.inValuation)}
                              onCheckedChange={(checked) => toggle(candidate.key, checked)}
                            />
                          </td>
                        ) : null}
                        <td className="px-2 py-1.5">
                          <span className="block text-sm">{candidate.title}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-muted-foreground">
                            <Badge variant="outline">Sin verificar</Badge>
                            {candidate.existing?.inValuation ? <Badge variant="secondary">Ya está en este avalúo</Badge>
                              : candidate.existing ? <Badge variant="secondary">Ya está en tu base{folio ? ` (${folio})` : ""}: se usará esa ficha</Badge> : null}
                            {!candidate.urlConfirmed ? (
                              <span className="inline-flex items-center gap-1 text-highlight-strong">
                                <AlertTriangle className="size-3" /> La liga no salió tal cual en el buscador: ábrela antes de elegirlo
                              </span>
                            ) : null}
                            {!land && candidate.landArea ? <span>· Terreno {number(candidate.landArea)} m²</span> : null}
                            {candidate.listingDate ? <span>· Publicado {candidate.listingDate.split("-").reverse().join("/")}</span> : null}
                          </span>
                          {candidate.notes ? <span className="mt-0.5 block text-muted-foreground">{candidate.notes}</span> : null}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {area ? `${number(area)} m²` : <span className="text-muted-foreground">Superficie no publicada</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {candidate.price === null ? <span className="text-muted-foreground">Precio no publicado</span>
                            : candidate.currency === "USD" ? <>USD {number(candidate.price)}<span className="block text-muted-foreground">en dólares, sin convertir</span></>
                              : pesos(candidate.price)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{candidate.unitValue === null ? "—" : pesos(candidate.unitValue)}</td>
                        <td className="px-2 py-1.5">
                          <span className="block">{zoneOf(candidate) || <span className="text-muted-foreground">Zona no publicada</span>}</span>
                          {candidate.neighborhood || candidate.reference
                            ? <span className="block text-muted-foreground">{[candidate.municipality, candidate.state].filter(Boolean).join(", ")}</span> : null}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <span className="block">{candidate.portal}</span>
                          <a
                            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                            href={candidate.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Abrir el anuncio «${candidate.title}» en otra pestaña`}
                          >
                            <ExternalLink className="size-3.5" /> Abrir anuncio
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {readOnly ? (
              <p className="text-xs text-muted-foreground">El avalúo es de solo lectura: puedes buscar y abrir los anuncios, pero no crear fichas.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                «Crear fichas» agrega los anuncios elegidos a este mercado y a la base del despacho, con su liga y su fuente, como «Sin revisar».
                Después completa en cada ficha las fotos, la pantalla de referencia y la lista de verificación.
              </p>
            )}
          </>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" disabled={search.creating} onClick={onClose}>Cerrar</Button>
        {!readOnly ? (
          <Button type="button" disabled={busy || !chosen.length} onClick={() => void create()}>
            {search.creating ? <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : null}
            Crear fichas ({chosen.length})
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}
