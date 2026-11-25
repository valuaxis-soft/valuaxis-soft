"use client";

import { AlertTriangle, ArrowDown, ArrowDownWideNarrow, ArrowUp, ArrowUpNarrowWide, Calculator, ChevronRight, EyeOff, FileDown, IdCard, Loader2, MapPin, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { Fragment, useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { api, SessionExpiredError, type ComparableFormValues } from "@/lib/api-client";
import { cn, countLabel } from "@/lib/utils";
import { CALC_HEAD, CALC_HEAD_CELL, CALC_ROW, CALC_SECTION_HEADING, CALC_TABLE, CALC_TABLE_FRAME } from "./calculation-table-style";
import { CalcTableContextMenu } from "./calc-table-context-menu";
import { useAiAssist } from "@/features/ai/ai-assist-context";
import type { ComparablePrefill } from "@/features/ai/listing-prefill";
import type { CustomFactor } from "@/features/firm/custom-factors";
import { DEFAULT_ENGINE_CONFIG } from "@/features/valuations/engine/config";
import { computeMarketApproach, type MarketApproachResult } from "@/features/valuations/engine/market";
import {
  COMPARABLE_TYPE_LABELS,
  MARKET_LABELS,
  MIN_COMPARABLES,
  SALE_COMPARABLE_TYPES,
  characteristicFieldsOf,
  comparableFormValues,
  homologatesOf,
  homologationBasisOf,
  isComparableComplete,
  isLandComparableType,
  isRentComparableType,
  marketEngineConfig,
  marketSurfaceFormula,
  surfaceFactorFormulas,
  offerLabelsOf,
  offerMarkOf,
  printedStatisticsOf,
  printsAdditionalAmount,
  toMarketEngineInput,
  type ComparableDto,
  type ComparableType,
  type HomologationBasis,
  type MarketCalculationDto,
  type MarketSettingsDto,
  type MarketStatistic,
  type PrintedStatistics,
} from "@/features/valuations/calculation/market-types";
import { ADOPTED_VALUE_OUTSIDE_MESSAGE } from "@/features/valuations/calculation/adopted-value-check";
import {
  DEFAULT_HOMOLOGATION_NOTE,
  MARKET_TEMPLATE_BLOCK_IDS,
  RENT_TEMPLATE_BLOCK_IDS,
  SAME_FACTORS_AS_LAND_SALE,
  characteristicsLine,
  defaultOfferIntro,
  marketCaptureColumns,
  marketFactorColumnId,
  marketHomologationTableId,
  marketDocumentBlocks,
  suggestedSubjectAreaFor,
} from "@/features/valuations/calculation/market-document";
import type { CapturePages } from "@/features/valuations/calculation/capture-display";
import { CaptureSlot, useCaptureHeaderRename, usePublishCapturePages } from "../editor/capture-host";
import { CommitCell } from "./commit-cell";
import {
  COMPUTED_FACTORS,
  DIRECT_FACTORS,
  EMPTY_FACTOR_CATALOG,
  optionsFor,
  type FactorCatalog,
} from "@/features/valuations/calculation/factor-catalog";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { collectFormulas, withFormulaTexts } from "@/features/valuations/calculation/captured-formulas";
import { FormulaInput, LiveFormulaOwnerProvider } from "./formula-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatComparableId, todayInMexico } from "@/features/valuations/calculation/comparable-card";
import { REVIEW_STATUS_LABELS, comparableWarnings, isVerifiedStatus } from "@/features/valuations/calculation/comparable-review";
import { builtAreaToleranceOf } from "@/features/valuations/calculation/comparable-review-checklist";
import { changesList, comparableListSteps } from "./market-comparable-undo";
import { marketMemoryKey, sessionStore, storeMarketScroll, storeMarketType, storedMarketScroll, storedMarketType } from "./market-tab-memory";
import { ComparableDialog, type PendingImages } from "./comparable-dialog";
import { ComparableReviewDialog } from "./comparable-review-dialog";
import { RoundingSelect, SurfacePowerSelect } from "./calculation-controls";
import { CalculationPrecisionSummary } from "./calculation-precision-control";
import { factorDecimals } from "@/features/valuations/calculation/calculation-precision";
import { ImportComparablesDialog } from "./import-comparables-dialog";
import { ComparableCharacteristicCell, MarketCharacteristicsTable, characteristicNumberText, newFieldKey, type FieldsUpdate, type SubjectUpdate } from "./market-characteristics-table";
import { MARKET_ACCENT } from "./market-accent";
import { MarketEditSession, rebaseDraft } from "./market-edit-session";
import { SortableRows, useSortableRow } from "./sortable-rows";
import { mirroredAttributes, sharedCharacteristics, unsharedAttributes } from "@/features/valuations/calculation/market-characteristic-sharing";
import type { SubjectFacts } from "@/features/valuations/calculation/market-subject-facts";
import { MarketFactorSlots } from "./market-factor-slots";
import { MarketHomologationCapture } from "./market-homologation-table";

/** A datum of a comparable in its cell of the table of the dictamen: framed as a field, the appraiser's among the gray figures. */
const CAPTURE_TEXT_CELL = "border-input bg-background text-xs";
import { MarketOfferLevel } from "./market-offer-level";
import { PasteListingDialog } from "./paste-listing-dialog";
import { SearchComparablesDialog } from "./search-comparables-dialog";
import type { GoogleMapsPageConfig } from "@/features/maps/components/location-panel";
import { useDraftHistory } from "./use-draft-history";
import { useNumberPresentation } from "@/features/valuations/components/number-presentation-context";
import { useConfirmDelete } from "@/features/valuations/components/editor/delete-confirm";

/** What the panel's undo goes back to: the settings (chips and their order included) and the comparables as captured. */
export type MarketSnapshot = { settings: MarketSettingsDto; comparables: ComparableDto[] };

/** The comparables of `target` that differ from those of `current` in what the appraiser captures (by id; added or removed ones are not restored). */
export function changedComparables(current: ComparableDto[], target: ComparableDto[]): ComparableDto[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  return target.filter((item) => {
    const now = byId.get(item.id);
    return now !== undefined && JSON.stringify(comparableFormValues(now)) !== JSON.stringify(comparableFormValues(item));
  });
}

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const text = (value: number | null) => (value === null ? "" : String(value));

function compute(calculation: Pick<MarketCalculationDto, "settings" | "comparables" | "precision">):
  { result: MarketApproachResult | null; reason: string | null } {
  const input = toMarketEngineInput(calculation);
  if (!input.ok) return { result: null, reason: input.reason };
  return { result: computeMarketApproach(input.input, marketEngineConfig(calculation.settings, calculation.precision)), reason: null };
}

type SettingsDraft = Record<
  "subjectArea" | "baseArea" | "adoptedUnitValue" | "additionalAmount" | "justification" | "typicalFrontage" | "typicalDepth", string>;

/** The settings' fields edited as text; a field typed as a formula reads back as typed. */
const draftFrom = (settings: MarketSettingsDto): SettingsDraft => withFormulaTexts(plainDraftFrom(settings), settings.formulas);

const plainDraftFrom = (settings: MarketSettingsDto): SettingsDraft => ({
  subjectArea: text(settings.subjectArea),
  baseArea: text(settings.baseArea),
  adoptedUnitValue: text(settings.adoptedUnitValue),
  additionalAmount: settings.additionalAmount ? String(settings.additionalAmount) : "",
  justification: settings.justification ?? "",
  typicalFrontage: text(settings.typicalFrontage ?? null),
  typicalDepth: text(settings.typicalDepth ?? null),
});

function settingsFrom(base: MarketSettingsDto, draft: SettingsDraft): MarketSettingsDto {
  const settings = {
    ...base,
    subjectArea: parseDecimal(draft.subjectArea),
    baseArea: parseDecimal(draft.baseArea),
    adoptedUnitValue: parseDecimal(draft.adoptedUnitValue),
    additionalAmount: parseDecimal(draft.additionalAmount) ?? 0,
    justification: draft.justification.trim() || null,
    typicalFrontage: parseDecimal(draft.typicalFrontage),
    typicalDepth: parseDecimal(draft.typicalDepth),
  };
  // The formulas of the fields of the draft follow what is typed; the others (the regression's scale) stay.
  const others = Object.entries(base.formulas ?? {}).filter(([path]) => !Object.hasOwn(draft, path));
  return { ...settings, formulas: { ...Object.fromEntries(others), ...collectFormulas(draft, settings) } };
}

/** "Agregar mercado de terrenos en renta". */
const addMarketLabel = (type: ComparableType) => `Agregar mercado de ${COMPARABLE_TYPE_LABELS[type].toLowerCase()}`;

/**
 * The markets of a section, one tab each: land and buildings for sale in the
 * market section, and for rent in the rent market. Each has its own
 * comparables, homologation, value and pages in the dictamen; a market not
 * captured yet is added with its button.
 */
export function MarketCalculationPanel(props: {
  valuationId: string;
  /** Comparable types this panel handles: sales in the market section, rents in the rent market. */
  types?: ComparableType[];
  readOnly: boolean;
  /** May save the review of the comparables, even when the rest is read-only (a reviewer). */
  canReview?: boolean;
  /** The subject's land and built areas captured in the document, to start each market from while none is captured. */
  suggestedSubjectAreas: { land: number | null; built: number | null };
  /** The browser key of Google Maps, for "Ver en mapa" of the search; no key, no map. */
  googleMaps?: GoogleMapsPageConfig;
  onCalculation: (calculation: MarketCalculationDto, result: MarketApproachResult | null) => void;
  /** The market shown changed: the editor shows only its pages (V7.2-01). */
  onActiveChange?: (type: ComparableType) => void;
  /** Titles of each market's pages hidden in the editor: they leave the dictamen (V7.4-07). */
  hiddenBlocks?: Partial<Record<ComparableType, string[]>>;
  /** Shows a market's hidden pages again. */
  onShowBlocks?: (type: ComparableType) => void;
  /** The subject's data already captured in the document, for the subject's column of the characteristics (V7.1-13). */
  subjectFacts?: SubjectFacts;
}) {
  const { valuationId } = props;
  const types = props.types ?? SALE_COMPARABLE_TYPES;
  // The market open last time (V8.2): changing the view or reloading mounts the panel again, on the same market.
  const memoryKey = marketMemoryKey(valuationId, types);
  const isClient = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const [type, setType] = useState<ComparableType>(() => (isClient ? storedMarketType(sessionStore(), memoryKey, types) : null) ?? types[0]);
  const [shown, setShown] = useState<ReadonlySet<ComparableType>>(() => new Set([types[0], type]));
  // Rendered on the server first: the kept market is read once on the client (adjusted during render, as the view mode is).
  const [restored, setRestored] = useState(isClient);
  if (isClient && !restored) {
    setRestored(true);
    const kept = storedMarketType(sessionStore(), memoryKey, types);
    if (kept && kept !== type) {
      setType(kept);
      setShown((current) => new Set([...current, kept]));
    }
  }
  useEffect(() => {
    if (restored) storeMarketType(sessionStore(), memoryKey, type);
  }, [memoryKey, restored, type]);
  const rootRef = useRef<HTMLDivElement>(null);
  useKeptEditorScroll(rootRef, memoryKey);
  const typesKey = types.join(",");
  const reportActive = useEffectEvent((item: ComparableType) => props.onActiveChange?.(item));
  useEffect(() => {
    reportActive(type);
  }, [type]);

  // A market with comparables or stored settings has its tab from the start.
  useEffect(() => {
    let active = true;
    const all = typesKey.split(",") as ComparableType[];
    void Promise.all(all.map((item) => api.market.get(valuationId, item)
      .then((calculation) => (calculation.configured || calculation.comparables.length ? item : null))
      .catch(() => null)))
      .then((found) => {
        if (active) setShown((current) => new Set([...current, ...found.filter((item): item is ComparableType => item !== null)]));
      });
    return () => { active = false; };
  }, [typesKey, valuationId]);

  const visible = types.filter((item) => shown.has(item));
  const missing = types.filter((item) => !shown.has(item));
  // "Quitar este mercado" (video 6.3, 06:35): any market, with or without comparables, while another stays. It asks with the
  // app's dialog and comes back with «Deshacer»: its comparables wait aside on the server and its settings are kept here.
  const confirmDelete = useConfirmDelete();
  const reportEmpty = async (item: ComparableType) => {
    // The market's pages leave the dictamen.
    const empty = await api.market.get(valuationId, item);
    props.onCalculation(empty, null);
  };
  const restoreMarket = async (item: ComparableType, snapshot: MarketCalculationDto, comparableIds: string[]) => {
    try {
      if (comparableIds.length) await api.market.restoreMarket(valuationId, item, comparableIds);
      if (snapshot.configured) await api.market.saveSettings(valuationId, snapshot.settings);
      setShown((current) => new Set([...current, item]));
      setType(item);
      toast.success(`Mercado de ${COMPARABLE_TYPE_LABELS[item].toLowerCase()} restaurado.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo deshacer.");
    }
  };
  const removeMarket = (item: ComparableType, snapshot: MarketCalculationDto) => {
    const name = COMPARABLE_TYPE_LABELS[item].toLowerCase();
    const count = snapshot.comparables.length;
    confirmDelete({
      title: `¿Quitar el mercado de ${name}?`,
      description: `${count ? `Se quita con sus ${count} comparables, su homologación y` : "Se quitan sus especificaciones y"} sus páginas del dictamen. `
        + "Puedes deshacerlo con «Deshacer» en el aviso que aparece al quitarlo.",
      confirmLabel: "Quitar mercado",
      onConfirm: () => {
        void (async () => {
          try {
            const { comparableIds } = snapshot.configured || count ? await api.market.deleteMarket(valuationId, item) : { comparableIds: [] };
            setShown((current) => new Set([...current].filter((kept) => kept !== item)));
            if (type === item) setType(types.find((other) => other !== item && shown.has(other)) ?? types[0]);
            await reportEmpty(item);
            toast.success(`Mercado de ${name} quitado.`, {
              duration: 15000,
              action: { label: "Deshacer", onClick: () => void restoreMarket(item, snapshot, comparableIds) },
            });
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo quitar el mercado.");
          }
        })();
      },
    });
  };

  const hiddenHere = props.hiddenBlocks?.[type] ?? [];
  return (
    // The market shown: the preview follows it to its pages (V6.2-10).
    <div ref={rootRef} className="grid gap-2" data-active-market={type}>
      {types.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Mercados del avalúo" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {visible.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={item === type}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border-b-2 px-3 py-1 text-sm font-medium",
                  item === type ? cn("bg-background shadow-sm", MARKET_ACCENT[item].border) : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setType(item)}
              >
                <span className={cn("size-2 shrink-0 rounded-full", MARKET_ACCENT[item].dot)} aria-hidden />
                {COMPARABLE_TYPE_LABELS[item]}
                {props.hiddenBlocks?.[item]?.length ? (
                  <EyeOff className="size-3.5 text-amber-700 dark:text-amber-400" aria-label="Tiene bloques ocultos en el dictamen" />
                ) : null}
              </button>
            ))}
          </div>
          {!props.readOnly ? missing.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setShown((current) => new Set([...current, item]));
                setType(item);
              }}
            >
              <Plus data-icon="inline-start" /> {addMarketLabel(item)}
            </Button>
          )) : null}
          <span className="text-xs text-muted-foreground">
            Cada mercado lleva sus comparables, su homologación y su valor, y escribe sus propias páginas en el dictamen.
          </span>
        </div>
      ) : null}
      {/* Where the appraiser is, always in sight while scrolling the panel and its pages (V7.2-02). */}
      {/* Filled with the market's pastel (V8.3), so it does not get lost among the pages of the template. */}
      <p
        className={cn("sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-md border border-l-4 px-3 py-2 text-sm shadow-sm", MARKET_ACCENT[type].border, MARKET_ACCENT[type].here)}
        data-market-here={type}
      >
        <MapPin className="size-4 shrink-0" aria-hidden />
        <span>Estás en: <strong className="font-semibold">{COMPARABLE_TYPE_LABELS[type]}</strong></span>
        {types.length > 1 ? (
          <span className="text-xs text-foreground/75">Abajo ves solo las páginas de este mercado; el dictamen imprime todos los mercados agregados al informe.</span>
        ) : null}
      </p>
      {hiddenHere.length ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-market-hidden-blocks="">
          <EyeOff className="size-3.5 shrink-0" aria-hidden />
          <span className="flex-1">
            {hiddenHere.length === 1 ? "Este mercado tiene un bloque oculto" : `Este mercado tiene ${hiddenHere.length} bloques ocultos`} ({hiddenHere.map((title) => `«${title}»`).join(", ")}):
            no sale en el dictamen aunque el mercado esté agregado al informe.
          </span>
          {props.onShowBlocks && !props.readOnly ? (
            <Button type="button" size="sm" variant="outline" onClick={() => props.onShowBlocks?.(type)}>Mostrar en el dictamen</Button>
          ) : null}
        </div>
      ) : null}
      {/* Its fields belong to this market: what is circular for them depends on it, not on the section. */}
      <LiveFormulaOwnerProvider owner={`MERCADO:${type}`}>
        <MarketTypePanel key={type} {...props} type={type} onRemoveMarket={visible.length > 1 && !props.readOnly ? removeMarket : undefined} />
      </LiveFormulaOwnerProvider>
    </div>
  );
}

/**
 * A numbered part of the specifications, in the order of the appraiser's
 * format. A collapsible one folds with its arrow, like "Indirectos" in costs
 * (video 6.2, 04:13); it opens on its own while it holds something.
 */
function Part(props: { number: number; title: string; aside?: ReactNode; children: ReactNode; collapsible?: { open: boolean } }) {
  if (props.collapsible) {
    return (
      <details className="group grid gap-2" open={props.collapsible.open} aria-label={props.title} data-collapsible-part={props.number}>
        <summary className={cn(CALC_SECTION_HEADING, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
          <span className="inline-flex items-center gap-1">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
            {props.number}. {props.title}
          </span>
          {props.aside}
        </summary>
        <div className="mt-2 grid gap-2">{props.children}</div>
      </details>
    );
  }
  return (
    <section className="grid gap-2" aria-label={props.title}>
      <h4 className={CALC_SECTION_HEADING}>
        <span>{props.number}. {props.title}</span>
        {props.aside}
      </h4>
      {props.children}
    </section>
  );
}

/**
 * Comparables and calculation of one market: the specifications of the
 * calculation, apart from the blocks of the dictamen below it that it writes
 * through `onCalculation`. In the order of the appraiser's Excel:
 * specifications, comparables, homologation, results, additional amount and
 * the justification of the factors.
 */
function MarketTypePanel(props: {
  valuationId: string;
  type: ComparableType;
  readOnly: boolean;
  canReview?: boolean;
  suggestedSubjectAreas: { land: number | null; built: number | null };
  googleMaps?: GoogleMapsPageConfig;
  onCalculation: (calculation: MarketCalculationDto, result: MarketApproachResult | null) => void;
  /** Takes this market out (it can be undone); absent while it is the only market, or for a reader. */
  onRemoveMarket?: (type: ComparableType, snapshot: MarketCalculationDto) => void;
  subjectFacts?: SubjectFacts;
}) {
  const { valuationId, type } = props;
  const labels = MARKET_LABELS[type];
  const { thousandsSeparator } = useNumberPresentation();
  const rent = isRentComparableType(type);
  const perUnit = rent ? "/m²/mes" : "/m²";
  const priceLabel = rent ? "Renta mensual ($)" : "Precio de oferta ($)";
  // What the panel shows: what the server stored, with the changes still on their way on top (MarketEditSession).
  const [calculation, setCalculation] = useState<MarketCalculationDto | null>(null);
  // What the server stored: the dictamen follows it.
  const [stored, setStored] = useState<MarketCalculationDto | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editing, setEditing] = useState<ComparableDto | "nuevo" | null>(null);
  // Data read from a pasted listing, waiting in the form of a new comparable.
  const [prefill, setPrefill] = useState<{ values: ComparablePrefill; listingText: string; images: PendingImages } | null>(null);
  const ai = useAiAssist();
  const [catalog, setCatalog] = useState<FactorCatalog>(EMPTY_FACTOR_CATALOG);
  const [customFactors, setCustomFactors] = useState<CustomFactor[]>([]);
  const [reviewThresholds, setReviewThresholds] = useState<{ builtAreaTolerance?: number; offerMaxAgeMonths?: number }>({});
  // Every change of the panel goes through the session: shown at once, saved in order (V7.2-11, -13, -15).
  const session = useRef<MarketEditSession | null>(null);
  // The settings the fields being typed were read from.
  const shownSettings = useRef<MarketSettingsDto | null>(null);
  // Undo and redo of the panel: settings (chips and their order included) and comparables, as captured, go back together.
  const restoreRef = useRef<(snapshot: MarketSnapshot) => void>(() => undefined);
  const history = useDraftHistory<MarketSnapshot>({
    apply: (snapshot) => restoreRef.current(snapshot),
    cellElement: () => null,
  });
  const resetHistory = useEffectEvent(() => history.reset());

  // The firm's own factor catalog and factors, if it keeps them; without a catalog every factor is typed.
  useEffect(() => {
    let active = true;
    api.firm.factors()
      .then((next) => { if (active) setCatalog(next.catalog); })
      .catch(() => undefined);
    api.firm.customFactors()
      .then((next) => { if (active) setCustomFactors(next.factors); })
      .catch(() => undefined);
    // The warnings of the list use the firm's thresholds, as the review does (Despacho → Revisión de comparables).
    api.firm.reviewChecklist()
      .then((next) => { if (active) setReviewThresholds({ builtAreaTolerance: builtAreaToleranceOf(next), offerMaxAgeMonths: next.validityMonths }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const readOnly = props.readOnly || Boolean(calculation?.locked);

  // The subject's area this market starts from: the land's for land, the built one for buildings (the construction types' sum when the document has none).
  const [typesBuiltArea, setTypesBuiltArea] = useState<number | null>(null);
  const documentArea = suggestedSubjectAreaFor(type, props.suggestedSubjectAreas);
  useEffect(() => {
    if (isLandComparableType(type) || documentArea) return;
    let active = true;
    api.constructionTypes.get(valuationId)
      .then((next) => {
        const total = next.types.reduce((sum, item) => sum + (item.area ?? 0), 0);
        if (active && total > 0) setTypesBuiltArea(Math.round(total * 100) / 100);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [documentArea, type, valuationId]);
  const suggestedArea = documentArea ?? (isLandComparableType(type) ? null : typesBuiltArea);

  // Only an editor writes the result into the dictamen; a reader would leave unsaved changes.
  const reportCalculation = useEffectEvent((next: MarketCalculationDto) => {
    if (!props.readOnly && !next.locked) props.onCalculation(next, compute(next).result);
  });

  const failed = (error: unknown) => toast.error(error instanceof SessionExpiredError
    ? "Tu sesión expiró. Vuelve a iniciar sesión."
    : error instanceof Error ? error.message : "No se pudo guardar.");

  /** Shows what the session holds; the fields not being typed follow the settings when they change (an undo, the server). */
  const show = (current: MarketEditSession) => {
    const view = current.view;
    const before = shownSettings.current;
    if (before && view.settings !== before) {
      const from = draftFrom(before);
      const to = draftFrom(view.settings);
      setDraft((typed) => (typed ? rebaseDraft(typed, from, to) : to));
    }
    shownSettings.current = view.settings;
    setCalculation(view);
    setStored(current.server);
    setSavingSettings(current.busy);
  };

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    api.market.get(valuationId, type)
      .then((next) => {
        if (!active) return;
        const created: MarketEditSession = new MarketEditSession(next, {
          saveSettings: (settings) => api.market.saveSettings(valuationId, settings),
          // The market's added characteristics stay attributes of the comparable in the firm's base, to filter by them.
          saveComparable: (comparable): Promise<MarketCalculationDto> => api.market.updateComparable(valuationId, type, comparable.id, comparableFormValues({
            ...comparable,
            attributes: mirroredAttributes(characteristicFieldsOf(created.view.settings), comparable),
          })),
        }, failed);
        session.current = created;
        unsubscribe = created.subscribe(() => show(created));
        setLoadError(null);
        shownSettings.current = next.settings;
        setDraft(draftFrom(next.settings));
        setCalculation(next);
        setStored(next);
        resetHistory();
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "No se pudo cargar el enfoque de mercado.");
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [type, valuationId]);

  // The dictamen follows what the server stored, never an unsaved draft.
  useEffect(() => {
    if (stored) reportCalculation(stored);
  }, [stored]);

  /** An action that answers the market (add, delete, import…), in turn with the edits on their way. */
  const run = async (action: () => Promise<MarketCalculationDto>, success?: string) => {
    if (!session.current) return false;
    const ok = await session.current.perform(action);
    if (ok && success) toast.success(success);
    return ok;
  };
  const applyServerState = (next: MarketCalculationDto) => void run(async () => next);

  // Prefilled with the subject's real area (video 6.3): a value, not a hint, so $/m², the surface factor and FRe are computed; it stays editable.
  const prefilled = Boolean(calculation && draft && !readOnly && !draft.subjectArea && calculation.settings.subjectArea === null && suggestedArea);
  const effectiveDraft = draft && prefilled ? { ...draft, subjectArea: String(suggestedArea) } : draft;
  const liveSettings = calculation && effectiveDraft ? settingsFrom(calculation.settings, effectiveDraft) : null;
  // Recomputed on every render: a handful of comparables, and it follows every keystroke.
  const live = calculation && liveSettings ? compute({ settings: liveSettings, comparables: calculation.comparables, precision: calculation.precision }) : null;
  // The pages of this market as the capture holds them right now: their tables are where it is captured (one table, 20 nov 2026).
  // Built a moment after each key, not within it: typing in a field of the panel stays as quick as before.
  const pagesDraft = useDeferredValue(draft);
  const capturePages = useMemo<CapturePages | null>(() => {
    if (!calculation || !pagesDraft) return null;
    const settings = settingsFrom(calculation.settings, prefilled ? { ...pagesDraft, subjectArea: String(suggestedArea) } : pagesDraft);
    const computed = compute({ settings, comparables: calculation.comparables, precision: calculation.precision });
    return {
      blocks: marketDocumentBlocks({ ...calculation, settings }, computed.result, { capture: true }),
      placeholderIds: isRentComparableType(calculation.settings.comparableType) ? RENT_TEMPLATE_BLOCK_IDS : MARKET_TEMPLATE_BLOCK_IDS,
    };
  }, [calculation, pagesDraft, prefilled, suggestedArea]);
  usePublishCapturePages(capturePages);

  const snapshotOf = (view: MarketCalculationDto): MarketSnapshot => ({ settings: view.settings, comparables: view.comparables });
  /**
   * Saves the settings, whole: shown at once and sent after what is on its
   * way. Without settings, those of the fields as typed over what the panel
   * shows now (not over an earlier render).
   */
  const saveSettings = (settings?: MarketSettingsDto | null, options: { record?: boolean } = {}) => {
    const current = session.current;
    if (!current || readOnly || !draft) return;
    const next = settings ?? settingsFrom(current.view.settings, effectiveDraft ?? draft);
    if (JSON.stringify(next) === JSON.stringify(current.view.settings)) return;
    if (options.record !== false) history.record(snapshotOf(current.view), null);
    void current.setSettings(next);
  };
  /** One change of the settings, over the settings as the panel shows them now (with the fields as typed). */
  const patchSettings = (patch: Partial<MarketSettingsDto> | ((settings: MarketSettingsDto) => Partial<MarketSettingsDto>)) => {
    const current = session.current;
    if (!current || !draft) return;
    const base = settingsFrom(current.view.settings, effectiveDraft ?? draft);
    saveSettings({ ...base, ...(typeof patch === "function" ? patch(base) : patch) });
  };
  // With comparables captured, the prefilled area is saved at once, so the dictamen is calculated too.
  const persistPrefilled = useEffectEvent(() => {
    if (prefilled && calculation?.comparables.length && liveSettings) saveSettings(liveSettings, { record: false });
  });
  useEffect(() => {
    persistPrefilled();
  }, [calculation?.comparables.length, prefilled]);
  /**
   * Changes one comparable from a cell of a table: shown at once, and sent
   * after any change still on its way, applied to what the server stores then.
   * Each change is its own step of the undo.
   */
  const changeComparable = (comparable: ComparableDto, change: (current: ComparableDto) => ComparableDto, options: { record?: boolean } = {}) => {
    const current = session.current;
    if (readOnly || !current) return;
    if (options.record !== false) history.record(snapshotOf(current.view), null);
    void current.changeComparable(comparable.id, change);
  };

  // Comparables deleted in this panel: they wait aside on the server, and an undo brings them back (V8.3).
  const deletedInPanel = useRef(new Set<string>());
  /** Brings back the comparables deleted that `target` has, or deletes again those it does not, and leaves its order. */
  const applyComparableList = async (target: Pick<MarketSnapshot, "comparables">) => {
    const ids = () => session.current?.view.comparables.map((item) => item.id) ?? [];
    const steps = comparableListSteps(ids(), target.comparables.map((item) => item.id), deletedInPanel.current);
    if (!changesList(steps)) return;
    for (const id of steps.remove) if (!(await run(() => api.market.deleteComparable(valuationId, type, id)))) return;
    if (steps.restore.length && !(await run(() => api.market.restoreMarket(valuationId, type, steps.restore)))) return;
    if (steps.order.join(",") !== ids().join(",")) await run(() => api.market.reorderComparables(valuationId, type, steps.order));
    if (steps.restore.length) {
      toast.success(steps.restore.length === 1 ? "Comparable restaurado en su lugar, con sus factores y fotos." : `${steps.restore.length} comparables restaurados en su lugar.`);
    }
  };
  // What an undo or a redo puts back: the settings as they were, each comparable whose capture changed, and those deleted or brought back.
  useEffect(() => {
    restoreRef.current = (snapshot) => {
      const current = session.current;
      if (!current || readOnly) return;
      if (JSON.stringify(snapshot.settings) !== JSON.stringify(current.view.settings)) void current.setSettings(snapshot.settings);
      for (const target of changedComparables(current.view.comparables, snapshot.comparables)) {
        void current.changeComparable(target.id, () => target);
      }
      void applyComparableList(snapshot);
    };
  });
  const snapshot = (): MarketSnapshot | null => (session.current ? snapshotOf(session.current.view) : null);

  /** The comparables in a new order (dragged or sorted): references 1..n follow it; «Deshacer» puts the order back. */
  const reorderComparables = async (ids: string[], message: string) => {
    const current = session.current;
    if (!current || readOnly) return;
    const before = current.view.comparables.map((item) => item.id);
    if (ids.join(",") === before.join(",")) return;
    const byId = new Map(current.view.comparables.map((item) => [item.id, item]));
    setCalculation((view) => (view ? { ...view, comparables: ids.flatMap((id, index) => (byId.has(id) ? [{ ...byId.get(id)!, reference: index + 1 }] : [])) } : view));
    const ok = await run(() => api.market.reorderComparables(valuationId, type, ids));
    if (ok) {
      toast.success(message, {
        description: "El dictamen los numera en este orden; lo que escribiste en sus renglones de las tablas del dictamen se mueve con cada comparable.",
        duration: 12000,
        action: { label: "Deshacer", onClick: () => void reorderComparables(before, "Orden anterior restaurado.") },
      });
    }
  };

  /**
   * "Eliminar comparable": the server sets it aside, so «Deshacer» of the
   * notice, the panel's «Deshacer» and Ctrl+Z bring it back in its place, with
   * its factors, photos and what was written in its rows of the dictamen (they
   * follow its id). The focus stays in the panel, so Ctrl+Z is the panel's and
   * not the document's (V8.3: «ya está cambiando otras cosas pero no eso»).
   */
  const removeComparable = async (comparable: ComparableDto) => {
    const current = session.current;
    if (!current || readOnly) return;
    const before = snapshotOf(current.view);
    history.record(before, null);
    deletedInPanel.current.add(comparable.id);
    const ok = await run(() => api.market.deleteComparable(valuationId, type, comparable.id));
    if (!ok) return;
    // After the confirmation closes (it hands the focus back to the deleted row's button, which is gone, or keeps it).
    window.setTimeout(() => {
      const panel = panelRef.current;
      const active = document.activeElement;
      if (panel && (!active || !active.isConnected || !panel.contains(active))) panel.focus({ preventScroll: true });
    }, 300);
    toast.success(`Comparable ${comparable.reference} eliminado.`, {
      description: "Deshacer (o Ctrl+Z en el panel) lo regresa a su lugar con sus factores y fotos.",
      duration: 15000,
      action: { label: "Deshacer", onClick: () => void applyComparableList(before) },
    });
  };
  const confirmDeleteComparable = useConfirmDelete();
  const panelRef = useRef<HTMLElement>(null);

  /**
   * «Características agregadas» of a card, inside a valuation, become
   * characteristics of the market (V7.2-10): in every card and in the table 2.1.
   */
  const withSharedCharacteristics = (values: ComparableFormValues): ComparableFormValues => {
    const current = session.current;
    if (!current || !values.attributes?.length) return values;
    const shared = sharedCharacteristics(characteristicFieldsOf(current.view.settings), values, newFieldKey);
    if (shared.added.length) {
      patchSettings({ characteristicFields: shared.fields });
      toast.info(`${shared.added.length === 1 ? "Característica agregada" : "Características agregadas"} al mercado: ${shared.added.map((field) => `«${field.label}»`).join(", ")}.`, {
        description: "Se ven en todas las fichas de este mercado y en la tabla 2.1, y se imprimen en la línea de características.",
      });
    }
    // In the firm's base they stay attributes of the comparable, to filter by them in Comparables.
    return { ...shared.comparable, attributes: mirroredAttributes(shared.fields, shared.comparable) };
  };

  const submitComparable = async (current: ComparableDto | null, typed: ComparableFormValues, pending: PendingImages, mergeInto?: string) => {
    // What the card saves is a step of the panel's undo, as a change in a cell.
    if (current && session.current) history.record(snapshotOf(session.current.view), null);
    const values = withSharedCharacteristics(typed);
    if (current) return run(() => api.market.updateComparable(valuationId, type, current.id, values), "Comparable guardado");
    const before = new Set(calculation?.comparables.map((item) => item.id) ?? []);
    return run(async () => {
      const created = await api.market.createComparable(valuationId, type, values, mergeInto);
      // The screenshot and the photos chosen before saving go up once the comparable exists, the photos in their order.
      const added = created.comparables.find((item) => !before.has(item.id));
      if (!added) return created;
      let latestCalculation = created;
      const uploads = [
        ...(pending.screenshot ? [() => api.market.uploadScreenshot(valuationId, type, added.id, pending.screenshot as File)] : []),
        ...pending.photos.map((photo) => () => api.market.uploadPhoto(valuationId, type, added.id, photo)),
      ];
      for (const upload of uploads) {
        try {
          latestCalculation = await upload();
        } catch (error) {
          failed(error);
        }
      }
      return latestCalculation;
    }, mergeInto ? "Comparable unificado con el de la base: conserva su número." : "Comparable agregado");
  };

  const createFactor = async (label: string) => {
    try {
      const next = await api.firm.addCustomFactor(label);
      setCustomFactors(next.factors);
      return next.factor;
    } catch (error) {
      failed(error);
      return null;
    }
  };

  // A factor renamed in the header of the homologation table of the dictamen is the factor's name (video 5.3, 10:12): the annex and the memory print it too.
  const factorAt = (columnId: string) => (liveSettings?.factorSlots ?? []).findIndex((_, index) => marketFactorColumnId(index) === columnId.toLowerCase());
  useCaptureHeaderRename(
    marketHomologationTableId(type),
    (columnId) => factorAt(columnId) >= 0,
    (columnId, label) => {
      const index = factorAt(columnId);
      if (index >= 0 && liveSettings) patchSettings({ factorSlots: liveSettings.factorSlots.map((item, position) => (position === index ? { ...item, label } : item)) });
    },
  );

  if (loadError) {
    return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  }
  if (!calculation || !draft || !liveSettings) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando el enfoque de mercado…
      </div>
    );
  }

  const { comparables } = calculation;
  const result = live?.result ?? null;
  const stats = result?.homologation.stats;
  const complete = comparables.filter(isComparableComplete).length;
  const setDraftField = (key: keyof SettingsDraft) => (event: { target: { value: string } }) =>
    setDraft((current) => (current ? { ...current, [key]: event.target.value } : current));
  const editingComparable = editing === "nuevo" ? null : editing;
  const today = todayInMexico();
  const basis = homologationBasisOf(liveSettings);
  const againstBase = basis === "LOTE_TIPO";
  const fields = characteristicFieldsOf(liveSettings);
  // Where each datum sits in the tables of the page (market-document.ts): it is typed there.
  const captureAt = marketCaptureColumns({ settings: liveSettings, comparables });
  // Factors rated from the catalog, whose subject rating is chosen once for all comparables.
  const ratedSlots = calculation.settings.factorSlots.filter((slot) =>
    !slot.key && !COMPUTED_FACTORS.has(slot.type) && !DIRECT_FACTORS.has(slot.type) && optionsFor(catalog, slot.type).length > 0);
  // The subject's column of the characteristics starts from what the valuation has (V7.1-13): its area and, against the subject, its front and depth from here.
  const subjectDefaults: Record<string, { value: string; source: string }> = { ...props.subjectFacts };
  if (liveSettings.subjectArea) subjectDefaults.area = { value: String(liveSettings.subjectArea), source: `1. Especificaciones › ${labels.subjectArea}` };
  if (!againstBase && liveSettings.typicalFrontage) subjectDefaults.frontage = { value: String(liveSettings.typicalFrontage), source: "1. Especificaciones › Frente del sujeto" };
  if (!againstBase && liveSettings.typicalDepth) subjectDefaults.depth = { value: String(liveSettings.typicalDepth), source: "1. Especificaciones › Fondo del sujeto" };
  const unitValueOf = (comparable: ComparableDto) => (comparable.area && comparable.price ? comparable.price / comparable.area : null);
  const sortByUnitValue = (direction: 1 | -1) => {
    const sorted = [...comparables].sort((a, b) => {
      const left = unitValueOf(a);
      const right = unitValueOf(b);
      // Those without a unit value go last, in their order.
      if (left === null || right === null) return left === null ? (right === null ? 0 : 1) : -1;
      return (left - right) * direction;
    });
    void reorderComparables(sorted.map((item) => item.id), `Comparables ordenados por $${perUnit} de ${direction === 1 ? "menor a mayor" : "mayor a menor"}.`);
  };
  // Characteristics added in the cards before they were shared with the market: the appraiser brings them into the table.
  const notShared = comparables.reduce((sum, comparable) => sum + unsharedAttributes(fields, comparable.attributes).length, 0);
  // The card shows under «Características agregadas» only what is not a characteristic of the market: the rest is in its list.
  const cardOf = (comparable: ComparableDto): ComparableDto => ({ ...comparable, attributes: unsharedAttributes(fields, comparable.attributes) });
  const shareAttributes = () => {
    const current = session.current;
    if (!current) return;
    let list = characteristicFieldsOf(current.view.settings);
    let count = 0;
    const changed: ComparableDto[] = [];
    for (const comparable of current.view.comparables.filter((item) => unsharedAttributes(list, item.attributes).length)) {
      const shared = sharedCharacteristics(list, comparable, () => newFieldKey(++count));
      list = shared.fields;
      changed.push(shared.comparable);
    }
    patchSettings({ characteristicFields: list });
    for (const target of changed) changeComparable(target, () => target, { record: false });
  };

  return (
    <section
      ref={panelRef}
      // Focusable from code only: after a deletion the focus waits here, so Ctrl+Z is the panel's.
      tabIndex={-1}
      className={cn("grid gap-5 rounded-lg border-2 border-dashed bg-muted/20 p-3 outline-none sm:p-4", MARKET_ACCENT[type].border)}
      aria-labelledby="market-calculation-title"
      data-comparable-type={type}
      onKeyDown={(event) => {
        const current = snapshot();
        if (current) history.onKeyDown(event, current);
      }}
    >
      <header className="grid gap-0.5">
        <h3 id="market-calculation-title" className="flex flex-wrap items-center gap-2 text-base font-semibold">
          <Calculator className="size-4" /> {labels.title} · {COMPARABLE_TYPE_LABELS[type]}
          {!readOnly ? (
            <span className="ml-auto inline-flex items-center gap-1" role="group" aria-label="Deshacer y rehacer del cálculo">
              <Button type="button" size="sm" variant="ghost" disabled={!history.canUndo} title="Deshacer el último cambio del cálculo (Ctrl+Z)" onClick={() => { const current = snapshot(); if (current) history.undo(current); }}>
                <Undo2 data-icon="inline-start" /> Deshacer
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={!history.canRedo} title="Rehacer (Ctrl+Y)" onClick={() => { const current = snapshot(); if (current) history.redo(current); }}>
                <Redo2 data-icon="inline-start" /> Rehacer
              </Button>
              {props.onRemoveMarket ? (
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => props.onRemoveMarket?.(type, calculation)}>
                  <Trash2 data-icon="inline-start" /> Quitar este mercado
                </Button>
              ) : null}
            </span>
          ) : null}
        </h3>
        <p className="text-xs text-muted-foreground" data-market-strip-note="">
          Configuración y comparables de este mercado; no se imprime. Los factores de la homologación, el valor adoptado y la ubicación, la superficie y la oferta de cada comparable
          se capturan abajo, en las tablas de su bloque: las celdas en blanco son tuyas y las grises las calcula el sistema.
          {type === "TERRENO_VENTA" ? " El enfoque de costos toma el valor de este mercado de terrenos para el terreno." : null}
        </p>
      </header>

      {calculation.locked ? (
        <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p>
      ) : null}

      <Part number={1} title="Especificaciones" aside={savingSettings ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}>
        <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-4" onBlur={() => saveSettings()}>
          <Field>
            <FieldLabel htmlFor="market-subject-area">{labels.subjectArea}</FieldLabel>
            <FormulaInput
              id="market-subject-area"
              grouping
              value={effectiveDraft?.subjectArea ?? ""}
              onChange={setDraftField("subjectArea")}
            />
            {prefilled ? (
              <p className="text-xs text-muted-foreground" data-subject-area-prefilled="">
                Tomada de la superficie {isLandComparableType(type) ? "de terreno" : "construida"} del avalúo; puedes cambiarla.
              </p>
            ) : null}
          </Field>
          <Field className="sm:col-span-3">
            <FieldLabel id="market-basis-label">Homologación de acuerdo a</FieldLabel>
            <div role="radiogroup" aria-labelledby="market-basis-label" className="flex flex-wrap items-center gap-4 text-sm">
              {([["LOTE_TIPO", "Lote tipo"], ["SUJETO", "Sujeto"]] as Array<[HomologationBasis, string]>).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`market-basis-${type}`}
                    checked={basis === value}
                    onChange={() => patchSettings({ homologationBasis: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Sujeto: homologación directa; lote tipo: homologación indirecta. Aplica a todos los factores, no solo al de superficie.
            </p>
          </Field>
          {againstBase ? (
            <Field>
              <FieldLabel htmlFor="market-base-area">Lote tipo (m²)</FieldLabel>
              <FormulaInput id="market-base-area" grouping value={draft.baseArea} onChange={setDraftField("baseArea")} />
              {!draft.baseArea ? <p className="text-xs text-highlight-strong">Sin lote tipo, el factor de superficie usa el sujeto.</p> : null}
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="market-typical-frontage">{againstBase ? "Frente tipo (m)" : "Frente del sujeto (m, opcional)"}</FieldLabel>
            <FormulaInput id="market-typical-frontage" value={draft.typicalFrontage} onChange={setDraftField("typicalFrontage")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="market-typical-depth">{againstBase ? "Fondo tipo (m)" : "Fondo del sujeto (m, opcional)"}</FieldLabel>
            <FormulaInput id="market-typical-depth" value={draft.typicalDepth} onChange={setDraftField("typicalDepth")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="market-power">Potencia n</FieldLabel>
            <SurfacePowerSelect
              id="market-power"
              value={liveSettings.surfacePower}
              onChange={(surfacePower) => patchSettings({ surfacePower })}
            />
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-4">
            <span className="font-medium text-foreground" data-surface-formula="">{marketSurfaceFormula(liveSettings)}</span>.{" "}
            En cada comparable puedes escribir otro valor o usar otra fórmula para el factor de superficie. Los campos numéricos aceptan
            cálculos: =5*10000, =(1345*235)^(1/6).
          </p>
        </fieldset>
        <MarketOfferLevel
          labels={offerLabelsOf(liveSettings)}
          mark={offerMarkOf(liveSettings)}
          intro={liveSettings.offerIntro ?? null}
          defaultIntro={defaultOfferIntro(type)}
          readOnly={readOnly}
          onChange={(offer) => patchSettings({ ...offer, offerLevel: null })}
        />
      </Part>

      <Part
        number={2}
        title="Comparables"
        aside={!readOnly && comparables.length > 1 ? (
          <span className="flex flex-wrap items-center gap-1 text-xs font-normal">
            <Button type="button" size="sm" variant="ghost" title={`Ordenar los comparables por su valor unitario, de menor a mayor`} onClick={() => sortByUnitValue(1)}>
              <ArrowUpNarrowWide data-icon="inline-start" /> Ordenar por ${perUnit} ↑
            </Button>
            <Button type="button" size="sm" variant="ghost" title={`Ordenar los comparables por su valor unitario, de mayor a menor`} onClick={() => sortByUnitValue(-1)}>
              <ArrowDownWideNarrow data-icon="inline-start" /> Ordenar por ${perUnit} ↓
            </Button>
          </span>
        ) : null}
      >
        <SortableRows ids={comparables.map((comparable) => comparable.id)} onMove={(ids) => void reorderComparables(ids, "Orden de los comparables guardado.")}>
        <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly>
          <table className={cn(CALC_TABLE, "w-full min-w-[560px]")}>
            <thead className={CALC_HEAD}>
              <tr>
                <th className={CALC_HEAD_CELL}><span className="sr-only">Mover</span></th>
                <th className={CALC_HEAD_CELL}>Ref.</th>
                <th className={CALC_HEAD_CELL}>ID</th>
                <th className={CALC_HEAD_CELL}>Ubicación y avisos</th>
                <th className={CALC_HEAD_CELL}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {comparables.map((comparable) => {
                // Warnings only: the appraiser's judgement decides whether the comparable stays.
                const warnings = comparableWarnings(
                  { ...comparable, hasScreenshot: Boolean(comparable.screenshot) },
                  {
                    type, subjectArea: liveSettings.subjectArea, today,
                    builtAreaTolerance: reviewThresholds.builtAreaTolerance,
                    offerMaxAgeMonths: comparable.validityMonths ?? reviewThresholds.offerMaxAgeMonths,
                  },
                );
                const status = comparable.review?.status ?? "POR_REVISAR";
                return (
                  <SortableComparableRow key={comparable.id} comparable={comparable} readOnly={readOnly}>
                    <td className="px-2 py-1.5">{comparable.reference}</td>
                    <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">
                      {formatComparableId(comparable.folio) ?? "—"}
                      <span className={cn("ml-1 font-sans", isVerifiedStatus(status) ? "text-success-strong" : status === "POR_REVISAR" ? "text-muted-foreground" : "text-highlight-strong")}>
                        · {REVIEW_STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="max-w-64 px-2 py-1.5" title={comparable.location}>
                      <span className="block truncate">
                        {comparable.location}
                        {comparable.photos.length ? <span className="ml-1 text-xs text-muted-foreground">({countLabel(comparable.photos.length, "foto")})</span> : null}
                      </span>
                      {warnings.length ? (
                        <span className="flex items-start gap-1 text-xs text-highlight-strong" data-comparable-warnings title={warnings.map((warning) => warning.message).join("\n")}>
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                          <span className="truncate">{warnings.map((warning) => warning.message).join(" ")}</span>
                        </span>
                      ) : null}
                    </td>
                    {/* One window (V8.2): «Ver ficha» opens the card, editable in place; no separate «Editar». */}
                    <td className="px-2 py-1.5 text-right whitespace-nowrap" data-comparable-actions="">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Ver ficha del comparable ${comparable.reference}`}
                        title={readOnly ? "Ver la ficha del comparable" : "Ver y editar la ficha del comparable"}
                        onClick={() => setEditing(comparable)}
                      >
                        <IdCard data-icon="inline-start" /> Ver ficha
                      </Button>
                      {!readOnly ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          aria-label={`Eliminar comparable ${comparable.reference}`}
                          onClick={() => confirmDeleteComparable({
                            title: `¿Eliminar el comparable ${comparable.reference}?`,
                            description: "Se quita de este mercado con sus factores y sus renglones del dictamen. Puedes regresarlo con «Deshacer» en el aviso, "
                              + "con «Deshacer» del cálculo o con Ctrl+Z.",
                            confirmLabel: "Eliminar comparable",
                            onConfirm: () => void removeComparable(comparable),
                          })}
                        >
                          <Trash2 data-icon="inline-start" /> Eliminar
                        </Button>
                      ) : null}
                    </td>
                  </SortableComparableRow>
                );
              })}
              {!comparables.length ? (
                <tr><td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">Sin comparables todavía. Agrégalos aquí: sus tablas aparecen abajo, en el bloque de este mercado.</td></tr>
              ) : null}
            </tbody>
          </table>
        </CalcTableContextMenu>
        </SortableRows>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {!readOnly ? (
              <>
                <Button type="button" size="sm" onClick={() => setEditing("nuevo")}>
                  <Plus data-icon="inline-start" /> Agregar comparable
                </Button>
                <ImportComparablesDialog scope={{ kind: "valuation", valuationId, type, onImported: applyServerState }} />
                {ai.enabled ? (
                  <PasteListingDialog
                    key={type}
                    valuationId={valuationId}
                    type={type}
                    priceLabel={priceLabel}
                    onUse={(values, listingText, images) => { setPrefill({ values, listingText, images }); setEditing("nuevo"); }}
                  />
                ) : null}
              </>
            ) : null}
            {/* Searching only reads: a concluded valuation can still look, but not add. */}
            <SearchComparablesDialog key={type} valuationId={valuationId} type={type} readOnly={readOnly} onAdded={applyServerState} googleMaps={props.googleMaps} />
            {comparables.length ? (
              <a
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                href={`/api/avaluos/${valuationId}/mercado/comparables/exportar?tipo=${type}`}
                download
              >
                <FileDown data-icon="inline-start" /> Exportar Excel
              </a>
            ) : null}
            {comparables.length ? (
              <ComparableReviewDialog
                valuationId={valuationId}
                // A reviewer saves the review though the rest is read-only; a concluded valuation keeps it as it was.
                readOnly={!(props.canReview ?? !props.readOnly) || Boolean(calculation.locked)}
                // The review changes no calculation; the panel only shows the new state.
                onReviewed={(comparableId, review) => {
                  const patch = (state: MarketCalculationDto) => ({
                    ...state,
                    comparables: state.comparables.map((item) => (item.id === comparableId ? { ...item, review } : item)),
                  });
                  session.current?.patchStored(patch);
                }}
              />
            ) : null}
          </div>
          {complete < MIN_COMPARABLES ? (
            <span className="flex items-center gap-1 text-xs text-highlight-strong">
              <AlertTriangle className="size-3.5" /> El dictamen lleva al menos {MIN_COMPARABLES} comparables completos ({complete} de {MIN_COMPARABLES}).
            </span>
          ) : null}
        </div>

        {comparables.length ? (
        <details className="group mt-2 grid gap-2 border-t pt-3" data-characteristics-sheet="">
          <summary className="cursor-pointer text-sm font-semibold" data-characteristics-title="">
            2.1 Hoja de características de sujeto y comparables
            <span className="ml-2 text-xs font-normal text-muted-foreground">Frente, fondo, forma, servicios… y la columna del sujeto; el dictamen imprime la línea de cada comparable en su tabla de datos.</span>
          </summary>
        {comparables.length && notShared && !readOnly ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-unshared-attributes="">
            Hay {notShared} {notShared === 1 ? "característica agregada" : "características agregadas"} solo en las fichas.
            <Button type="button" size="sm" variant="outline" onClick={shareAttributes}>Pasarlas a esta tabla</Button>
          </p>
        ) : null}
        {comparables.length ? (
          <MarketCharacteristicsTable
            fields={fields}
            defaults={!liveSettings.characteristicFields}
            comparables={comparables}
            subject={liveSettings.subjectCharacteristics ?? {}}
            readOnly={readOnly}
            subjectDefaults={subjectDefaults}
            formulaScope={type}
            onFields={(update: FieldsUpdate) => patchSettings((current) => ({ characteristicFields: update(characteristicFieldsOf(current)) }))}
            onSubject={(update: SubjectUpdate) => patchSettings((current) => ({ subjectCharacteristics: update(current.subjectCharacteristics ?? {}) }))}
            onComparable={changeComparable}
          />
        ) : null}
        </details>
        ) : null}
      </Part>

      {/* After the comparables, as the appraiser asked (video of 27 Oct 2026); it prints only when its box is marked. */}
      <Part number={3} title="Monto adicional" collapsible={{ open: liveSettings.additionalAmount > 0 }}>
        <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-4" onBlur={() => saveSettings()}>
          <Field>
            <FieldLabel htmlFor="market-additional">Monto adicional a considerar ($)</FieldLabel>
            <FormulaInput id="market-additional" grouping value={draft.additionalAmount} placeholder="0" onChange={setDraftField("additionalAmount")} />
          </Field>
          <div className="flex flex-wrap items-end gap-4 pb-1 text-sm sm:col-span-3">
            <label className="flex items-center gap-1.5">
              <Checkbox
                checked={liveSettings.additionalAmountInCalculation !== false}
                onCheckedChange={(checked) => {
                  const inCalculation = checked === true;
                  // Out of the calculation it cannot print either.
                  patchSettings({ additionalAmountInCalculation: inCalculation, ...(inCalculation ? {} : { showAdditionalAmount: false }) });
                }}
              />
              Cálculo
            </label>
            <label className="flex items-center gap-1.5">
              <Checkbox
                checked={printsAdditionalAmount(liveSettings)}
                disabled={readOnly || liveSettings.additionalAmountInCalculation === false}
                onCheckedChange={(checked) => patchSettings({ showAdditionalAmount: checked === true })}
              />
              Mostrar en el dictamen
            </label>
          </div>
        </fieldset>
      </Part>

      <Part
        number={4}
        title="Homologación"
        aside={(
          <span className="flex flex-wrap items-center gap-4 text-xs font-normal">
            <label className="flex items-center gap-1.5">
              <Checkbox
                checked={homologatesOf(liveSettings)}
                disabled={readOnly}
                aria-label="Homologar"
                onCheckedChange={(checked) => patchSettings({ homologate: checked === true })}
              />
              Homologar
            </label>
            <label className="flex items-center gap-1.5">
              <Checkbox
                checked={homologatesOf(liveSettings) && liveSettings.showHomologationTable !== false}
                disabled={readOnly || !homologatesOf(liveSettings)}
                onCheckedChange={(checked) => patchSettings({ showHomologationTable: checked === true })}
              />
              Mostrar en el dictamen
            </label>
          </span>
        )}
      >
        {!homologatesOf(liveSettings) ? (
          <p className="rounded-md border border-highlight/50 bg-highlight/10 p-2 text-xs text-foreground" data-homologation-off="">
            Sin homologación: ningún factor se aplica. El promedio, la mediana y el rango del ±30 % salen de los valores unitarios de las ofertas tal como
            se capturaron, y el dictamen no imprime la tabla de homologación. Los factores capturados se conservan por si vuelves a homologar.
          </p>
        ) : null}
        {type === "TERRENO_RENTA" && homologatesOf(liveSettings) ? <p className="text-sm font-medium" data-same-factors="">{SAME_FACTORS_AS_LAND_SALE}</p> : null}
        {/* The precision is chosen in Carátula › Configuración del avalúo; here it is only said (video 7.4, 00:00). */}
        <CalculationPrecisionSummary precision={calculation.precision} />
        {homologatesOf(liveSettings) ? (<>
        <MarketFactorSlots
          slots={calculation.settings.factorSlots}
          customFactors={customFactors}
          readOnly={readOnly}
          saving={savingSettings}
          onChange={(factorSlots) => patchSettings({ factorSlots })}
          onCreate={createFactor}
        />
        {ratedSlots.length ? (
          <div className="grid gap-2 rounded-md border bg-background p-3">
            <p className="text-xs text-muted-foreground">
              Calificación del sujeto: se elige una vez y cada comparable solo elige la suya en la tabla; el factor se calcula solo.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {ratedSlots.map((slot) => (
                <Field key={slot.type}>
                  <FieldLabel htmlFor={`subject-rating-${slot.type}`} className="text-xs">{slot.label}</FieldLabel>
                  <NativeSelect
                    id={`subject-rating-${slot.type}`}
                    className="w-full"
                    disabled={readOnly}
                    value={slot.subjectOption ?? ""}
                    onChange={(event) => patchSettings({ factorSlots: liveSettings.factorSlots.map((item) =>
                        !item.key && item.type === slot.type ? { ...item, subjectOption: event.target.value || null } : item),
                    })}
                  >
                    <NativeSelectOption value="">Sin elegir</NativeSelectOption>
                    {optionsFor(catalog, slot.type).map((option) => (
                      <NativeSelectOption key={option.label} value={option.label}>{option.label} ({option.value})</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              ))}
            </div>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground" data-homologation-in-table="">
          Los factores de cada comparable se escriben en la tabla «Homologación» de su bloque, abajo. Para renombrar un factor, escribe sobre su encabezado en esa tabla: el anexo de factores y la memoria toman el mismo nombre.
        </p>
        <MarketHomologationCapture
          at={captureAt.homologation}
          comparables={comparables}
          slots={calculation.settings.factorSlots}
          result={result}
          catalog={catalog}
          readOnly={readOnly}
          note={{ show: liveSettings.showHomologationNote !== false, text: liveSettings.homologationNote ?? null, defaultText: DEFAULT_HOMOLOGATION_NOTE }}
          onNote={(note) => patchSettings({ ...note })}
          onFactors={changeComparable}
          onInvalid={(message) => toast.error(message)}
          decimals={factorDecimals(calculation.precision)}
          surfaceFormulas={surfaceFactorFormulas({ settings: liveSettings, comparables }, calculation.precision)}
        />
        </>) : null}
        {homologatesOf(liveSettings) && liveSettings.showHomologationTable === false ? (
          <p className="text-xs text-muted-foreground" data-homologation-hidden="">
            La tabla de homologación no se imprime en el dictamen; los datos de los comparables, las estadísticas y el valor sí. La memoria de cálculo
            la conserva.
          </p>
        ) : null}
      </Part>

      <Part number={5} title="Valor adoptado y estadísticas">
        <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-4" onBlur={() => saveSettings()}>
          {/* The adopted value is typed in its box under the table of the dictamen; while that box is not there (no result yet), here. */}
          <CaptureSlot at={captureAt.adopted} fallback>
            <Field className="sm:col-span-2" data-adopted-field="">
              <FieldLabel htmlFor="market-adopted" className="sr-only">{labels.adopted}</FieldLabel>
              <FormulaInput
                id="market-adopted"
                grouping
                disabled={readOnly}
                aria-label={labels.adopted}
                title={`${labels.adopted}: escríbelo aquí. Vacío, el promedio homologado.`}
                value={draft.adoptedUnitValue}
                placeholder={stats ? `Promedio: ${stats.mean.toFixed(2)}` : labels.adopted}
                // Saved as typed: the field is always free to be retyped or cleared; only concluding waits for a value within the range.
                className={cn("h-7 min-w-28 text-right text-xs", result?.adoptedOutsideLimits && "border-destructive focus-visible:ring-destructive/30")}
                onChange={setDraftField("adoptedUnitValue")}
                onBlur={() => saveSettings()}
              />
            </Field>
          </CaptureSlot>
          <Field>
            <FieldLabel htmlFor="market-rounding">Redondeo del valor</FieldLabel>
            <RoundingSelect
              id="market-rounding"
              label="Redondeo del valor"
              value={liveSettings.rounding === undefined ? DEFAULT_ENGINE_CONFIG.rounding.market.comparativeValue : liveSettings.rounding}
              onChange={(rounding) => patchSettings({ rounding })}
            />
          </Field>
        </fieldset>
        {result && stats ? (
          <div className="grid gap-2 rounded-md border bg-background p-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Estadísticas informativas: el promedio y la mediana son referencia para el valor que adoptas. Un valor fuera del rango permitido
              se guarda, pero el avalúo no se puede concluir mientras este mercado esté en el informe.
            </p>
            {/* The statistics, the adopted value and the value of the approach are in the boxes of the table of the dictamen; here, only what it does not print. */}
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Rango permitido para el valor adoptado (±30 % del promedio y la mediana)</dt>
                <dd className="tabular-nums">{money(result.adoptedLimits.min)} – {money(result.adoptedLimits.max)}</dd>
              </div>
              {stats.dispersion > 1.25 ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Dispersión final (máx. ÷ mín. homologados)</dt>
                  <dd className="tabular-nums text-highlight-strong" data-dispersion="final">{stats.dispersion.toFixed(2)}</dd>
                </div>
              ) : null}
            </dl>
            {result.adoptedOutsideLimits ? (
              <p role="alert" className="flex items-center gap-1 text-sm font-medium text-destructive" data-adopted-outside="">
                <AlertTriangle className="size-3.5 shrink-0" /> {ADOPTED_VALUE_OUTSIDE_MESSAGE}
              </p>
            ) : null}
            <PrintedStatisticsControl
              value={printedStatisticsOf(liveSettings)}
              readOnly={readOnly}
              onChange={(printedStatistics) => patchSettings({ printedStatistics })}
            />
          </div>
        ) : live?.reason ? (
          <p className="text-sm text-muted-foreground">{live.reason}</p>
        ) : null}
      </Part>

      <Part
        number={6}
        title="Justificación de los factores utilizados"
        collapsible={{ open: Boolean(liveSettings.justification) || comparables.some((comparable) => comparable.factorJustification) }}
        aside={(
          <label className="flex items-center gap-1.5 text-xs font-normal">
            <Checkbox
              checked={liveSettings.showFactorJustification !== false}
              disabled={readOnly}
              onCheckedChange={(checked) => patchSettings({ showFactorJustification: checked === true })}
            />
            Mostrar en el dictamen
          </label>
        )}
      >
        <fieldset disabled={readOnly} className="grid gap-3" onBlur={() => saveSettings()}>
          <Field>
            <FieldLabel htmlFor="market-justification">Texto general (opcional)</FieldLabel>
            <Textarea id="market-justification" rows={2} value={draft.justification} onChange={setDraftField("justification")} />
          </Field>
        </fieldset>
        {comparables.map((comparable) => (
          <ComparableJustification
            key={`${comparable.id}:${comparable.factorJustification ?? ""}`}
            comparable={comparable}
            readOnly={readOnly}
            onCommit={(factorJustification) => changeComparable(comparable, (current) => ({ ...current, factorJustification }))}
          />
        ))}
        <p className="text-xs text-muted-foreground">Se imprime después de las tablas de homologación.</p>
      </Part>

      {/* Each comparable in its rows of the tables of the dictamen: where it is, its surface and its offer are typed there. */}
      {comparables.map((comparable, index) => (
        <Fragment key={comparable.id}>
          <CaptureSlot at={{ table: captureAt.characteristics.table, row: captureAt.characteristics.rows[index], column: captureAt.characteristics.location }}>
            <CommitCell
              ariaLabel={`Ubicación, comparable ${comparable.reference}`}
              className={CAPTURE_TEXT_CELL}
              disabled={readOnly}
              value={comparable.location}
              onCommit={(text) => {
                // A comparable is known by where it is: an emptied cell keeps the one it had.
                if (text.trim()) changeComparable(comparable, (current) => ({ ...current, location: text.trim() }));
              }}
            />
          </CaptureSlot>
          <CaptureSlot at={{ table: captureAt.characteristics.table, row: captureAt.characteristics.rows[index], column: captureAt.characteristics.text }}>
            <CommitCell
              ariaLabel={`Texto libre de características, comparable ${comparable.reference}`}
              className={CAPTURE_TEXT_CELL}
              disabled={readOnly}
              value={comparable.characteristicsText ?? ""}
              placeholder={characteristicsLine(comparable, fields) || "Sus características, de la hoja 2.1"}
              title="En gris, la línea que arma el sistema con la hoja de características (2.1). Escribe aquí un texto libre para imprimirlo en su lugar; vacío, vuelve la línea."
              noFill
              onCommit={(text) => changeComparable(comparable, (current) => ({ ...current, characteristicsText: text.trim() || null }))}
            />
          </CaptureSlot>
          {([["area", captureAt.offers.area], ["price", captureAt.offers.price]] as const).map(([key, column]) => (
            <CaptureSlot key={key} at={{ table: captureAt.offers.table, row: captureAt.offers.rows[index], column }}>
              <ComparableCharacteristicCell
                comparable={comparable}
                field={fields.find((field) => field.key === key) ?? { key, label: key === "area" ? "Superficie" : labels.price }}
                readOnly={readOnly}
                numberText={(text) => characteristicNumberText(text, thousandsSeparator)}
                className={cn(CAPTURE_TEXT_CELL, "text-right")}
                place="ofertas"
                onComparable={changeComparable}
              />
            </CaptureSlot>
          ))}
        </Fragment>
      ))}

      {editing ? (
        <ComparableDialog
          key={editingComparable?.id ?? "nuevo"}
          open
          onOpenChange={(open) => { if (!open) { setEditing(null); setPrefill(null); } }}
          prefill={prefill?.values}
          listingText={prefill?.listingText}
          initialImages={prefill?.images}
          comparable={editingComparable ? cardOf(comparables.find((item) => item.id === editingComparable.id) ?? editingComparable) : null}
          characteristicFields={fields}
          comparableType={type}
          unitLabel={priceLabel}
          readOnly={readOnly}
          onSubmit={(values, pending, mergeInto) => submitComparable(editingComparable, values, pending, mergeInto)}
          onUploadPhoto={async (file) => {
            if (editingComparable) await run(() => api.market.uploadPhoto(valuationId, type, editingComparable.id, file), "Fotografía agregada");
          }}
          onRemovePhoto={async (photoId) => {
            if (editingComparable) await run(() => api.market.deletePhoto(valuationId, type, editingComparable.id, photoId));
          }}
          onFramePhoto={async (photoId, framing) => {
            if (editingComparable) await run(() => api.market.framePhoto(valuationId, type, editingComparable.id, photoId, framing), "Encuadre de la fotografía guardado");
          }}
          onUploadScreenshot={async (file) => {
            if (editingComparable) await run(() => api.market.uploadScreenshot(valuationId, type, editingComparable.id, file), "Pantalla de referencia guardada");
          }}
          onRemoveScreenshot={async () => {
            if (editingComparable) await run(() => api.market.deleteScreenshot(valuationId, type, editingComparable.id));
          }}
          onCheckDuplicates={(probe) => api.market.duplicates(valuationId, probe)}
          onReuse={(comparableId) => run(() => api.market.reuseComparable(valuationId, type, comparableId), "Comparable existente agregado. Califica sus factores.")}
          defaultValidityMonths={calculation.comparableValidityMonths}
          valuationDate={calculation.valuationDate}
          // A market of the valuation is of real estate: its cards are never a machine's.
          comparableClass="INMUEBLE"
          attributeNames={[...new Set(comparables.flatMap((item) => (item.attributes ?? []).map((attribute) => attribute.name)))]}
          attributesHint="Lo que agregues aquí se vuelve una característica de este mercado: aparece en todas sus fichas y en la tabla 2.1, y se imprime. Una superficie con su nombre («Sup. común», 12) se imprime en m²."
        />
      ) : null}
    </section>
  );
}

const subscribeToNothing = () => () => {};

/**
 * How far down the editor was while this market's panel was open, kept for
 * the tab (V8.2): after changing the view or reloading, the editor goes back
 * there once the page is tall enough, unless the appraiser scrolls first.
 */
function useKeptEditorScroll(root: RefObject<HTMLElement | null>, key: string) {
  useEffect(() => {
    const scroller = root.current?.closest<HTMLElement>("#valuation-form");
    if (!scroller) return;
    const target = storedMarketScroll(sessionStore(), key);
    let restoring = target !== null;
    let frame = 0;
    const started = performance.now();
    const stopRestoring = () => { restoring = false; };
    // The panel and its pages load a moment after: try for a few seconds, until the editor can scroll that far.
    const restore = () => {
      if (!restoring || target === null) return;
      if (scroller.scrollHeight - scroller.clientHeight >= target - 2) {
        scroller.scrollTop = target;
        restoring = false;
        return;
      }
      if (performance.now() - started > 4000) { restoring = false; return; }
      frame = window.requestAnimationFrame(restore);
    };
    frame = window.requestAnimationFrame(restore);
    let pending = 0;
    const keep = () => {
      if (restoring || pending) return;
      pending = window.requestAnimationFrame(() => {
        pending = 0;
        storeMarketScroll(sessionStore(), key, scroller.scrollTop);
      });
    };
    scroller.addEventListener("scroll", keep, { passive: true });
    // The appraiser moving the page himself wins over the restore.
    for (const event of ["wheel", "touchstart", "keydown", "pointerdown"] as const) scroller.addEventListener(event, stopRestoring, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(pending);
      scroller.removeEventListener("scroll", keep);
      for (const event of ["wheel", "touchstart", "keydown", "pointerdown"] as const) scroller.removeEventListener(event, stopRestoring);
    };
  }, [root, key]);
}

/** A row of «2. Comparables» that drags by its handle to change the order (V7.2-14). */
function SortableComparableRow(props: { comparable: ComparableDto; readOnly: boolean; children: ReactNode }) {
  const { comparable } = props;
  const sortable = useSortableRow(comparable.id, { disabled: props.readOnly, label: `Arrastrar el comparable ${comparable.reference}` });
  return (
    <tr {...sortable.row} className={cn(CALC_ROW, sortable.className)} data-comparable-row={formatComparableId(comparable.folio) ?? comparable.id}>
      <td className="w-8 px-0.5 py-1.5">{sortable.handle}</td>
      {props.children}
    </tr>
  );
}

/** "Comparable 1" and its text; sent when the appraiser leaves the field. */
function ComparableJustification(props: { comparable: ComparableDto; readOnly: boolean; onCommit: (text: string | null) => void }) {
  const { comparable } = props;
  const [value, setValue] = useState(comparable.factorJustification ?? "");
  const id = `market-justification-${comparable.id}`;
  return (
    <Field>
      <FieldLabel htmlFor={id} className="font-bold">Comparable {comparable.reference}</FieldLabel>
      <Textarea
        id={id}
        rows={2}
        disabled={props.readOnly}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (value.trim() !== (comparable.factorJustification ?? "")) props.onCommit(value.trim() || null);
        }}
      />
    </Field>
  );
}

