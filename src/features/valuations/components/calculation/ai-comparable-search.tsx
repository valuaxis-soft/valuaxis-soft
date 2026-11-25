"use client";

import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, ImagePlus, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, SessionExpiredError } from "@/lib/api-client";
import { formatComparableId } from "@/features/valuations/calculation/comparable-card";
import { isLandComparableType, isRentComparableType, type ComparableType, type MarketCalculationDto } from "@/features/valuations/calculation/market-types";
import { imageCount, NO_IMAGES, uploadListingImages, type PendingImages } from "@/features/valuations/comparable-search/listing-images";
import {
  AI_COMPARABLES_PER_VALUATION,
  WEB_LISTING_DETAIL_LABELS,
  WEB_SEARCH_BATCH,
  WEB_SEARCH_FEW_RESULTS,
  WEB_SEARCH_MAX_KNOWN,
  WEB_SEARCH_MAX_PREVIOUS,
  WEB_SEARCH_TEXT_MAX,
  WEB_SEARCH_TEXT_MIN,
  candidateInputOf,
  publishedDetails,
  suggestedWebSearchText,
  type WebSearchSubject,
  type WebListingDetails,
} from "@/features/valuations/comparable-search/web-listings";
import type { AiComparableQuota, WebSearchCandidateDto, WebSearchPhase, WebSearchStatusDto } from "@/features/valuations/comparable-search/web-search.service";
import { ListingImagesPicker } from "./listing-images-picker";
import { ComparableKindField } from "./comparable-kind-field";
import { comparableClassOfType } from "@/features/valuations/calculation/comparable-classes";
import type { ComparableKind } from "@/features/valuations/calculation/comparable-kinds";

const POLL_MS = 2500;
const number = (value: number) => value.toLocaleString("es-MX", { maximumFractionDigits: 2 });
const pesos = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo buscar.";

type Setup = {
  enabled: boolean; disabledReason: string | null; suggestion: string; maxSearches: number; batch: number; quota: AiComparableQuota;
  subject: WebSearchSubject; kind: ComparableKind | null;
};
type Running = { searches: number; maxSearches: number; fetches: number; phase: WebSearchPhase; query: string | null; elapsedSeconds: number };
type Round = Pick<Extract<WebSearchStatusDto, { status: "done" }>, "discarded" | "discards" | "marketNote" | "searches" | "elapsedSeconds" | "count"> & { found: number };

/** What the search is doing, in the appraiser's words, so a long wait does not look frozen. */
function phaseText(running: Running) {
  if (running.phase === "reading") return "Revisando los datos contra la página de cada anuncio…";
  if (running.phase === "reporting") return "Escribiendo los datos de cada anuncio…";
  if (running.phase === "fetching") return `Abriendo la página de cada anuncio para confirmar que sigue publicado (${running.fetches})…`;
  return running.searches ? `Buscando anuncios en la web: ${running.searches} de hasta ${running.maxSearches} búsquedas…` : "Preparando las búsquedas…";
}

/** How far the search has gone, roughly: searching is most of it, then the pages, then the answer. */
function progressOf(running: Running) {
  if (running.phase === "reading") return 95;
  if (running.phase === "reporting") return 85;
  const searched = Math.min(1, running.searches / Math.max(1, running.maxSearches));
  return Math.min(80, Math.round(searched * 60 + (running.phase === "fetching" ? 15 : 0)));
}

/** «3 descartados por ser un listado y no la página del anuncio; 1 porque ya no está publicado». */
function discardsText(round: Round) {
  const parts = [
    round.discards.listingPage ? `${round.discards.listingPage} por traer la liga de un listado o una búsqueda y no la del anuncio` : null,
    round.discards.unpublished ? `${round.discards.unpublished} porque su página dice que ya no está publicado` : null,
    round.discards.other ? `${round.discards.other} por no traer una liga válida, ser de otra operación o estar repetido` : null,
  ].filter(Boolean);
  return parts.length ? ` · Descartados: ${parts.join("; ")}` : "";
}
type SortKey = "area" | "price" | "unitValue" | "zone" | "portal";
type Sort = { key: SortKey; direction: "asc" | "desc" };

