"use client";

import { AlertTriangle, CircleHelp, ClipboardCheck, ExternalLink, Image as ImageIcon, Loader2, RefreshCw, Search } from "lucide-react";
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
  PENDING_REVIEW,
  REVIEW_CHECKS,
  REVIEW_CHECK_HINTS,
  REVIEW_CHECK_LABELS,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  WARNING_HELP,
  groupByComparableType,
  markAllChecks,
  statusAfterLinkCheck,
  type ComparableReviewDto,
  type ComparableWarning,
  type ReviewCheck,
  type ReviewStatus,
} from "@/features/valuations/calculation/comparable-review";
import { COMPARABLE_TYPES, COMPARABLE_TYPE_LABELS, isLandComparableType, isRentComparableType } from "@/features/valuations/calculation/market-types";
import { api, SessionExpiredError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ComparableCardButton } from "./comparable-card-dialog";
import { REVIEW_STATUS_STYLES } from "./review-status-style";
import { useExpandableDialog } from "./expandable-dialog";

const money = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-MX", { style: "currency", currency: "MXN" }));
const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo guardar la revisión.";

const statusOf = (row: ReviewRowDto): ReviewStatus => row.comparable.review?.status ?? "POR_REVISAR";

/** How long the review waits for the server before saying so and offering to try again. */
export const REVIEW_LOAD_TIMEOUT_MS = 25_000;

