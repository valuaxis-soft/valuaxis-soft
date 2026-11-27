"use client";

import { AlertTriangle, CircleHelp, ClipboardCheck, ExternalLink, Image as ImageIcon, ListChecks, Loader2, RefreshCw, Search } from "lucide-react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatComparableId } from "@/features/valuations/calculation/comparable-card";
import type { ReviewRowDto } from "@/features/valuations/calculation/comparable-card.service";
import {
  DEFAULT_REVIEW_STATUS_LIST,
  PENDING_REVIEW,
  WARNING_HELP,
  groupByComparableType,
  isVerifiedStatus,
  markAllChecks,
  reviewMarketOrder,
  reviewStatusOf,
  statusAfterLinkCheck,
  type ComparableReviewDto,
  type ReviewStatusItem,
  type ComparableWarning,
  type ReviewChecks,
  type ReviewStatus,
} from "@/features/valuations/calculation/comparable-review";
import {
  DEFAULT_REVIEW_CHECKLIST,
  checklistFor,
  missingRequiredChecks,
  type ComparableReviewChecklist,
} from "@/features/valuations/calculation/comparable-review-checklist";
import { COMPARABLE_TYPE_LABELS, isRentComparableType, type ComparableType } from "@/features/valuations/calculation/market-types";
import { api, SessionExpiredError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ComparableCardButton } from "./comparable-card-dialog";
import { REVIEW_TONE_STYLES } from "./review-status-style";
import { ReviewStatusEditor } from "./review-status-editor";
import { useExpandableDialog } from "./expandable-dialog";
import { MARKET_ACCENT } from "./market-accent";

const money = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-MX", { style: "currency", currency: "MXN" }));
const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo guardar la revisión.";

const statusOf = (row: ReviewRowDto): ReviewStatus => row.comparable.review?.status ?? "POR_REVISAR";

/** How long the review waits for the server before saying so and offering to try again. */
export const REVIEW_LOAD_TIMEOUT_MS = 25_000;

/** Words of the comparable to find it by: number, reference, location, source, contact, notes and warnings. */
export function reviewRowMatches(row: ReviewRowDto, query: string, statuses: readonly ReviewStatusItem[] = DEFAULT_REVIEW_STATUS_LIST) {
  const plain = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const { comparable } = row;
  const haystack = plain([
    formatComparableId(comparable.folio) ?? "", `comparable ${comparable.reference}`, COMPARABLE_TYPE_LABELS[row.type], comparable.location,
    comparable.sourceName ?? "", comparable.contactName ?? "", comparable.contactPhone ?? "", comparable.url ?? "",
    comparable.review?.notes ?? "", reviewStatusOf(statusOf(row), statuses, comparable.review).label, ...row.warnings.map((warning) => warning.message),
  ].join(" "));
  return words.every((word) => haystack.includes(word));
}

/** A warning with its help on hover or focus: what it means and what to do. */
function WarningLine({ warning }: { warning: ComparableWarning }) {
  return (
    <li className="flex items-start gap-1">
      <AlertTriangle className="mt-0.5 size-3 shrink-0" /> <span>{warning.message}</span>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger
          className="inline-flex shrink-0 rounded-full text-highlight-strong hover:text-foreground focus-visible:outline-2"
          aria-label={`Qué significa: ${WARNING_HELP[warning.key]}`}
        >
          <CircleHelp className="size-3.5" />
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner sideOffset={4} className="isolate z-[60]">
            <TooltipPrimitive.Popup className="max-w-xs rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md" data-warning-help={warning.key}>
              {WARNING_HELP[warning.key]}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </li>
  );
}

