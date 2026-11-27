"use client";

import { AlertTriangle, ArrowDown, ArrowDownWideNarrow, ArrowUp, ArrowUpNarrowWide, Calculator, EyeOff, FileDown, IdCard, Loader2, MapPin, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { Fragment, useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { api, SessionExpiredError, type ComparableFormValues } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { CALC_SECTION_HEADING } from "./calculation-table-style";
import { useAiAssist } from "@/features/ai/ai-assist-context";
import type { ListingReading } from "@/features/ai/listing-prefill";
import { DEFAULT_ENGINE_CONFIG } from "@/features/valuations/engine/config";
import { computeMarketApproach, type MarketApproachResult } from "@/features/valuations/engine/market";
import {
  COMPARABLE_TYPE_LABELS,
  FACTOR_TYPES,
  FACTOR_TYPE_LABELS,
  MARKET_LABELS,
  FACTOR_LIMIT_MESSAGE,
  MAX_FACTOR_SLOTS,
  MIN_COMPARABLES,
  SALE_COMPARABLE_TYPES,
  characteristicFieldsOf,
  comparableFormValues,
  factorKey,
  homologationBasisOf,
  homologatesAgainstLotOrSubject,
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
  type CharacteristicField,
  type ComparableDto,
  type ComparableType,
  type FactorSlotConfig,
  type HomologationBasis,
  type MarketCalculationDto,
  type MarketSettingsDto,
} from "@/features/valuations/calculation/market-types";
import { ADOPTED_VALUE_OUTSIDE_MESSAGE } from "@/features/valuations/calculation/adopted-value-check";
import {
  MARKET_TEMPLATE_BLOCK_IDS,
  RENT_TEMPLATE_BLOCK_IDS,
  SAME_FACTORS_AS_LAND_SALE,
  characteristicsLine,
  defaultOfferIntro,
  marketCaptureColumns,
  marketColumnField,
  marketFactorColumnId,
  marketHomologationTableId,
  marketDocumentBlocks,
  marketTableId,
  suggestedSubjectAreaFor,
} from "@/features/valuations/calculation/market-document";
import {
  SPEC_LABEL_KEYS,
  cardFieldLabels,
  linkableCardFields,
  linkedColumnId,
  specLabel,
  renamedCardField,
  withLinkedColumn,
  type MarketLinkTable,
} from "@/features/valuations/calculation/market-table-columns";
import { marketReportApproach } from "@/features/valuations/services/report-approaches";
import type { CapturePages } from "@/features/valuations/calculation/capture-display";
import { CaptureSlot, SECTION_TOP_SLOT, useCaptureColumns, usePublishCapturePages } from "../editor/capture-host";
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
import { comparableWarnings, reviewStatusOf, type ReviewStatusItem } from "@/features/valuations/calculation/comparable-review";
import { builtAreaToleranceOf } from "@/features/valuations/calculation/comparable-review-checklist";
import { changesList, comparableListSteps } from "./market-comparable-undo";
import { marketMemoryKey, sessionStore, storeMarketScroll, storeMarketType, storedMarketScroll, storedMarketType } from "./market-tab-memory";
import { ComparableDialog, type PendingImages } from "./comparable-dialog";
import { ComparableReviewDialog } from "./comparable-review-dialog";
import { REVIEW_TONE_STYLES } from "./review-status-style";
import { SurfacePowerSelect } from "./calculation-controls";
import { RoundingMenu } from "./rounding-menu";
import { CalculationPrecisionSummary } from "./calculation-precision-control";
import { FactorJustificationCapture } from "./factor-justification-capture";
import { factorDecimals } from "@/features/valuations/calculation/calculation-precision";
import { ImportComparablesDialog } from "./import-comparables-dialog";
import { ComparableCharacteristicCell, MarketCharacteristicsTable, characteristicNumberText, newFieldKey, type FieldsUpdate, type SubjectUpdate } from "./market-characteristics-table";
import { MARKET_ACCENT } from "./market-accent";
import { MarketEditSession, rebaseDraft } from "./market-edit-session";
import { mirroredAttributes, sharedCharacteristics, unsharedAttributes } from "@/features/valuations/calculation/market-characteristic-sharing";
import type { SubjectFacts } from "@/features/valuations/calculation/market-subject-facts";
import { MarketHomologationCapture } from "./market-homologation-table";
import { StatisticsTable, statisticValueText } from "./market-statistics-table";

/** A datum of a comparable in its cell of the table of the dictamen: framed as a field, the appraiser's among the gray figures. */
const CAPTURE_TEXT_CELL = "border-input bg-background text-xs";
import { MarketOfferLevel } from "./market-offer-level";
import { AddComparableMenu } from "./add-comparable-menu";
import { SearchComparablesDialog } from "./search-comparables-dialog";
import type { GoogleMapsPageConfig } from "@/features/maps/components/location-panel";
import { CALCULATION_REDO_LABEL, CALCULATION_UNDO_LABEL, useDraftHistory } from "./use-draft-history";
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
  /** The offers show the advertiser's name and phone as the dictamen prints them (the carátula's choice; off by default). */
  advertiserData?: boolean;
  /**
   * «Agregar al informe valuatorio» of each market, the section's switch:
   * «Quitar este mercado» turns it off and adding the market turns it on
   * (video 8.7, 06:40: «si se quita, debe estar vinculado con esto»).
   */
  report?: { included: (type: ComparableType) => boolean; onIncludedChange: (type: ComparableType, included: boolean) => void };
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
  // The section's switch of each market, the same as «Quitar este mercado» and «Agregar mercado» (video 8.7, 06:40).
  const includeInReport = (item: ComparableType, included: boolean) => {
    if (props.report && props.report.included(item) !== included) props.report.onIncludedChange(item, included);
  };
  // «Quitar este mercado» can be taken back with Ctrl+Z right after, as with «Deshacer» of its notice (V8.7: it went to Ingresos).
  const pendingRestore = useRef<(() => void) | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const restore = pendingRestore.current;
      if (!restore || event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z") return;
      // Typing in a field keeps its own undo.
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault();
      event.stopPropagation();
      pendingRestore.current = null;
      restore();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
  const restoreMarket = async (item: ComparableType, snapshot: MarketCalculationDto, comparableIds: string[]) => {
    pendingRestore.current = null;
    try {
      if (comparableIds.length) await api.market.restoreMarket(valuationId, item, comparableIds);
      if (snapshot.configured) await api.market.saveSettings(valuationId, snapshot.settings);
      setShown((current) => new Set([...current, item]));
      setType(item);
      includeInReport(item, true);
      toast.success(`Mercado de ${COMPARABLE_TYPE_LABELS[item].toLowerCase()} restaurado.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo deshacer.");
    }
  };
  /** Shows a market not captured yet, and puts it in the report. */
  const addMarket = (item: ComparableType) => {
    setShown((current) => new Set([...current, item]));
    setType(item);
    includeInReport(item, true);
  };
  // The section's «Agregar al informe valuatorio» turned on for a market not shown here: it asks first (video 8.7, 07:20).
  const [asking, setAsking] = useState<ComparableType | null>(null);
  const answered = useRef(false);
  const includedKey = types.map((item) => (props.report?.included(item) ? "1" : "0")).join("");
  const seenIncluded = useRef<string | null>(null);
  useEffect(() => {
    const before = seenIncluded.current;
    seenIncluded.current = includedKey;
    if (before === null || props.readOnly) return;
    const turnedOn = types.find((item, index) => before[index] === "0" && includedKey[index] === "1" && !shown.has(item));
    if (turnedOn) {
      answered.current = false;
      setAsking(turnedOn);
    }
    // Only a change of the switches asks; the markets shown follow them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includedKey]);
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
            // Out of the report too, unless another market shown goes with the same switch (the rents of land and of buildings).
            const sameSwitch = types.filter((other) => other !== item && shown.has(other) && marketReportApproach(other) === marketReportApproach(item));
            if (!sameSwitch.length) includeInReport(item, false);
            const restore = () => void restoreMarket(item, snapshot, comparableIds);
            pendingRestore.current = restore;
            toast.success(`Mercado de ${name} quitado.`, {
              description: "Deshacer (o Ctrl+Z) lo regresa con sus comparables.",
              duration: 15000,
              action: { label: "Deshacer", onClick: restore },
              onAutoClose: () => { if (pendingRestore.current === restore) pendingRestore.current = null; },
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
              onClick={() => addMarket(item)}
            >
              <Plus data-icon="inline-start" /> {addMarketLabel(item)}
            </Button>
          )) : null}
          <span className="text-xs text-muted-foreground">
            Cada mercado lleva sus comparables, su homologación y su valor, y escribe sus propias páginas en el dictamen.
          </span>
        </div>
      ) : null}
      {/* Where the appraiser is, in sight over the whole section while it scrolls, its tables too (V7.2-02, video 8.7). */}
      {/* Filled with the market's pastel (V8.3), so it does not get lost among the pages of the template. */}
      <CaptureSlot at={{ table: SECTION_TOP_SLOT, part: "before" }} fallback>
        <p
          className={cn("flex flex-wrap items-center gap-2 rounded-md border border-l-4 px-3 py-2 text-sm shadow-sm", MARKET_ACCENT[type].border, MARKET_ACCENT[type].here)}
          data-market-here={type}
        >
          <MapPin className="size-4 shrink-0" aria-hidden />
          <span>Estás en: <strong className="font-semibold">{COMPARABLE_TYPE_LABELS[type]}</strong></span>
          {props.report && !props.report.included(type) ? (
            <span className="rounded-sm bg-background/70 px-1.5 text-xs font-medium" data-market-out-of-report="">No se imprime: está fuera del informe</span>
          ) : null}
          {types.length > 1 ? (
            <span className="text-xs text-foreground/75">Abajo ves solo las páginas de este mercado; el dictamen imprime todos los mercados agregados al informe.</span>
          ) : null}
        </p>
      </CaptureSlot>
      <AlertDialog open={asking !== null} onOpenChange={(open) => { if (open) return; if (asking && !answered.current) includeInReport(asking, false); answered.current = false; setAsking(null); }}>
        <AlertDialogContent size="sm" data-add-market-question="">
          <AlertDialogHeader>
            <AlertDialogTitle>{asking ? `¿Deseas agregar un enfoque de mercado de ${COMPARABLE_TYPE_LABELS[asking].toLowerCase()}?` : ""}</AlertDialogTitle>
            <AlertDialogDescription>Se agrega su pestaña con sus especificaciones, sus comparables y su homologación, y sus páginas entran al dictamen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={() => { answered.current = true; if (asking) addMarket(asking); setAsking(null); }}>Sí, agregarlo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  advertiserData?: boolean;
}) {
  const { valuationId, type, advertiserData = false } = props;
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
  const [prefill, setPrefill] = useState<{ reading: ListingReading; listingText: string; images: PendingImages } | null>(null);
  const ai = useAiAssist();
  const [catalog, setCatalog] = useState<FactorCatalog>(EMPTY_FACTOR_CATALOG);
  const [reviewThresholds, setReviewThresholds] = useState<{ builtAreaTolerance?: number; offerMaxAgeMonths?: number; statuses?: ReviewStatusItem[] }>({});
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
    // The warnings of the list use the firm's thresholds, as the review does (Despacho → Revisión de comparables).
    api.firm.reviewChecklist()
      .then((next) => { if (active) setReviewThresholds({ builtAreaTolerance: builtAreaToleranceOf(next), offerMaxAgeMonths: next.validityMonths, statuses: next.statuses }); })
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
      blocks: marketDocumentBlocks({ ...calculation, settings }, computed.result, { capture: true, advertiserData }),
      placeholderIds: isRentComparableType(calculation.settings.comparableType) ? RENT_TEMPLATE_BLOCK_IDS : MARKET_TEMPLATE_BLOCK_IDS,
    };
  }, [calculation, pagesDraft, prefilled, suggestedArea, advertiserData]);
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

  /**
   * An added characteristic deleted from the table and from the cards (video
   * 8.10, 13:40: «no es quitar, es eliminar la característica y también de la
   * ficha»): it asks, takes it out of the list and what each comparable had in
   * it; one step of the panel's «Deshacer».
   */
  const removeCharacteristicEverywhere = (field: CharacteristicField) => {
    const current = session.current;
    if (!current || readOnly) return;
    const name = field.label.trim().toLocaleLowerCase("es-MX");
    const holds = (comparable: ComparableDto) =>
      comparable.extra?.[field.key] !== undefined || (comparable.attributes ?? []).some((attribute) => attribute.name.trim().toLocaleLowerCase("es-MX") === name);
    const holding = current.view.comparables.filter(holds);
    confirmDeleteComparable({
      title: `¿Eliminar «${field.label}» de la tabla y de las fichas?`,
      description: holding.length
        ? `Se borra también lo capturado en ${holding.length === 1 ? "1 comparable" : `${holding.length} comparables`}. Puedes regresarlo con «Deshacer» del cálculo o Ctrl+Z.`
        : "Ningún comparable tiene capturado este dato. Puedes regresarlo con «Deshacer» del cálculo o Ctrl+Z.",
      confirmLabel: "Eliminar característica",
      onConfirm: () => {
        const now = session.current;
        if (!now) return;
        history.record(snapshotOf(now.view), null);
        const base = settingsFrom(now.view.settings, effectiveDraft ?? draftFrom(now.view.settings));
        const fields = characteristicFieldsOf(base).filter((item) => item.key !== field.key);
        saveSettings({
          ...base,
          characteristicFields: fields,
          subjectCharacteristics: Object.fromEntries(Object.entries(base.subjectCharacteristics ?? {}).filter(([key]) => key !== field.key)),
        }, { record: false });
        for (const comparable of now.view.comparables.filter(holds)) {
          changeComparable(comparable, (item) => {
            const { [field.key]: _removed, ...extra } = item.extra ?? {};
            return { ...item, extra, attributes: (item.attributes ?? []).filter((attribute) => attribute.name.trim().toLocaleLowerCase("es-MX") !== name) };
          }, { record: false });
        }
        toast.success(`«${field.label}» eliminada de la tabla y de las fichas.`);
      },
    });
  };
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
      return next.factor;
    } catch (error) {
      failed(error);
      return null;
    }
  };

  /*
   * The columns of the market's tables are the calculation's (videos 8.9 and 8.10): a factor of the homologation is
   * a column of its table (renamed, added among the factors or taken out there; the FRe multiplies them), and a
   * datum of the card is a column whose name is the card's in both directions. The panel tells each table so.
   */
  const slotsNow = () => session.current?.view.settings.factorSlots ?? liveSettings?.factorSlots ?? [];
  const factorAt = (columnId: string | null) => (columnId === null ? -1 : slotsNow().findIndex((_, index) => marketFactorColumnId(index) === columnId.toLowerCase()));
  const fieldAt = (table: string, columnId: string) => {
    const settings = session.current?.view.settings ?? liveSettings;
    return settings ? marketColumnField(settings, table, columnId) : null;
  };
  /** A datum of the card renamed from its column or from the card: one name in both (market-table-columns.ts). */
  const renameField = (key: string, label: string) => patchSettings((current) => renamedCardField(current, key, label));
  const toggleLinked = (table: MarketLinkTable, key: string, on?: boolean) => patchSettings((current) => {
    const linked = current.linkedColumns?.[table] ?? [];
    return { linkedColumns: withLinkedColumn(current.linkedColumns, table, key, on ?? !linked.includes(key)) };
  });
  const linkableFields = (table: MarketLinkTable) => {
    const settings = session.current?.view.settings ?? liveSettings;
    if (!settings) return [];
    const linked = new Set(settings.linkedColumns?.[table] ?? []);
    return linkableCardFields(settings).map((field) => ({ key: field.key, label: field.label, linked: linked.has(field.key) }));
  };
  // A column added among the factors is a new factor (once, though the table tells it twice).
  const insertedFactors = useRef(new Set<string>());
  const addFactor = async (after: string | null, name: string, columnId: string) => {
    if (insertedFactors.current.has(columnId)) return;
    insertedFactors.current.add(columnId);
    const slots = slotsNow();
    // Six factors, the FRe not among them (video 8.13, 18:01); the column typed is not kept.
    if (slots.length >= MAX_FACTOR_SLOTS) {
      toast.warning(FACTOR_LIMIT_MESSAGE, { description: "La columna no se agregó: el FRe multiplica solo los factores de la homologación." });
      return;
    }
    const position = after && factorAt(after) >= 0 ? factorAt(after) + 1 : 0;
    const typed = /^(nueva )?columna( \d+)?$/i.test(name.trim()) ? "" : name.trim();
    const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const used = new Set(slots.filter((slot) => !slot.key).map((slot) => slot.type));
    const ofCatalog = FACTOR_TYPES.find((factorType) => typed && plain(FACTOR_TYPE_LABELS[factorType]) === plain(typed) && !used.has(factorType));
    let slot: FactorSlotConfig;
    if (ofCatalog) slot = { type: ofCatalog, label: FACTOR_TYPE_LABELS[ofCatalog] };
    else if (!used.has("OTRO")) slot = { type: "OTRO", label: typed || FACTOR_TYPE_LABELS.OTRO };
    else {
      const created = await createFactor(typed || `Factor ${slots.length + 1}`);
      if (!created) return;
      slot = { type: "OTRO", key: created.key, label: created.label };
    }
    patchSettings((current) => ({ factorSlots: [...current.factorSlots.slice(0, position), slot, ...current.factorSlots.slice(position)] }));
    toast.success(`Factor «${slot.label}» agregado a la homologación.`, { description: "Escribe el factor de cada comparable en su columna; el FRe los multiplica." });
  };
  const removeFactor = (index: number) => {
    const slot = slotsNow()[index];
    if (!slot || slot.type === "SUPERFICIE") return;
    patchSettings((current) => ({ factorSlots: current.factorSlots.filter((item) => factorKey(item) !== factorKey(slot)) }));
    toast.success(`Factor «${slot.label}» quitado de la homologación.`, { description: "Lo capturado se conserva: Ctrl+Z o «Deshacer» del cálculo lo regresa." });
  };
  const homologationTable = marketHomologationTableId(type);
  useCaptureColumns(homologationTable, {
    handles: (columnId) => factorAt(columnId) >= 0 || fieldAt(homologationTable, columnId) !== null,
    rename: (columnId, label) => {
      const index = factorAt(columnId);
      if (index >= 0) patchSettings((current) => ({ factorSlots: current.factorSlots.map((item, position) => (position === index ? { ...item, label } : item)) }));
      const field = fieldAt(homologationTable, columnId);
      if (field) renameField(field, label);
    },
    // The surface factor, the FRe and the homologated value are the homologation; the rest may go.
    removable: (columnId) => {
      const index = factorAt(columnId);
      if (index >= 0) return slotsNow()[index].type !== "SUPERFICIE";
      return ["col-2", "col-3", "col-4"].includes(columnId.toLowerCase()) || fieldAt(homologationTable, columnId) !== null;
    },
    takesRemoval: (columnId) => factorAt(columnId) >= 0 || fieldAt(homologationTable, columnId) !== null,
    remove: (columnId) => {
      const index = factorAt(columnId);
      if (index >= 0) removeFactor(index);
      const field = fieldAt(homologationTable, columnId);
      if (field) toggleLinked("homologacion", field, false);
    },
    takesInsert: (after) => after !== null && (after.toLowerCase() === "col-4" || factorAt(after) >= 0),
    insert: (after, name, columnId) => void addFactor(after, name, columnId),
    // The statistics are edited in their own table under the homologation, not among the box labels.
    boxRowManaged: (rowKey) => rowKey.startsWith("dispersion.") || (rowKey.startsWith("valores.") && rowKey !== "valores.adoptado"),
    linkable: () => linkableFields("homologacion"),
    link: (key) => toggleLinked("homologacion", key),
  });
  const comparablesTable = marketTableId(type, "caracteristicas");
  useCaptureColumns(comparablesTable, {
    handles: (columnId) => fieldAt(comparablesTable, columnId) !== null,
    rename: (columnId, label) => {
      const field = fieldAt(comparablesTable, columnId);
      if (field) renameField(field, label);
    },
    // The reference and the location name the comparable; the rest may go.
    removable: (columnId) => !["col-1", "col-2"].includes(columnId.toLowerCase()),
    takesRemoval: (columnId) => fieldAt(comparablesTable, columnId) !== null,
    remove: (columnId) => {
      const field = fieldAt(comparablesTable, columnId);
      if (field) toggleLinked("caracteristicas", field, false);
    },
    linkable: () => linkableFields("caracteristicas"),
    link: (key) => toggleLinked("caracteristicas", key),
  });
  const offersTable = marketTableId(type, "ofertas");
  useCaptureColumns(offersTable, {
    handles: (columnId) => fieldAt(offersTable, columnId) !== null,
    rename: (columnId, label) => {
      const field = fieldAt(offersTable, columnId);
      if (field) renameField(field, label);
    },
    // The reference, the area and the offer are captured here; the rest may go.
    removable: (columnId) => !["col-1", "col-5", "col-6"].includes(columnId.toLowerCase()),
    takesRemoval: (columnId) => (liveSettings?.linkedColumns?.ofertas ?? []).some((key) => linkedColumnId(key) === columnId.toLowerCase()),
    remove: (columnId) => {
      const field = fieldAt(offersTable, columnId);
      if (field) toggleLinked("ofertas", field, false);
    },
    linkable: () => linkableFields("ofertas"),
    link: (key) => toggleLinked("ofertas", key),
  });

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
  // The value's bar under the table of the adopted value: «Valor comparativo» with its rounding as an option of its own.
  const valueAt = { table: captureAt.adopted.table, box: "valor.valor" };
  const valueWithRounding = (
    <RoundingMenu
      label="valor de mercado"
      value={liveSettings.rounding === undefined ? DEFAULT_ENGINE_CONFIG.rounding.market.comparativeValue : liveSettings.rounding}
      readOnly={readOnly}
      onChange={(rounding) => patchSettings({ rounding })}
    >
      <span className="rounded-sm bg-muted/70 px-1.5 py-1 text-right font-semibold tabular-nums" data-market-value="">{result ? money(result.value) : ""}</span>
    </RoundingMenu>
  );
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

  // Where each part of the capture sits: right above the table it sets, in the order of the appraiser's Excel (video 8.10).
  const tableOf = (name: "oferta" | MarketLinkTable) => marketTableId(type, name);
  const statisticsChoice = printedStatisticsOf(liveSettings);
  const homologatedValues = result?.homologation.comparables.map((row) => row.homologatedUnitValue) ?? [];
  const specLabelOf = (key: keyof typeof SPEC_LABEL_KEYS, fallback: string) => specLabel(liveSettings, key, fallback);
  const renameSpec = (key: keyof typeof SPEC_LABEL_KEYS, label: string) =>
    patchSettings((current) => {
      const { [SPEC_LABEL_KEYS[key]]: _previous, ...rest } = current.fieldLabels ?? {};
      return { fieldLabels: label.trim() ? { ...rest, [SPEC_LABEL_KEYS[key]]: label.trim() } : rest };
    });

  return (
    <section
      ref={panelRef}
      // Focusable from code only: after a deletion the focus waits here, so Ctrl+Z is the panel's.
      tabIndex={-1}
      className={cn("grid gap-3 rounded-lg border-2 border-dashed bg-muted/20 p-3 outline-none", MARKET_ACCENT[type].border)}
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
          {savingSettings ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
          {!readOnly ? (
            <span className="ml-auto inline-flex items-center gap-1" role="group" aria-label="Deshacer y rehacer del cálculo">
              <Button type="button" size="sm" variant="ghost" disabled={!history.canUndo} title="Deshacer el último cambio del cálculo (Ctrl+Z)" onClick={() => { const current = snapshot(); if (current) history.undo(current); }}>
                <Undo2 data-icon="inline-start" /> {CALCULATION_UNDO_LABEL}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={!history.canRedo} title="Rehacer (Ctrl+Y)" onClick={() => { const current = snapshot(); if (current) history.redo(current); }}>
                <Redo2 data-icon="inline-start" /> {CALCULATION_REDO_LABEL}
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
          Todo se captura abajo, en el bloque de este mercado y en el orden de tu formato: especificaciones, nivel de oferta, comparables, características,
          datos de la oferta, homologación y valores. Las celdas en blanco son tuyas y las grises las calcula el sistema.
          {type === "TERRENO_VENTA" ? " El enfoque de costos toma el valor de este mercado de terrenos para el terreno." : null}
        </p>
      </header>

      {calculation.locked ? (
        <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p>
      ) : null}

      {/* 1. Especificaciones and the offer level, over the offer level of the page (they do not print; the boxes over the homologation print what applies). */}
      <CaptureSlot at={{ table: tableOf("oferta"), part: "before" }} fallback>
        <div className="grid gap-3" data-market-specs="">
          <h4 className={CALC_SECTION_HEADING}>Especificaciones</h4>
          <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onBlur={() => saveSettings()}>
            {homologatesAgainstLotOrSubject(type) ? (
              <Field className="sm:col-span-2 lg:col-span-4" data-homologation-basis="">
                <FieldLabel id="market-basis-label">Homologación de acuerdo a</FieldLabel>
                <div role="radiogroup" aria-labelledby="market-basis-label" className="flex flex-wrap items-center gap-4 text-sm">
                  {([["LOTE_TIPO", PAGE_BASE_LABEL], ["SUJETO", "Sujeto"]] as Array<[HomologationBasis, string]>).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-1.5">
                      <input type="radio" name={`market-basis-${type}`} checked={basis === value} onChange={() => patchSettings({ homologationBasis: value })} />
                      {label}
                    </label>
                  ))}
                  <span className="text-xs text-muted-foreground">Sujeto: homologación directa; lote tipo: indirecta. Aplica a todos los factores.</span>
                </div>
              </Field>
            ) : null}
            <SpecField label={specLabelOf("subjectArea", labels.subjectArea)} defaultLabel={labels.subjectArea} readOnly={readOnly} onRename={(label) => renameSpec("subjectArea", label)} htmlFor="market-subject-area">
              <FormulaInput id="market-subject-area" grouping value={effectiveDraft?.subjectArea ?? ""} onChange={setDraftField("subjectArea")} />
              {prefilled ? (
                <p className="text-xs text-muted-foreground" data-subject-area-prefilled="">
                  Tomada de la superficie {isLandComparableType(type) ? "de terreno" : "construida"} del avalúo; puedes cambiarla.
                </p>
              ) : null}
            </SpecField>
            {againstBase ? (
              <SpecField label={specLabelOf("baseArea", "Lote tipo (m²)")} defaultLabel="Lote tipo (m²)" readOnly={readOnly} onRename={(label) => renameSpec("baseArea", label)} htmlFor="market-base-area">
                <FormulaInput id="market-base-area" grouping value={draft.baseArea} onChange={setDraftField("baseArea")} />
                {!draft.baseArea ? <p className="text-xs text-highlight-strong">Sin lote tipo, el factor de superficie usa el sujeto.</p> : null}
              </SpecField>
            ) : null}
            <SpecField
              label={specLabelOf("frontage", againstBase ? "Frente tipo en la zona" : "Frente del sujeto")}
              defaultLabel={againstBase ? "Frente tipo en la zona" : "Frente del sujeto"}
              unit="m"
              readOnly={readOnly}
              onRename={(label) => renameSpec("frontage", label)}
              htmlFor="market-typical-frontage"
            >
              <FormulaInput id="market-typical-frontage" value={draft.typicalFrontage} onChange={setDraftField("typicalFrontage")} />
            </SpecField>
            <SpecField
              label={specLabelOf("depth", againstBase ? "Fondo tipo en la zona" : "Fondo del sujeto")}
              defaultLabel={againstBase ? "Fondo tipo en la zona" : "Fondo del sujeto"}
              unit="m"
              readOnly={readOnly}
              onRename={(label) => renameSpec("depth", label)}
              htmlFor="market-typical-depth"
            >
              <FormulaInput id="market-typical-depth" value={draft.typicalDepth} onChange={setDraftField("typicalDepth")} />
            </SpecField>
            {/* The power with its explanation beside it (video 8.7: «debería decir potencia n para cálculo de factor de superficie»). */}
            <div className="grid gap-x-4 gap-y-1 sm:col-span-2 lg:col-span-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:items-end" data-surface-power="">
              <Field>
                <FieldLabel htmlFor="market-power">Potencia n para cálculo del factor de superficie</FieldLabel>
                <SurfacePowerSelect id="market-power" value={liveSettings.surfacePower} onChange={(surfacePower) => patchSettings({ surfacePower })} />
              </Field>
              <p className="text-sm text-muted-foreground lg:pb-2">
                <span className="font-medium text-foreground" data-surface-formula="">{marketSurfaceFormula(liveSettings)}</span>. En cada comparable puedes
                escribir otro factor de superficie en su celda de la homologación. Los campos numéricos aceptan cálculos: =5*10000.
              </p>
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground">
            No se imprime así: el dictamen imprime la superficie, el {againstBase ? "lote tipo" : "sujeto"}, el frente y el fondo en los recuadros arriba de la homologación,
            con los nombres que les des aquí.
          </p>
          <MarketOfferLevel
            labels={offerLabelsOf(liveSettings)}
            mark={offerMarkOf(liveSettings)}
            intro={liveSettings.offerIntro ?? null}
            defaultIntro={defaultOfferIntro(type)}
            readOnly={readOnly}
            onChange={(offer) => patchSettings({ ...offer, offerLevel: null })}
          />
        </div>
      </CaptureSlot>

      {/* Over the table of the comparables: adding, importing, searching and ordering them (video 8.10, 07:54). */}
      <CaptureSlot at={{ table: tableOf("caracteristicas"), part: "before" }} fallback>
        <div className="grid gap-2" data-market-comparables-bar="">
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly ? (
              <>
                {/* V8.12: «Pegar anuncio» is one way to add a comparable, inside «Agregar comparable». */}
                <AddComparableMenu
                  key={type}
                  valuationId={valuationId}
                  type={type}
                  priceLabel={priceLabel}
                  pasteListing={ai.enabled}
                  onByHand={() => { setPrefill(null); setEditing("nuevo"); }}
                  onListing={(reading, listingText, images) => { setPrefill({ reading, listingText, images }); setEditing("nuevo"); }}
                />
                <ImportComparablesDialog scope={{ kind: "valuation", valuationId, type, onImported: applyServerState }} />
              </>
            ) : null}
            {/* Searching only reads: a concluded valuation can still look, but not add. */}
            <SearchComparablesDialog key={type} valuationId={valuationId} type={type} readOnly={readOnly} onAdded={applyServerState} googleMaps={props.googleMaps} />
            {comparables.length ? (
              <a className={cn(buttonVariants({ variant: "ghost", size: "sm" }))} href={`/api/avaluos/${valuationId}/mercado/comparables/exportar?tipo=${type}`} download>
                <FileDown data-icon="inline-start" /> Exportar Excel
              </a>
            ) : null}
            {comparables.length ? (
              <ComparableReviewDialog
                valuationId={valuationId}
                // V8.13 (13:04): the market it is opened from goes first.
                type={type}
                onStatuses={(statuses) => setReviewThresholds((current) => ({ ...current, statuses }))}
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
            {!readOnly && comparables.length > 1 ? (
              <span className="ml-auto flex flex-wrap items-center gap-1 text-xs">
                <Button type="button" size="sm" variant="ghost" title="Ordenar los comparables por su valor unitario, de menor a mayor" onClick={() => sortByUnitValue(1)}>
                  <ArrowUpNarrowWide data-icon="inline-start" /> Ordenar por ${perUnit} ↑
                </Button>
                <Button type="button" size="sm" variant="ghost" title="Ordenar los comparables por su valor unitario, de mayor a menor" onClick={() => sortByUnitValue(-1)}>
                  <ArrowDownWideNarrow data-icon="inline-start" /> Ordenar por ${perUnit} ↓
                </Button>
              </span>
            ) : null}
          </div>
          {complete < MIN_COMPARABLES ? (
            <span className="flex items-center gap-1 text-xs text-highlight-strong">
              <AlertTriangle className="size-3.5" /> El dictamen lleva al menos {MIN_COMPARABLES} comparables completos ({complete} de {MIN_COMPARABLES}).
            </span>
          ) : null}
          {!comparables.length ? (
            <p className="text-sm text-muted-foreground">Sin comparables todavía: agrégalos aquí y sus datos aparecen en las tablas de abajo.</p>
          ) : null}
        </div>
      </CaptureSlot>

      {/* «Ver ficha» and «Eliminar» at the end of each comparable's row, with its warnings (video 8.10, 11:13). */}
      {comparables.map((comparable, index) => {
        const row = captureAt.characteristics.rows[index];
        if (!row) return null;
        // Warnings only: the appraiser's judgement decides whether the comparable stays.
        const warnings = comparableWarnings(
          { ...comparable, hasScreenshot: Boolean(comparable.screenshot) },
          {
            type, subjectArea: liveSettings.subjectArea, today,
            builtAreaTolerance: reviewThresholds.builtAreaTolerance,
            offerMaxAgeMonths: comparable.validityMonths ?? reviewThresholds.offerMaxAgeMonths,
          },
        );
        return (
          <CaptureSlot key={comparable.id} at={{ table: captureAt.characteristics.table, row }}>
            <ComparableRowActions
              comparable={comparable}
              first={index === 0}
              last={index === comparables.length - 1}
              warnings={warnings.map((warning) => warning.message)}
              status={reviewStatusOf(comparable.review?.status ?? "POR_REVISAR", reviewThresholds.statuses, comparable.review)}
              readOnly={readOnly}
              onOpen={() => setEditing(comparable)}
              onMove={(by) => {
                const ids = comparables.map((item) => item.id);
                const [moved] = ids.splice(index, 1);
                ids.splice(index + by, 0, moved);
                void reorderComparables(ids, "Orden de los comparables guardado.");
              }}
              onDelete={() => confirmDeleteComparable({
                title: `¿Eliminar el comparable ${comparable.reference}?`,
                description: "Se quita de este mercado con sus factores y sus renglones del dictamen. Puedes regresarlo con «Deshacer» en el aviso, "
                  + "con «Deshacer» del cálculo o con Ctrl+Z.",
                confirmLabel: "Eliminar comparable",
                onConfirm: () => void removeComparable(comparable),
              })}
            />
          </CaptureSlot>
        );
      })}

      {/* The sheet of characteristics of the subject and the comparables, between the comparables and their offers (video 8.10, 11:40). */}
      <CaptureSlot at={{ table: tableOf("ofertas"), part: "before" }} fallback>
        <details className="group grid gap-2 rounded-md border bg-background p-2" open={comparables.length > 0} data-characteristics-sheet="">
          <summary className="cursor-pointer text-sm font-semibold" data-characteristics-title="">
            Características del sujeto y los comparables
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              No se imprime como tabla: el dictamen imprime la línea de cada comparable en «Características» de la tabla de comparables. Es la lista de datos de sus fichas.
            </span>
          </summary>
          {comparables.length && notShared && !readOnly ? (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-unshared-attributes="">
              Hay {notShared} {notShared === 1 ? "característica agregada" : "características agregadas"} solo en las fichas.
              <Button type="button" size="sm" variant="outline" onClick={shareAttributes}>Pasarlas a esta tabla</Button>
            </p>
          ) : null}
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
            onRemoveEverywhere={removeCharacteristicEverywhere}
          />
        </details>
      </CaptureSlot>

      {/* Over the homologation: what its factors need that does not print (no «Homologar», no chips: the factors are its columns). */}
      <CaptureSlot at={{ table: homologationTable, part: "before" }} fallback>
        <div className="grid gap-2" data-market-homologation-bar="">
          {type === "TERRENO_RENTA" ? <p className="text-sm font-medium" data-same-factors="">{SAME_FACTORS_AS_LAND_SALE}</p> : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {/* The precision is chosen in Carátula › Configuración del avalúo; here it is only said (video 7.4, 00:00). */}
            <CalculationPrecisionSummary precision={calculation.precision} />
            <label className="flex items-center gap-1.5">
              <Checkbox
                checked={liveSettings.showHomologationTable !== false}
                disabled={readOnly}
                onCheckedChange={(checked) => patchSettings({ showHomologationTable: checked === true })}
              />
              Imprimir la tabla de homologación en el dictamen
            </label>
          </div>
          <p className="text-xs text-muted-foreground" data-homologation-in-table="">
            Los factores son las columnas bajo «Factores de homologación»: escribe sobre un encabezado para renombrarlo, inserta una columna entre ellos para agregar un
            factor o elimínala para quitarlo. El FRe es el producto de los factores y el anexo y la memoria toman los mismos nombres.
          </p>
          {ratedSlots.length ? (
            <div className="grid gap-2 rounded-md border bg-background p-2">
              <p className="text-xs text-muted-foreground">Calificación del sujeto: se elige una vez y cada comparable elige la suya en la tabla; el factor se calcula solo.</p>
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
          {liveSettings.showHomologationTable === false ? (
            <p className="text-xs text-muted-foreground" data-homologation-hidden="">
              La tabla de homologación no se imprime en el dictamen; los datos de los comparables, las estadísticas y el valor sí. La memoria de cálculo la conserva.
            </p>
          ) : null}
        </div>
      </CaptureSlot>
      <MarketHomologationCapture
        at={captureAt.homologation}
        comparables={comparables}
        slots={calculation.settings.factorSlots}
        result={result}
        catalog={catalog}
        readOnly={readOnly}
        onFactors={changeComparable}
        onInvalid={(message) => toast.error(message)}
        decimals={factorDecimals(calculation.precision)}
        surfaceFormulas={surfaceFactorFormulas({ settings: liveSettings, comparables }, calculation.precision)}
      />

      {/* Under the homologation and its boxes: the values and statistics, then the additional amount (video 8.10, 04:18). */}
      <CaptureSlot at={{ table: homologationTable, part: "after" }} fallback>
        <div className="grid gap-3" data-market-values="">
          <div className="grid gap-2 rounded-md border bg-background p-2" data-market-statistics="">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Valores y estadísticas</h4>
              {/* The rounding is an option of the value itself, in its bar under the table (video 8.14, 06:50); here only while that bar is not on screen. */}
              <CaptureSlot at={valueAt} fallback>{result ? valueWithRounding : null}</CaptureSlot>
            </div>
            <StatisticsTable
              choice={statisticsChoice}
              values={(key) => statisticValueText(key, statisticsChoice, stats ?? null, homologatedValues)}
              readOnly={readOnly}
              onChange={(printedStatistics) => patchSettings({ printedStatistics })}
            />
            {result && stats ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Rango permitido para el valor adoptado (±30 % del promedio y la mediana): </span>
                <span className="tabular-nums">{money(result.adoptedLimits.min)} – {money(result.adoptedLimits.max)}</span>
                {stats.dispersion > 1.25 ? (
                  <span className="ml-3 text-highlight-strong" data-dispersion="final">Dispersión final {stats.dispersion.toFixed(2)} (los libros recomiendan menos de 1.25)</span>
                ) : null}
              </p>
            ) : live?.reason ? (
              <p className="text-sm text-muted-foreground">{live.reason}</p>
            ) : null}
            {result?.adoptedOutsideLimits ? (
              <p role="alert" className="flex items-center gap-1 text-sm font-medium text-destructive" data-adopted-outside="">
                <AlertTriangle className="size-3.5 shrink-0" /> {ADOPTED_VALUE_OUTSIDE_MESSAGE}
              </p>
            ) : null}
            {/* The adopted value is typed in its box under the table; while that box is not there (no result yet), here. */}
            <fieldset disabled={readOnly} onBlur={() => saveSettings()}>
              <CaptureSlot at={captureAt.adopted} fallback>
                <Field className="max-w-xs" data-adopted-field="">
                  <FieldLabel htmlFor="market-adopted" className="sr-only">{labels.adopted}</FieldLabel>
                  <FormulaInput
                    id="market-adopted"
                    grouping
                    disabled={readOnly}
                    aria-label={labels.adopted}
                    title={`${labels.adopted}: el único valor que escribes tú entre los que calcula el sistema. Vacío, el promedio homologado.`}
                    value={draft.adoptedUnitValue}
                    placeholder={stats ? `Promedio: ${money(stats.mean)}` : labels.adopted}
                    data-adopted-input=""
                    // Saved as typed: the field is always free to be retyped or cleared; only concluding waits for a value within the range.
                    // The one cell typed among the automated ones, in a colour of its own and wide enough for the whole figure
                    // (video 8.13, 04:14: «no aparece el dato completo… resálteme dónde se pone el valor a utilizar»).
                    className={cn(
                      "h-8 w-44 min-w-40 border-2 border-highlight-strong bg-highlight/15 text-right font-semibold tabular-nums",
                      result?.adoptedOutsideLimits && "border-destructive focus-visible:ring-destructive/30",
                    )}
                    onChange={setDraftField("adoptedUnitValue")}
                    onBlur={() => saveSettings()}
                  />
                </Field>
              </CaptureSlot>
            </fieldset>
          </div>

          <fieldset disabled={readOnly} className="grid gap-2 rounded-md border bg-background p-2 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-end" onBlur={() => saveSettings()} data-additional-amount="">
            <Field>
              <FieldLabel htmlFor="market-additional">Monto adicional a considerar ($)</FieldLabel>
              <FormulaInput id="market-additional" grouping value={draft.additionalAmount} placeholder="0" onChange={setDraftField("additionalAmount")} />
            </Field>
            <div className="flex flex-wrap items-center gap-4 pb-1 text-sm">
              <label className="flex items-center gap-1.5">
                <Checkbox
                  checked={liveSettings.additionalAmountInCalculation !== false}
                  onCheckedChange={(checked) => {
                    const inCalculation = checked === true;
                    // Out of the calculation it cannot print either.
                    patchSettings({ additionalAmountInCalculation: inCalculation, ...(inCalculation ? {} : { showAdditionalAmount: false }) });
                  }}
                />
                Entra al cálculo
              </label>
              <label className="flex items-center gap-1.5">
                <Checkbox
                  checked={printsAdditionalAmount(liveSettings)}
                  disabled={readOnly || liveSettings.additionalAmountInCalculation === false}
                  onCheckedChange={(checked) => patchSettings({ showAdditionalAmount: checked === true })}
                />
                Se imprime en el dictamen
              </label>
            </div>
          </fieldset>
        </div>
      </CaptureSlot>

      {/* Right under the homologation table and its notes, before its values: where the dictamen prints it (video 8.13, 02:02). */}
      <CaptureSlot at={{ table: captureAt.adopted.table, part: "notes" }} fallback>
        <FactorJustificationCapture
          readOnly={readOnly}
          shown={liveSettings.showFactorJustification !== false}
          onShownChange={(shown) => patchSettings({ showFactorJustification: shown })}
        >
          <fieldset disabled={readOnly} className="grid gap-3" onBlur={() => saveSettings()}>
            <Field>
              <FieldLabel htmlFor="market-justification">Texto general (opcional)</FieldLabel>
              <Textarea id="market-justification" rows={2} className="bg-background" value={draft.justification} onChange={setDraftField("justification")} />
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
        </FactorJustificationCapture>
      </CaptureSlot>

      {/* Each comparable in its rows of the tables of the dictamen: where it is, its surface and its offer are typed there. */}
      {comparables.map((comparable, index) => (
        <Fragment key={comparable.id}>
          <CaptureSlot at={{ table: captureAt.characteristics.table, row: captureAt.characteristics.rows[index], column: captureAt.characteristics.location }}>
            <CommitCell
              ariaLabel={`Ubicación, comparable ${comparable.reference}`}
              className={CAPTURE_TEXT_CELL}
              disabled={readOnly}
              // Each comparable has its own address: «Copiar valor a toda la columna» never writes one over the others (V8.11).
              noFill
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
          prefill={prefill?.reading.values}
          listingEvidence={prefill?.reading}
          listingText={prefill?.listingText}
          initialImages={prefill?.images}
          comparable={editingComparable ? cardOf(comparables.find((item) => item.id === editingComparable.id) ?? editingComparable) : null}
          characteristicFields={fields}
          fieldLabels={cardFieldLabels(liveSettings)}
          onRenameField={readOnly ? undefined : renameField}
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
          onSetMainPhoto={async (photoId) => {
            if (editingComparable) await run(() => api.market.setMainPhoto(valuationId, type, editingComparable.id, photoId), "Foto principal elegida: es la de su ficha");
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

/** "Comparable 1" and its text; sent when the appraiser leaves the field. */
function ComparableJustification(props: { comparable: ComparableDto; readOnly: boolean; onCommit: (text: string | null) => void }) {
  const { comparable } = props;
  const [value, setValue] = useState(comparable.factorJustification ?? "");
  const id = `market-justification-${comparable.id}`;
  return (
    <Field>
      <FieldLabel htmlFor={id} className="font-semibold text-primary">Comparable {comparable.reference}</FieldLabel>
      <Textarea
        id={id}
        rows={2}
        className="bg-background"
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


/** The radio of the lote tipo, before the appraiser names it. */
const PAGE_BASE_LABEL = "Lote tipo";

/**
 * A datum of the specifications with its name written as the appraiser wants
 * it to print (video 8.10, 09:22: «fondo del sujeto o fondo del bien
 * valuado, como ellos lo quieran llamar»); emptied, the format's name.
 */
function SpecField(props: { label: string; defaultLabel: string; unit?: string; readOnly: boolean; htmlFor: string; onRename: (label: string) => void; children: ReactNode }) {
  return (
    <Field>
      <span className="flex items-center gap-1">
        <CommitCell
          ariaLabel={`Nombre de «${props.label}»`}
          disabled={props.readOnly}
          value={props.label}
          placeholder={props.defaultLabel}
          title="Escribe el nombre con el que se imprime; vacío, vuelve el del formato"
          className="h-6 border-transparent px-0 text-sm font-medium text-foreground hover:border-input focus-visible:border-input"
          onCommit={(text) => props.onRename(text.trim() === props.defaultLabel ? "" : text)}
        />
        {props.unit ? <span className="text-xs text-muted-foreground">({props.unit})</span> : null}
        <label htmlFor={props.htmlFor} className="sr-only">{props.label}</label>
      </span>
      {props.children}
    </Field>
  );
}

/**
 * What a comparable's row of the table of comparables does, at its end (video
 * 8.10, 11:13: «ver ficha, eliminar»): move it, open its card, delete it; its
 * warnings, as a sign with the reasons.
 */
function ComparableRowActions(props: {
  comparable: ComparableDto;
  first: boolean;
  last: boolean;
  warnings: string[];
  /** Its review state, as the firm names it and colours it (videos 8.12 and 8.13). */
  status: ReviewStatusItem;
  readOnly: boolean;
  onOpen: () => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { comparable, readOnly } = props;
  return (
    <span className="flex items-center gap-0.5" data-comparable-actions={formatComparableId(comparable.folio) ?? comparable.id}>
      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5 text-xs whitespace-nowrap",
          props.status.key === "POR_REVISAR" ? "text-muted-foreground" : cn("font-medium", REVIEW_TONE_STYLES[props.status.tone].solid),
        )}
        data-review-status={props.status.key}
      >
        {props.status.label}
      </span>
      {props.warnings.length ? (
        <span className="px-0.5 text-highlight-strong" title={props.warnings.join("\n")} data-comparable-warnings="">
          <AlertTriangle className="size-3.5" aria-label={`Avisos del comparable ${comparable.reference}: ${props.warnings.join(" ")}`} />
        </span>
      ) : null}
      {!readOnly ? (
        <>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Subir el comparable ${comparable.reference}`} disabled={props.first} onClick={() => props.onMove(-1)}>
            <ArrowUp />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bajar el comparable ${comparable.reference}`} disabled={props.last} onClick={() => props.onMove(1)}>
            <ArrowDown />
          </Button>
        </>
      ) : null}
      {/* One window (V8.2): «Ver ficha» opens the card, editable in place. */}
      <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-xs" aria-label={`Ver ficha del comparable ${comparable.reference}`} onClick={props.onOpen}>
        <IdCard data-icon="inline-start" /> Ver ficha
      </Button>
      {!readOnly ? (
        <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-xs text-destructive" aria-label={`Eliminar comparable ${comparable.reference}`} onClick={props.onDelete}>
          <Trash2 data-icon="inline-start" /> Eliminar
        </Button>
      ) : null}
    </span>
  );
}