/** Words of the comparable to find it by: number, reference, location, source, contact, notes and warnings. */
export function reviewRowMatches(row: ReviewRowDto, query: string) {
  const plain = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const { comparable } = row;
  const haystack = plain([
    formatComparableId(comparable.folio) ?? "", `comparable ${comparable.reference}`, COMPARABLE_TYPE_LABELS[row.type], comparable.location,
    comparable.sourceName ?? "", comparable.contactName ?? "", comparable.contactPhone ?? "", comparable.url ?? "",
    comparable.review?.notes ?? "", REVIEW_STATUS_LABELS[statusOf(row)], ...row.warnings.map((warning) => warning.message),
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

/** One comparable under review: its listing and screenshot to open, the checklist and the notes. */
function ReviewRow(props: { row: ReviewRowDto; readOnly: boolean; onSaved: (review: ComparableReviewDto) => void; valuationId: string }) {
  const { comparable, type, warnings } = props.row;
  const stored = comparable.review ?? PENDING_REVIEW;
  const [status, setStatus] = useState<ReviewStatus>(stored.status);
  const [checks, setChecks] = useState<Partial<Record<ReviewCheck, boolean>>>(stored.checks);
  const [notes, setNotes] = useState(stored.notes ?? "");
  const [saving, setSaving] = useState(false);
  const id = formatComparableId(comparable.folio);
  const unitValue = comparable.area && comparable.price ? comparable.price / comparable.area : null;
  const checksShown = REVIEW_CHECKS.filter((check) => check !== "builtArea" || !isLandComparableType(type));
  const allChecked = checksShown.every((check) => checks[check] === true);
  // «El enlace sigue vigente» sets the state: unmarked, «Verificado y no vigente»; marked again, «Verificado y vigente».
  const toggleCheck = (check: ReviewCheck, checked: boolean) => {
    setChecks((current) => ({ ...current, [check]: checked }));
    if (check === "link") setStatus((current) => statusAfterLinkCheck(current, checked));
  };
  const markAll = () => {
    const next = markAllChecks(checksShown, status);
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
    <li className={cn("grid gap-2 rounded-md border p-3", REVIEW_STATUS_STYLES[stored.status].row)} data-review-row={id ?? comparable.id} data-review-status={stored.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="font-mono">{id ?? "Sin número"}</span>
            <Badge variant="secondary">{COMPARABLE_TYPE_LABELS[type]} · {comparable.reference}</Badge>
            <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-medium", REVIEW_STATUS_STYLES[stored.status].solid)}>{REVIEW_STATUS_LABELS[stored.status]}</span>
          </p>
          <p className="truncate text-sm">{comparable.location}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {money(comparable.price)} · {comparable.area ?? "—"} m² · {money(unitValue)} {isRentComparableType(type) ? "/m²/mes" : "/m²"}
            {comparable.contactName || comparable.contactPhone ? ` · ${[comparable.contactName, comparable.contactPhone].filter(Boolean).join(", ")}` : ""}
          </p>
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
              {REVIEW_STATUSES.map((item) => <NativeSelectOption key={item} value={item}>{REVIEW_STATUS_LABELS[item]}</NativeSelectOption>)}
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
              <li key={check}>
                <label className="flex items-center gap-1.5">
                  <Checkbox
                    checked={checks[check] === true}
                    onCheckedChange={(checked) => toggleCheck(check, checked === true)}
                  />
                  <span>
                    {REVIEW_CHECK_LABELS[check]}
                    {REVIEW_CHECK_HINTS[check] ? <span className="text-muted-foreground"> ({REVIEW_CHECK_HINTS[check]})</span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
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
 * "Revisión de comparables": every comparable of the valuation, across its
 * markets, to check against its listing. The state changes no calculation and
 * blocks nothing; it is the appraiser's record of what he verified.
 */
export function ComparableReviewDialog(props: {
  valuationId: string;
  readOnly: boolean;
  onReviewed: (comparableId: string, review: ComparableReviewDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ReviewRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which states to show (none chosen: all) and the words to find a comparable by.
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | null>(null);
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => rows?.filter((row) => (statusFilter === null || statusOf(row) === statusFilter) && reviewRowMatches(row, query)) ?? null,
    [rows, statusFilter, query],
  );

  // Which load is the latest: an answer of an earlier one (or one that arrives after the dialog closed) is not shown.
  const loading = useRef(0);
  const load = () => {
    const attempt = loading.current + 1;
    loading.current = attempt;
    setRows(null);
    setError(null);
    const current = () => loading.current === attempt;
    // The review never stays on "Cargando…": past the wait, it says so and offers to try again.
    const timer = window.setTimeout(() => {
      if (current()) setError(`La revisión tardó más de ${REVIEW_LOAD_TIMEOUT_MS / 1000} segundos en cargar. Revisa tu conexión e inténtalo de nuevo.`);
    }, REVIEW_LOAD_TIMEOUT_MS);
    api.market.review(props.valuationId)
      .then((next) => { if (current()) { setError(null); setRows(next); } })
      .catch((failure: unknown) => { if (current()) setError(failure instanceof Error ? failure.message : "No se pudo cargar la revisión."); })
      .finally(() => window.clearTimeout(timer));
  };

  const saved = (comparableId: string, review: ComparableReviewDto) => {
    setRows((current) => current?.map((row) => (row.comparable.id === comparableId ? { ...row, comparable: { ...row.comparable, review } } : row)) ?? null);
    props.onReviewed(comparableId, review);
  };

  const expandable = useExpandableDialog();
  const counts = REVIEW_STATUSES.map((status) => [status, rows?.filter((row) => statusOf(row) === status).length ?? 0] as const);

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
              Abre cada anuncio en otra pestaña y compara la foto, el precio, las superficies, el contacto y la dirección. El estado es tu registro
              de la revisión: no cambia ningún cálculo ni impide concluir.
            </DialogDescription>
          </DialogHeader>
          {rows ? (
            <div className="grid gap-2" data-review-filters>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
                <Button type="button" size="sm" variant={statusFilter === null ? "default" : "outline"} aria-pressed={statusFilter === null} onClick={() => setStatusFilter(null)}>
                  Todos: {rows.length}
                </Button>
                {counts.map(([status, count]) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-pressed={statusFilter === status}
                    className={cn(statusFilter === status && cn(REVIEW_STATUS_STYLES[status].solid, "border-transparent hover:opacity-90"))}
                    onClick={() => setStatusFilter((current) => (current === status ? null : status))}
                  >
                    <span className={cn("size-2 rounded-full", REVIEW_STATUS_STYLES[status].solid)} aria-hidden="true" />
                    {REVIEW_STATUS_LABELS[status]}: {count}
                  </Button>
                ))}
              </div>
              <div className="relative max-w-md">
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
            <div className="grid gap-4">
              {/* One list per market, under its title: land and buildings are not mixed. */}
              {groupByComparableType(shown, COMPARABLE_TYPES).map((group) => (
                <section key={group.type} className="grid gap-2" aria-labelledby={`review-group-${group.type}`} data-review-group={group.type}>
                  <h3 id={`review-group-${group.type}`} className="border-b pb-1 font-display text-base font-semibold">
                    {COMPARABLE_TYPE_LABELS[group.type]} <span className="text-sm font-normal text-muted-foreground tabular-nums">· {group.rows.length}</span>
                  </h3>
                  <ul className="grid gap-3">
                    {group.rows.map((row) => (
                      <ReviewRow
                        key={row.comparable.id}
                        row={row}
                        readOnly={props.readOnly}
                        valuationId={props.valuationId}
                        onSaved={(review) => saved(row.comparable.id, review)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
              {!rows?.length ? <p className="text-sm text-muted-foreground">El avalúo no tiene comparables.</p> : null}
              {rows?.length && !shown.length ? <p className="text-sm text-muted-foreground">Ningún comparable coincide con el filtro.</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