/** One comparable under review: its listing and screenshot to open, the firm's checklist and the notes. */
function ReviewRow(props: {
  row: ReviewRowDto;
  readOnly: boolean;
  onSaved: (review: ComparableReviewDto) => void;
  valuationId: string;
  checklist: ComparableReviewChecklist;
  statuses: ReviewStatusItem[];
  /** In the bulk review (V8.13): whether it is chosen, and choosing it. */
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
}) {
  const { comparable, type, warnings } = props.row;
  const stored = comparable.review ?? PENDING_REVIEW;
  const [status, setStatus] = useState<ReviewStatus>(stored.status);
  const [checks, setChecks] = useState<ReviewChecks>(stored.checks);
  const [notes, setNotes] = useState(stored.notes ?? "");
  const [saving, setSaving] = useState(false);
  const id = formatComparableId(comparable.folio);
  const unitValue = comparable.area && comparable.price ? comparable.price / comparable.area : null;
  const storedStatus = reviewStatusOf(stored.status, props.statuses, stored);
  // A state the firm took out of its list is still offered to the comparable that has it, under its name.
  const options = props.statuses.some((item) => item.key === stored.status) ? props.statuses : [...props.statuses, storedStatus];
  // The firm's points (Despacho → Revisión de comparables); the built area is not one of a land comparable.
  const checksShown = checklistFor(props.checklist, type);
  const allChecked = checksShown.every((check) => checks[check.key] === true);
  // Required points only warn: verified without them, the row says which are missing.
  const missingRequired = isVerifiedStatus(status) ? missingRequiredChecks(checksShown, checks) : [];
  // «El enlace sigue vigente» sets the state: unmarked, «Verificado y no vigente»; marked again, «Verificado y vigente».
  const toggleCheck = (check: string, checked: boolean) => {
    setChecks((current) => ({ ...current, [check]: checked }));
    if (check === "link") setStatus((current) => statusAfterLinkCheck(current, checked));
  };
  const markAll = () => {
    const next = markAllChecks(checksShown.map((check) => check.key), status);
    setChecks((current) => ({ ...current, ...next.checks }));
    setStatus(next.status);
  };
  const changed = status !== stored.status || notes.trim() !== (stored.notes ?? "") || JSON.stringify(checks) !== JSON.stringify(stored.checks);

  const save = async () => {
    setSaving(true);
    try {
      const review = await api.market.saveReview(props.valuationId, comparable.id, { status, checks, notes: notes.trim() || null });
      props.onSaved(review);
      toast.success(`Revisión de ${id ?? `comparable ${comparable.reference}`} guardada.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li
      className={cn("grid gap-2 rounded-md border p-3", REVIEW_TONE_STYLES[storedStatus.tone].row, props.selected && "ring-2 ring-ring")}
      data-review-row={id ?? comparable.id}
      data-review-status={stored.status}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {props.onSelect ? (
            <Checkbox
              className="mt-0.5"
              checked={props.selected === true}
              onCheckedChange={(checked) => props.onSelect?.(checked === true)}
              aria-label={`Elegir ${id ?? `el comparable ${comparable.reference}`} para la revisión en lote`}
              data-review-select=""
            />
          ) : null}
          <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="font-mono">{id ?? "Sin número"}</span>
            <Badge variant="secondary">{COMPARABLE_TYPE_LABELS[type]} · {comparable.reference}</Badge>
            <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-medium", REVIEW_TONE_STYLES[storedStatus.tone].solid)}>{storedStatus.label}</span>
          </p>
          <p className="truncate text-sm">{comparable.location}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {money(comparable.price)} · {comparable.area ?? "—"} m² · {money(unitValue)} {isRentComparableType(type) ? "/m²/mes" : "/m²"}
            {comparable.contactName || comparable.contactPhone ? ` · ${[comparable.contactName, comparable.contactPhone].filter(Boolean).join(", ")}` : ""}
          </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {comparable.url ? (
            <a className={cn(buttonVariants({ size: "sm", variant: "outline" }))} href={comparable.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink data-icon="inline-start" /> Abrir anuncio
            </a>
          ) : <Button type="button" size="sm" variant="outline" disabled>Sin liga</Button>}
          {comparable.screenshot?.url ? (
            <a className={cn(buttonVariants({ size: "sm", variant: "outline" }))} href={comparable.screenshot.url} target="_blank" rel="noopener noreferrer">
              <ImageIcon data-icon="inline-start" /> Ver pantalla de referencia
            </a>
          ) : <Button type="button" size="sm" variant="outline" disabled>Sin pantalla</Button>}
          <ComparableCardButton comparableId={comparable.id} />
        </div>
      </div>

      {warnings.length ? (
        <ul className="grid gap-0.5 text-xs text-highlight-strong" data-review-warnings>
          {warnings.map((warning, index) => <WarningLine key={`${warning.key}-${index}`} warning={warning} />)}
        </ul>
      ) : null}

      <fieldset disabled={props.readOnly || saving} className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          <label className="grid gap-1 text-xs">
            Estado
            <NativeSelect className="w-full" value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus)} aria-label={`Estado de ${id ?? comparable.reference}`}>
              {options.map((item) => <NativeSelectOption key={item.key} value={item.key}>{item.label}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <ul className="grid gap-1 text-xs">
            <li>
              <label className="flex items-center gap-1.5 font-medium">
                <Checkbox checked={allChecked} disabled={allChecked} onCheckedChange={(checked) => { if (checked === true) markAll(); }} />
                Marcar todas
              </label>
            </li>
            {checksShown.map((check) => (
              <li key={check.key} data-review-check={check.key}>
                <label className="flex items-center gap-1.5">
                  <Checkbox
                    checked={checks[check.key] === true}
                    onCheckedChange={(checked) => toggleCheck(check.key, checked === true)}
                  />
                  <span>
                    {check.label}
                    {check.required ? <span className="font-medium text-amber-700 dark:text-amber-400"> · obligatoria</span> : null}
                    {check.hint ? <span className="text-muted-foreground"> ({check.hint})</span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {missingRequired.length ? (
            <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400" data-review-missing-required>
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>Faltan verificaciones obligatorias del despacho: {missingRequired.map((check) => check.label).join(", ")}. Puedes guardar así; anota en las notas por qué.</span>
            </p>
          ) : null}
        </div>
        <div className="grid content-start gap-2">
          <label className="grid gap-1 text-xs">
            Notas de la revisión
            <Textarea rows={4} value={notes} placeholder="Qué no coincide con el anuncio, qué se corrigió…" onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {stored.reviewedBy ? `Revisado por ${stored.reviewedBy}${stored.reviewedAt ? ` el ${new Date(stored.reviewedAt).toLocaleString("es-MX")}` : ""}` : "Sin revisar"}
            </span>
            {!props.readOnly ? (
              <Button type="button" size="sm" disabled={saving || !changed} onClick={() => void save()}>
                {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                Guardar revisión
              </Button>
            ) : null}
          </div>
        </div>
      </fieldset>
    </li>
  );
}

/**
 * «Revisión en lote» (V8.13, 13:44 to 17:13: «una casilla de seleccionar
 * todos los comparables… marcar todas las casillas… el estatus… y guardar
 * revisión»): the comparables chosen take one state, with every check of the
 * list marked when asked, saved once for all. Each one's notes stay.
 */
function BulkReviewBar(props: {
  valuationId: string;
  selected: ReviewRowDto[];
  statuses: ReviewStatusItem[];
  onClear: () => void;
  onSaved: (reviews: Array<{ comparableId: string; review: ComparableReviewDto }>) => void;
}) {
  const [status, setStatus] = useState<ReviewStatus>("VERIFICADO");
  const [markAll, setMarkAll] = useState(true);
  const [saving, setSaving] = useState(false);
  const count = props.selected.length;
  if (!count) return null;
  // The state chosen, or the first of the firm's list when the firm took it out.
  const chosen = props.statuses.find((item) => item.key === status) ?? props.statuses[0];
  const markets = [...new Set(props.selected.map((row) => COMPARABLE_TYPE_LABELS[row.type].toLowerCase()))].join(", ");

  const save = async () => {
    setSaving(true);
    try {
      const reviews = await api.market.saveReviews(props.valuationId, {
        comparableIds: props.selected.map((row) => row.comparable.id), status: chosen.key, markAll,
      });
      props.onSaved(reviews);
      toast.success(`Revisión guardada en ${reviews.length} comparable${reviews.length === 1 ? "" : "s"}: ${chosen.label}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="sticky bottom-0 z-20 grid gap-2 rounded-md border-2 border-ring bg-card p-3 shadow-lg"
      aria-label="Revisión en lote"
      data-bulk-review=""
    >
      <p className="text-sm font-semibold">
        {count} comparable{count === 1 ? "" : "s"} seleccionado{count === 1 ? "" : "s"} <span className="font-normal text-muted-foreground">({markets})</span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm">
          Estado
          <span className={cn("size-3 rounded-full", REVIEW_TONE_STYLES[chosen.tone].solid)} aria-hidden="true" />
          <NativeSelect value={chosen.key} onChange={(event) => setStatus(event.target.value)} aria-label="Estado para los seleccionados" data-bulk-status="">
            {props.statuses.map((item) => <NativeSelectOption key={item.key} value={item.key}>{item.label}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <Checkbox checked={markAll} onCheckedChange={(checked) => setMarkAll(checked === true)} data-bulk-mark-all="" />
          Marcar todas las casillas de la lista
        </label>
        <span className="flex-1" />
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={props.onClear}>Quitar selección</Button>
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()} data-bulk-save="">
          {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <ClipboardCheck data-icon="inline-start" />}
          Guardar revisión de {count}
        </Button>
      </div>
    </section>
  );
}

/**
 * "Revisión de comparables": every comparable of the valuation, across its
 * markets, to check against its listing. The state changes no calculation and
 * blocks nothing; it is the appraiser's record of what he verified.
 */
export function ComparableReviewDialog(props: {
  valuationId: string;
  readOnly: boolean;
  onReviewed: (comparableId: string, review: ComparableReviewDto) => void;
  /** The market it is opened from: its comparables go first (V8.13, 13:04: «lo primero que me debe de aparecer es lo que estoy abriendo»). */
  type?: ComparableType;
  /** The firm's states after they were edited here, for the chips of the market. */
  onStatuses?: (statuses: ReviewStatusItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  /** The comparables chosen for the review in bulk (V8.13), by id. */
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [rows, setRows] = useState<ReviewRowDto[] | null>(null);
  const [checklist, setChecklist] = useState<ComparableReviewChecklist>(DEFAULT_REVIEW_CHECKLIST);
  /** The firm's states (V8.12): edited here, for the whole firm. */
  const [statuses, setStatuses] = useState<ReviewStatusItem[]>(DEFAULT_REVIEW_STATUS_LIST);
  const [editingStatuses, setEditingStatuses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which states to show (none chosen: all) and the words to find a comparable by.
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | null>(null);
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => rows?.filter((row) => (statusFilter === null || statusOf(row) === statusFilter) && reviewRowMatches(row, query, statuses)) ?? null,
    [rows, statusFilter, query, statuses],
  );

  // Which load is the latest: an answer of an earlier one (or one that arrives after the dialog closed) is not shown.
  const loading = useRef(0);
  const load = () => {
    const attempt = loading.current + 1;
    loading.current = attempt;
    setRows(null);
    setError(null);
    setSelected(new Set());
    const current = () => loading.current === attempt;
    // The review never stays on "Cargando…": past the wait, it says so and offers to try again.
    const timer = window.setTimeout(() => {
      if (current()) setError(`La revisión tardó más de ${REVIEW_LOAD_TIMEOUT_MS / 1000} segundos en cargar. Revisa tu conexión e inténtalo de nuevo.`);
    }, REVIEW_LOAD_TIMEOUT_MS);
    // The firm's checklist; without it (an older server, a network hiccup) the built-in list.
    const checklistLoad = api.firm.reviewChecklist().catch(() => ({ ...DEFAULT_REVIEW_CHECKLIST, statuses: DEFAULT_REVIEW_STATUS_LIST }));
    Promise.all([api.market.review(props.valuationId), checklistLoad])
      .then(([next, firmChecklist]) => {
        if (!current()) return;
        setError(null);
        setChecklist(firmChecklist);
        setStatuses(firmChecklist.statuses ?? DEFAULT_REVIEW_STATUS_LIST);
        setRows(next);
      })
      .catch((failure: unknown) => { if (current()) setError(failure instanceof Error ? failure.message : "No se pudo cargar la revisión."); })
      .finally(() => window.clearTimeout(timer));
  };

  const saved = (comparableId: string, review: ComparableReviewDto) => {
    setRows((current) => current?.map((row) => (row.comparable.id === comparableId ? { ...row, comparable: { ...row.comparable, review } } : row)) ?? null);
    props.onReviewed(comparableId, review);
  };

  const expandable = useExpandableDialog();
  // The firm's states, and those a comparable keeps after the firm took them out of its list.
  const kept = (rows ?? []).flatMap((row) => (statuses.some((item) => item.key === statusOf(row)) ? [] : [reviewStatusOf(statusOf(row), null, row.comparable.review)]));
  const shownStatuses = [...statuses, ...kept.filter((item, index) => kept.findIndex((other) => other.key === item.key) === index)];
  const counts = shownStatuses.map((status) => [status, rows?.filter((row) => statusOf(row) === status.key).length ?? 0] as const);
  const groups = shown ? groupByComparableType(shown, reviewMarketOrder(props.type)) : [];
  const editable = !props.readOnly;
  const choose = (ids: readonly string[], on: boolean) => setSelected((current) => {
    const next = new Set(current);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    return next;
  });
  const statusesChanged = (next: ReviewStatusItem[]) => {
    setStatuses(next);
    props.onStatuses?.(next);
  };
  const bulkSaved = (reviews: Array<{ comparableId: string; review: ComparableReviewDto }>) => {
    for (const { comparableId, review } of reviews) saved(comparableId, review);
    setSelected(new Set());
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => { setOpen(true); load(); }}>
        <ClipboardCheck data-icon="inline-start" /> Revisión de comparables
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={expandable.className("max-h-[92vh] overflow-y-auto sm:max-w-6xl")}>
          {expandable.button}
          <DialogHeader>
            <DialogTitle>Revisión de comparables</DialogTitle>
            <DialogDescription>
              Abre cada anuncio en otra pestaña y revisa los puntos de la lista del despacho (el administrador la cambia en Despacho → Datos del
              despacho → Revisión de comparables). El estado es tu registro de la revisión: no cambia ningún cálculo ni impide concluir.
            </DialogDescription>
          </DialogHeader>
          {editingStatuses ? (
            <ReviewStatusEditor statuses={statuses} onSaved={statusesChanged} onClose={() => setEditingStatuses(false)} />
          ) : null}
          {rows ? (
            <div className="grid gap-2" data-review-filters>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
                <Button type="button" size="sm" variant={statusFilter === null ? "default" : "outline"} aria-pressed={statusFilter === null} onClick={() => setStatusFilter(null)}>
                  Todos: {rows.length}
                </Button>
                {counts.map(([status, count]) => (
                  <Button
                    key={status.key}
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-pressed={statusFilter === status.key}
                    className={cn(statusFilter === status.key && cn(REVIEW_TONE_STYLES[status.tone].solid, "border-transparent hover:opacity-90"))}
                    onClick={() => setStatusFilter((current) => (current === status.key ? null : status.key))}
                  >
                    <span className={cn("size-2 rounded-full", REVIEW_TONE_STYLES[status.tone].solid)} aria-hidden="true" />
                    {status.label}: {count}
                  </Button>
                ))}
                {/* V8.12: the list of states, editable here, «una opción aquí arribita». */}
                {!props.readOnly && !editingStatuses ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingStatuses(true)} data-edit-review-statuses>
                    <ListChecks data-icon="inline-start" /> Editar estados
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-md">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    type="search"
                    value={query}
                    placeholder="Buscar por número, ubicación, fuente, contacto o aviso"
                    aria-label="Buscar comparables en la revisión"
                    className="pl-8"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                {/* V8.13 (14:36): «seleccionar comparables de todos», then mark them at once below. */}
                {editable && shown?.length ? (
                  <label className="flex items-center gap-1.5 text-sm font-medium" data-review-select-all="">
                    <Checkbox
                      checked={shown.every((row) => selected.has(row.comparable.id))}
                      onCheckedChange={(checked) => choose(shown.map((row) => row.comparable.id), checked === true)}
                    />
                    Seleccionar todos ({shown.length})
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="flex flex-wrap items-center gap-2" role="alert">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" size="sm" variant="outline" onClick={load}><RefreshCw data-icon="inline-start" /> Reintentar</Button>
            </div>
          ) : null}
          {!rows && !error ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando los comparables…</p>
          ) : null}
          {shown ? (
            <div className="grid gap-5">
              {/*
                One list per market, under its title: land and buildings are not mixed. V8.13 (12:39): the market it was opened
                from first, each title big, in the colour of its market, and fixed at the top while its comparables scroll.
              */}
              {groups.map((group) => {
                const ids = group.rows.map((row) => row.comparable.id);
                const accent = MARKET_ACCENT[group.type];
                return (
                  <section key={group.type} className="grid gap-2" aria-labelledby={`review-group-${group.type}`} data-review-group={group.type}>
                    <header
                      className={cn("sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border-l-8 px-3 py-2 shadow-sm", accent.border, accent.here)}
                      data-review-group-header={group.type}
                    >
                      <h3 id={`review-group-${group.type}`} className="font-display text-lg font-semibold">
                        {COMPARABLE_TYPE_LABELS[group.type]} <span className="text-base font-normal tabular-nums">· {group.rows.length}</span>
                      </h3>
                      {group.type === props.type ? <Badge variant="outline" className="border-current">El mercado que abriste</Badge> : null}
                      {editable ? (
                        <label className="ml-auto flex items-center gap-1.5 text-sm font-medium" data-review-select-group={group.type}>
                          <Checkbox checked={ids.every((id) => selected.has(id))} onCheckedChange={(checked) => choose(ids, checked === true)} />
                          Seleccionar los de {COMPARABLE_TYPE_LABELS[group.type].toLowerCase()}
                        </label>
                      ) : null}
                    </header>
                    <ul className="grid gap-3">
                      {group.rows.map((row) => (
                        <ReviewRow
                          // A review saved in bulk replaces what the row had on screen.
                          key={`${row.comparable.id}:${row.comparable.review?.reviewedAt ?? ""}`}
                          row={row}
                          readOnly={props.readOnly}
                          valuationId={props.valuationId}
                          checklist={checklist}
                          statuses={statuses}
                          onSaved={(review) => saved(row.comparable.id, review)}
                          selected={selected.has(row.comparable.id)}
                          onSelect={editable ? (on) => choose([row.comparable.id], on) : undefined}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
              {!rows?.length ? <p className="text-sm text-muted-foreground">El avalúo no tiene comparables.</p> : null}
              {rows?.length && !shown.length ? <p className="text-sm text-muted-foreground">Ningún comparable coincide con el filtro.</p> : null}
            </div>
          ) : null}
          {editable && rows ? (
            <BulkReviewBar
              valuationId={props.valuationId}
              selected={(rows ?? []).filter((row) => selected.has(row.comparable.id))}
              statuses={statuses}
              onClear={() => setSelected(new Set())}
              onSaved={bulkSaved}
            />
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