/** «Recámaras 3», «Frente 12 m», «Edad 10 años»: a detail the listing published, as the table lists it. */
function detailText(candidate: WebListingDetails, key: keyof WebListingDetails) {
  const value = candidate[key];
  const shown = typeof value === "number" ? number(value) : value ?? "";
  const unit = key === "frontage" || key === "depth" ? " m" : key === "age" ? ` año${value === 1 ? "" : "s"}` : "";
  return `${WEB_LISTING_DETAIL_LABELS[key]} ${shown}${unit}`;
}

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
  /** «Tipo de inmueble» searched for (24 Nov 2026): the request and the cards take it. */
  const [kind, setKind] = useState<ComparableKind | null>(null);
  /** What was asked so far in this search, oldest first. */
  const [asked, setAsked] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<WebSearchCandidateDto[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [running, setRunning] = useState<Running | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** Listings the next search asks for: five, or fewer for «Buscar N más». */
  const [count, setCount] = useState(WEB_SEARCH_BATCH);
  /** Comparables found with AI the valuation includes, across its markets, and how many it may. */
  const [quota, setQuota] = useState<AiComparableQuota | null>(null);
  // The appraiser's own screenshot and photos of each listing, by its key, until its comparable is created.
  const [images, setImages] = useState<Record<string, PendingImages>>({});
  const requested = useRef(false);
  // Bumped on unmount and on «Nueva búsqueda»: an answer of before is not applied.
  const generation = useRef(0);

  useEffect(() => {
    if (!active || requested.current) return;
    requested.current = true;
    api.ai.webSearchSetup(valuationId, type)
      .then((loaded) => {
        setSetup(loaded);
        setQuota(loaded.quota);
        setKind(loaded.kind);
        setText((current) => current || loaded.suggestion);
      })
      .catch((failure) => {
        requested.current = false;
        setSetupError(errorMessage(failure));
      });
  }, [active, valuationId, type]);

  useEffect(() => () => { generation.current += 1; }, []);

  const search = useCallback(async () => {
    // «Buscar N más» without new words asks again for what was asked last.
    const request = text.trim() || asked[asked.length - 1] || "";
    if (request.length < WEB_SEARCH_TEXT_MIN) {
      setError(`Describe lo que buscas con al menos ${WEB_SEARCH_TEXT_MIN} letras: tipo de inmueble, municipio y rango de superficie.`);
      return;
    }
    const current = ++generation.current;
    setError(null);
    setRunning({ searches: 0, maxSearches: setup?.maxSearches ?? 9, fetches: 0, phase: "searching", query: null, elapsedSeconds: 0 });
    try {
      const { jobId } = await api.ai.startWebSearch(valuationId, type, {
        text: request,
        previous: asked.slice(-WEB_SEARCH_MAX_PREVIOUS),
        knownUrls: candidates.slice(-WEB_SEARCH_MAX_KNOWN).map((candidate) => candidate.url),
        count,
        kind,
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
          setRunning({
            searches: status.searches, maxSearches: status.maxSearches, fetches: status.fetches, phase: status.phase, query: status.query, elapsedSeconds: status.elapsedSeconds,
          });
          continue;
        }
        if (status.status === "failed") throw new Error(status.error);
        // What was found before stays; a listing found again is not listed twice.
        setCandidates((previous) => {
          const known = new Set(previous.map((candidate) => candidate.key));
          return [...previous, ...status.candidates.filter((candidate) => !known.has(candidate.key))];
        });
        setRound({
          found: status.candidates.length, discarded: status.discarded, discards: status.discards, marketNote: status.marketNote,
          searches: status.searches, elapsedSeconds: status.elapsedSeconds, count: status.count,
        });
        setQuota(status.quota);
        setAsked((previous) => [...previous, request]);
        setText("");
        return;
      }
    } catch (failure) {
      if (current === generation.current) setError(errorMessage(failure));
    } finally {
      if (current === generation.current) setRunning(null);
    }
  }, [asked, candidates, count, kind, setup, text, type, valuationId]);

  /**
   * Another kind: the request the box starts with is written again for it,
   * unless the appraiser already wrote one of their own.
   */
  const chooseKind = useCallback((next: ComparableKind | null) => {
    setKind(next);
    if (!setup) return;
    const before = suggestedWebSearchText(type, setup.subject, kind);
    setText((current) => (!current.trim() || current === before || current === setup.suggestion ? suggestedWebSearchText(type, setup.subject, next) : current));
  }, [kind, setup, type]);

  const restart = useCallback(() => {
    generation.current += 1;
    setAsked([]);
    setCandidates([]);
    setSelected(new Set());
    setRunning(null);
    setRound(null);
    setError(null);
    setImages({});
    setText(setup?.suggestion ?? "");
  }, [setup]);

  /** The screenshot and photos the appraiser pasted for a listing; adding some chooses it. */
  const setImagesFor = useCallback((key: string, next: PendingImages) => {
    setImages((current) => ({ ...current, [key]: next }));
    if (imageCount(next)) setSelected((current) => (current.has(key) ? current : new Set([...current, key])));
  }, []);

  const create = useCallback(async (): Promise<MarketCalculationDto | null> => {
    const chosen = candidates.filter((candidate) => selected.has(candidate.key) && !candidate.existing?.inValuation);
    if (!chosen.length) return null;
    setCreating(true);
    try {
      const result = await api.ai.addWebListings(valuationId, type, chosen.map(candidateInputOf), kind);
      setQuota(result.quota);
      const keys = new Set(chosen.map((candidate) => candidate.key));
      // They are in the valuation now: shown as such, and not offered again.
      setCandidates((previous) => previous.map((candidate) => (keys.has(candidate.key)
        ? { ...candidate, existing: { comparableId: candidate.existing?.comparableId ?? "", folio: candidate.existing?.folio ?? null, inValuation: true } }
        : candidate)));
      setSelected(new Set());
      // The images pasted for each listing go to the comparable it became, through the routes of the form.
      let calculation = result.calculation;
      let uploaded = 0;
      let failed = 0;
      let firstError: unknown = null;
      let notAttached = 0;
      for (const [index, candidate] of chosen.entries()) {
        const pending = images[candidate.key];
        const item = result.items[index];
        if (!imageCount(pending) || !pending || !item) continue;
        // One brought from the base keeps the evidence it has there; one skipped is not new.
        if (item.outcome !== "CREATED" || !item.comparableId) {
          notAttached += imageCount(pending);
          continue;
        }
        const comparableId = item.comparableId;
        const outcome = await uploadListingImages(pending, {
          screenshot: (file) => api.market.uploadScreenshot(valuationId, type, comparableId, file),
          photo: (file) => api.market.uploadPhoto(valuationId, type, comparableId, file),
        });
        uploaded += outcome.uploaded;
        failed += outcome.failed;
        firstError ??= outcome.firstError;
        if (outcome.latest) calculation = outcome.latest;
      }
      setImages((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.has(key))));
      const made = result.created + result.reused;
      const parts = [
        `${made} ficha${made === 1 ? "" : "s"} en el mercado`,
        ...(result.reused ? [`${result.reused} ya estaba${result.reused === 1 ? "" : "n"} en tu base y se usó la existente`] : []),
        ...(result.skipped ? [`${result.skipped} ya estaba${result.skipped === 1 ? "" : "n"} en el avalúo`] : []),
        ...(uploaded ? [`${uploaded} imagen${uploaded === 1 ? "" : "es"} adjunta${uploaded === 1 ? "" : "s"}`] : []),
      ];
      toast.success(`${parts.join("; ")}. Quedan «Sin revisar»: verifica cada una contra su anuncio${uploaded ? "" : " y agrega fotos y pantalla de referencia"}.`);
      if (failed) toast.error(`${failed === 1 ? "Una imagen no se pudo" : `${failed} imágenes no se pudieron`} guardar: ${errorMessage(firstError)} Agrégala${failed === 1 ? "" : "s"} desde la ficha.`);
      if (notAttached) toast.info(`${notAttached === 1 ? "Una imagen no se adjuntó" : `${notAttached} imágenes no se adjuntaron`}: su anuncio ya estaba en tu base y se usó esa ficha con su evidencia.`);
      return calculation;
    } catch (failure) {
      toast.error(errorMessage(failure));
      return null;
    } finally {
      setCreating(false);
    }
  }, [candidates, images, kind, selected, type, valuationId]);

  return {
    setup, setupError, text, setText, asked, candidates, selected, setSelected, images, setImagesFor, running, round, error, creating, search, restart, create,
    count, setCount, quota, kind, chooseKind,
  };
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
  // The listing whose screenshot and photos are being pasted, under its row.
  const [openImages, setOpenImages] = useState<string | null>(null);
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
  const quota = search.quota ?? setup.quota;
  const left = Math.max(0, quota.cap - quota.used);
  // «Buscar N más» never asks for more than the places left.
  const counts = Array.from({ length: Math.min(setup.batch, left) }, (_, index) => index + 1);
  const asking = Math.min(search.count, left);
  const tooMany = chosen.length > left;
  return (
    <>
      <div className="grid gap-1 rounded-md border bg-muted/40 p-3 text-xs" data-ai-quota>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={left ? "secondary" : "outline"} className="tabular-nums">{quota.used} de {quota.cap} con IA</Badge>
          <span className="text-muted-foreground">comparables encontrados con IA en este avalúo, sumando todos sus mercados</span>
        </p>
        <p className="text-muted-foreground">
          El avalúo puede incluir hasta {AI_COMPARABLES_PER_VALUATION} comparables encontrados con IA. Cada búsqueda propone hasta {setup.batch} anuncios y se cobra
          aunque no uses ninguno: elige bien dónde buscar. Si te faltan comparables, captúralos o búscalos a mano.
        </p>
      </div>
      <form className="grid gap-2" onSubmit={submit} noValidate>
        {refining ? (
          <ol className="grid gap-1 text-xs text-muted-foreground" aria-label="Lo que ya buscaste">
            {search.asked.map((request, index) => <li key={index}><span className="font-medium">Búsqueda {index + 1}:</span> {request}</li>)}
          </ol>
        ) : null}
        {/* What is searched for: the default request is written for it, and the cards take it. Only real estate in a market. */}
        <Field className="max-w-sm">
          <FieldLabel htmlFor="ai-search-kind">Tipo de inmueble</FieldLabel>
          <ComparableKindField
            id="ai-search-kind"
            kindClass={comparableClassOfType(type)}
            disabled={busy}
            emptyLabel="El del mercado"
            value={{ key: search.kind?.key ?? "", label: search.kind?.label ?? "" }}
            onChange={(next) => search.chooseKind(next.key ? { key: next.key, label: next.label || "Otro", class: comparableClassOfType(type) } : null)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ai-search-text">{refining ? "Afina la búsqueda o pide más" : "Describe lo que buscas"}</FieldLabel>
          <Textarea
            id="ai-search-text"
            rows={refining ? 2 : 4}
            autoComplete="off"
            maxLength={WEB_SEARCH_TEXT_MAX}
            value={search.text}
            disabled={busy}
            placeholder={refining ? "Opcional: también los libramientos norte y sur, hasta 9,000 m². Vacío, busca más de lo mismo." : "Por ejemplo: terrenos en venta de 5,000 a 7,000 m² en la mancha urbana de Arandas, Jalisco"}
            aria-describedby="ai-search-hint"
            onChange={(event) => search.setText(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          {left ? (
            <>
              <Button type="submit" disabled={busy}>
                {running ? <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <Sparkles data-icon="inline-start" />}
                {refining ? `Buscar ${asking} más` : `Buscar ${asking} anuncio${asking === 1 ? "" : "s"}`}
              </Button>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {refining ? "¿Cuántos más?" : "¿Cuántos?"}
                <NativeSelect size="sm" value={asking} disabled={busy} onChange={(event) => search.setCount(Number(event.target.value))} aria-label="Anuncios que propone la búsqueda" data-ai-count>
                  {counts.map((value) => <NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}
                </NativeSelect>
              </label>
            </>
          ) : (
            <p className="text-sm text-highlight-strong" role="status">
              Este avalúo ya tiene sus {quota.cap} comparables encontrados con IA. Captura los demás a mano o búscalos en la base del despacho.
            </p>
          )}
          {refining ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={search.restart}>
              <RotateCcw data-icon="inline-start" /> Nueva búsqueda
            </Button>
          ) : null}
        </div>
        <p id="ai-search-hint" className={search.error ? "text-sm text-destructive" : "text-xs text-muted-foreground"} role={search.error ? "alert" : undefined}>
          {search.error ?? (refining
            ? "Los resultados anteriores se conservan y no se vuelven a proponer; lo nuevo se agrega a la tabla."
            : "La descripción se arma con los datos del sujeto; edítala a tu gusto. Se envía a un servicio de IA que busca anuncios en la web. No incluyas datos del cliente.")}
        </p>
      </form>

      <div className="grid gap-2" aria-live="polite" aria-busy={running !== null}>
        {running ? (
          <div className="grid gap-1.5 rounded-md border p-3 text-sm">
            <p className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              <span data-ai-phase={running.phase}>
                {phaseText(running)}{" · "}<span className="tabular-nums">{running.elapsedSeconds}</span> s
              </span>
            </p>
            <Progress value={progressOf(running)} aria-label="Avance de la búsqueda" />
            <p className="text-xs text-muted-foreground">
              {running.query && running.phase === "searching" ? <>Última consulta: «{running.query}». </> : null}
              Suele tardar de 40 segundos a 2 minutos. Puedes cerrar esta ventana: la búsqueda sigue.
            </p>
          </div>
        ) : null}

        {round && !running ? (
          <p className="text-sm">
            <span className="font-medium">{candidates.length} anuncio{candidates.length === 1 ? "" : "s"} encontrado{candidates.length === 1 ? "" : "s"}</span>
            <span className="text-muted-foreground">
              {refining && search.asked.length > 1 ? ` (${round.found} de ${round.count} pedidos en la última búsqueda)` : round.found < round.count ? ` de ${round.count} pedidos` : ""}
              {" · "}{round.searches} búsqueda{round.searches === 1 ? "" : "s"} en la web en {round.elapsedSeconds} s
              {discardsText(round)}
            </span>
          </p>
        ) : null}

        {round && !running && round.found < Math.min(round.count, WEB_SEARCH_FEW_RESULTS) ? (
          <p className="flex items-start gap-1.5 rounded-md border border-dashed p-3 text-sm text-highlight-strong">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {round?.found ? "Se encontraron pocos anuncios." : "No se encontraron anuncios nuevos."} El mercado publicado en la web para esa zona puede ser reducido:
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
                    const details = publishedDetails(candidate);
                    const pending = search.images[candidate.key] ?? NO_IMAGES;
                    // Images go to a comparable created from this listing: not to one already in the valuation or brought from the base.
                    const takesImages = !readOnly && !candidate.existing;
                    const imagesOpen = openImages === candidate.key;
                    return (
                      <Fragment key={candidate.key}>
                      <tr className="border-t align-top" data-selected={selected.has(candidate.key) || undefined}>
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
                            {candidate.pageRead ? (
                              <Badge variant="secondary" data-page-read>
                                Página abierta: sigue publicado{candidate.verifiedFields.length ? ` · ${candidate.verifiedFields.length} datos confirmados en ella` : ""}
                              </Badge>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-highlight-strong" data-page-unread>
                                <AlertTriangle className="size-3" /> No se pudo abrir el anuncio: confirma que siga publicado
                              </span>
                            )}
                            {!candidate.urlConfirmed ? (
                              <span className="inline-flex items-center gap-1 text-highlight-strong">
                                <AlertTriangle className="size-3" /> La liga no salió tal cual en el buscador: ábrela antes de elegirlo
                              </span>
                            ) : null}
                            {!land && candidate.landArea ? <span>· Terreno {number(candidate.landArea)} m²</span> : null}
                            {candidate.listingDate ? <span>· Publicado {candidate.listingDate.split("-").reverse().join("/")}</span> : null}
                          </span>
                          {candidate.notes ? <span className="mt-0.5 block text-muted-foreground">{candidate.notes}</span> : null}
                          {details.length ? (
                            <span className="mt-0.5 block" data-listing-details>
                              <span className="font-medium">Datos del anuncio ({details.length}):</span>{" "}
                              <span className="text-muted-foreground">{details.map((key) => detailText(candidate, key)).join(" · ")}</span>
                            </span>
                          ) : null}
                          {takesImages ? (
                            <Button
                              type="button" size="xs" variant={imageCount(pending) ? "secondary" : "ghost"} className="mt-1"
                              aria-expanded={imagesOpen}
                              onClick={() => setOpenImages(imagesOpen ? null : candidate.key)}
                              data-listing-images-toggle
                            >
                              <ImagePlus data-icon="inline-start" />
                              {imageCount(pending)
                                ? `Captura y fotos (${imageCount(pending)})`
                                : "Pegar captura y fotos"}
                            </Button>
                          ) : null}
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
                      {takesImages && imagesOpen ? (
                        <tr className="bg-muted/30" data-listing-images-row>
                          <td colSpan={7} className="px-2 py-2">
                            <ListingImagesPicker
                              images={pending}
                              onChange={(next) => search.setImagesFor(candidate.key, next)}
                              label={`Captura y fotos de «${candidate.title}»`}
                              baseName="anuncio"
                              disabled={busy}
                              autoFocus
                              hint="Abre el anuncio, toma la captura y pégala. Se guardan con la ficha al crearla."
                            />
                          </td>
                        </tr>
                      ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {readOnly ? (
              <p className="text-xs text-muted-foreground">El avalúo es de solo lectura: puedes buscar y abrir los anuncios, pero no crear fichas.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                «Crear fichas» agrega los anuncios elegidos a este mercado y a la base del despacho, con su liga, su fuente y los datos que publica, como «Sin revisar»;
                la fecha de la oferta es la de consulta si el anuncio no dice otra, y la vigencia, de 6 meses.
                Con «Pegar captura y fotos» pegas la captura del anuncio que abriste y sus fotos: se guardan como pantalla de referencia y fotografías de la ficha.
              </p>
            )}
          </>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" disabled={search.creating} onClick={onClose}>Cerrar</Button>
        {!readOnly && tooMany ? (
          <p className="text-xs text-destructive" role="alert">
            {left ? `Solo puedes agregar ${left} más con IA en este avalúo: elige menos anuncios.` : "Este avalúo ya tiene sus comparables encontrados con IA."}
          </p>
        ) : null}
        {!readOnly ? (
          <Button type="button" disabled={busy || !chosen.length || tooMany} onClick={() => void create()}>
            {search.creating ? <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : null}
            Crear fichas ({chosen.length})
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}