/** What each statistic is called where the appraiser chooses whether it prints. */
const STATISTIC_LABELS: Record<MarketStatistic, string> = {
  offerMin: "Mínimo de oferta",
  offerMax: "Máximo de oferta",
  initialDispersion: "Dispersión inicial",
  min: "Mínimo homologado",
  max: "Máximo homologado",
  dispersion: "Dispersión final",
  mean: "Promedio homologado",
  median: "Mediana homologada",
};

/**
 * A box per statistic and its order (video 5.3, 11:50): the marked ones print
 * in the dictamen, in this order. The mean and the median print beside the
 * adopted value, the rest in the box of the dispersion.
 */
function PrintedStatisticsControl(props: { value: PrintedStatistics; readOnly: boolean; onChange: (value: PrintedStatistics) => void }) {
  const { order, hidden } = props.value;
  const move = (index: number, step: -1 | 1) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item);
    props.onChange({ order: next, hidden });
  };
  return (
    <fieldset className="grid gap-1.5 border-t pt-2" disabled={props.readOnly} data-printed-statistics="">
      <legend className="text-xs font-medium">Estadísticas en el dictamen</legend>
      <p className="text-xs text-muted-foreground">
        Las marcadas aparecerán en el dictamen, en este orden. El promedio y la mediana van junto al valor adoptado; las demás, en el recuadro de la dispersión.
      </p>
      <ol className="grid gap-1 sm:grid-cols-2">
        {order.map((key, index) => (
          <li key={key} className="flex items-center gap-1.5 text-sm">
            <Checkbox
              id={`printed-statistic-${key}`}
              checked={!hidden.includes(key)}
              onCheckedChange={(checked) => props.onChange({ order, hidden: checked === true ? hidden.filter((item) => item !== key) : [...hidden, key] })}
            />
            <label htmlFor={`printed-statistic-${key}`} className="flex-1">{STATISTIC_LABELS[key]}</label>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Subir ${STATISTIC_LABELS[key]}`} disabled={index === 0} onClick={() => move(index, -1)}>
              <ArrowUp />
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bajar ${STATISTIC_LABELS[key]}`} disabled={index === order.length - 1} onClick={() => move(index, 1)}>
              <ArrowDown />
            </Button>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}
