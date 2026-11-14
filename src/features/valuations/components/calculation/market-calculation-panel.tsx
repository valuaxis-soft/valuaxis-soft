"use client";

import { AlertTriangle, ArrowDown, ArrowUp, Calculator, ChevronRight, FileDown, Loader2, Pencil, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { api, SessionExpiredError, type ComparableFormValues } from "@/lib/api-client";
import { cn } from "@/lib/utils";
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
  factorKey,
  isLandComparableType,
  isRentComparableType,
  marketEngineConfig,
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
import { DEFAULT_HOMOLOGATION_NOTE, SAME_FACTORS_AS_LAND_SALE, defaultOfferIntro, suggestedSubjectAreaFor } from "@/features/valuations/calculation/market-document";
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
import { ComparableCardButton } from "./comparable-card-dialog";
import { ComparableDialog, type PendingImages } from "./comparable-dialog";
import { ComparableReviewDialog } from "./comparable-review-dialog";
import { RoundingSelect, SurfacePowerSelect } from "./calculation-controls";
import { CalculationPrecisionControl } from "./calculation-precision-control";
import { factorDecimals } from "@/features/valuations/calculation/calculation-precision";
import { ImportComparablesDialog } from "./import-comparables-dialog";
import { MarketCharacteristicsTable, characteristicNumberText } from "./market-characteristics-table";
import { MarketFactorSlots } from "./market-factor-slots";
import { MarketHomologationTable } from "./market-homologation-table";
import { MarketOfferLevel } from "./market-offer-level";
import { PasteListingDialog } from "./paste-listing-dialog";
import { SearchComparablesDialog } from "./search-comparables-dialog";
import type { GoogleMapsPageConfig } from "@/features/maps/components/location-panel";
import { useDraftHistory } from "./use-draft-history";
import { useSerializedSave } from "./use-serialized-save";
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
}) {
  const { valuationId } = props;
  const types = props.types ?? SALE_COMPARABLE_TYPES;
  const [type, setType] = useState<ComparableType>(types[0]);
  const [shown, setShown] = useState<ReadonlySet<ComparableType>>(() => new Set([types[0]]));
  const typesKey = types.join(",");

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

  return (
    // The market shown: the preview follows it to its pages (V6.2-10).
    <div className="grid gap-2" data-active-market={type}>
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
                  "rounded-md px-3 py-1 text-sm font-medium",
                  item === type ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setType(item)}
              >
                {COMPARABLE_TYPE_LABELS[item]}
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
}) {
  const { valuationId, type } = props;
  const labels = MARKET_LABELS[type];
  const { thousandsSeparator } = useNumberPresentation();
  const rent = isRentComparableType(type);
  const perUnit = rent ? "/m²/mes" : "/m²";
  const priceLabel = rent ? "Renta mensual ($)" : "Precio de oferta ($)";
  const [calculation, setCalculation] = useState<MarketCalculationDto | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editing, setEditing] = useState<ComparableDto | "nuevo" | null>(null);
  // Data read from a pasted listing, waiting in the form of a new comparable.
  const [prefill, setPrefill] = useState<{ values: ComparablePrefill; listingText: string } | null>(null);
  const ai = useAiAssist();
  const [catalog, setCatalog] = useState<FactorCatalog>(EMPTY_FACTOR_CATALOG);
  const [customFactors, setCustomFactors] = useState<CustomFactor[]>([]);
  const [reviewThresholds, setReviewThresholds] = useState<{ builtAreaTolerance?: number; offerMaxAgeMonths?: number }>({});
  // What the server last answered, for the changes of a comparable made one after another.
  const latest = useRef<MarketCalculationDto | null>(null);
  const comparableQueue = useRef<Promise<unknown>>(Promise.resolve());
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

  const applyServerState = (next: MarketCalculationDto) => {
    latest.current = next;
    setCalculation(next);
    setDraft(draftFrom(next.settings));
  };

  // Only an editor writes the result into the dictamen; a reader would leave unsaved changes.
  const reportCalculation = useEffectEvent((next: MarketCalculationDto) => {
    if (!props.readOnly && !next.locked) props.onCalculation(next, compute(next).result);
  });

  useEffect(() => {
    let active = true;
    api.market.get(valuationId, type)
      .then((next) => {
        if (!active) return;
        setLoadError(null);
        latest.current = next;
        setCalculation(next);
        setDraft(draftFrom(next.settings));
        resetHistory();
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "No se pudo cargar el enfoque de mercado.");
      });
    return () => {
      active = false;
    };
  }, [type, valuationId]);

  // The dictamen follows what the server stored, never an unsaved draft.
  useEffect(() => {
    if (calculation) reportCalculation(calculation);
  }, [calculation]);

  const failed = (error: unknown) => toast.error(error instanceof SessionExpiredError
    ? "Tu sesión expiró. Vuelve a iniciar sesión."
    : error instanceof Error ? error.message : "No se pudo guardar.");

  const run = async (action: () => Promise<MarketCalculationDto>, success?: string) => {
    try {
      applyServerState(await action());
      if (success) toast.success(success);
      return true;
    } catch (error) {
      failed(error);
      return false;
    }
  };

  // Prefilled with the subject's real area (video 6.3): a value, not a hint, so $/m², the surface factor and FRe are computed; it stays editable.
  const prefilled = Boolean(calculation && draft && !readOnly && !draft.subjectArea && calculation.settings.subjectArea === null && suggestedArea);
  const effectiveDraft = draft && prefilled ? { ...draft, subjectArea: String(suggestedArea) } : draft;
  const liveSettings = calculation && effectiveDraft ? settingsFrom(calculation.settings, effectiveDraft) : null;
  // Recomputed on every render: a handful of comparables, and it follows every keystroke.
  const live = calculation && liveSettings ? compute({ settings: liveSettings, comparables: calculation.comparables, precision: calculation.precision }) : null;

  // The settings last asked to be saved, until the server has them: a change made right after another builds on it.
  const requested = useRef<MarketSettingsDto | null>(null);
  const enqueueSettings = useSerializedSave(async (settings: MarketSettingsDto) => {
    setSavingSettings(true);
    await run(() => api.market.saveSettings(valuationId, settings));
    if (requested.current === settings) requested.current = null;
    setSavingSettings(false);
  });
  const saveSettings = async (settings = liveSettings, options: { record?: boolean } = {}) => {
    if (!calculation || !settings || readOnly) return;
    if (JSON.stringify(settings) === JSON.stringify(calculation.settings)) return;
    if (options.record !== false) history.record({ settings: calculation.settings, comparables: calculation.comparables }, null);
    requested.current = settings;
    await enqueueSettings(settings);
  };
  // With comparables captured, the prefilled area is saved at once, so the dictamen is calculated too.
  const persistPrefilled = useEffectEvent(() => {
    if (prefilled && calculation?.comparables.length && liveSettings) void saveSettings(liveSettings, { record: false });
  });
  useEffect(() => {
    persistPrefilled();
  }, [calculation?.comparables.length, prefilled]);
  /**
   * Changes one comparable from a cell of a table: shown at once, and sent
   * after any change still on its way, built on what the server answered last.
   */
  const changeComparable = (comparable: ComparableDto, change: (current: ComparableDto) => ComparableDto, options: { record?: boolean } = {}) => {
    if (readOnly) return;
    if (options.record !== false && calculation) history.record({ settings: calculation.settings, comparables: calculation.comparables }, `comparable:${comparable.id}`);
    setCalculation((current) => current
      ? { ...current, comparables: current.comparables.map((item) => (item.id === comparable.id ? change(item) : item)) }
      : current);
    comparableQueue.current = comparableQueue.current.then(async () => {
      const stored = latest.current?.comparables.find((item) => item.id === comparable.id);
      if (!stored) return;
      const ok = await run(() => api.market.updateComparable(valuationId, type, comparable.id, comparableFormValues(change(stored))));
      // A rejected change goes back to what is stored.
      if (!ok && latest.current) setCalculation(latest.current);
    });
  };

  // What an undo or a redo puts back: the settings as they were, and each comparable whose capture changed.
  useEffect(() => {
    restoreRef.current = (snapshot) => {
      if (!calculation) return;
      void saveSettings(snapshot.settings, { record: false });
      for (const target of changedComparables(calculation.comparables, snapshot.comparables)) {
        changeComparable(target, () => target, { record: false });
      }
    };
  });
  const snapshot = (): MarketSnapshot | null => (calculation ? { settings: calculation.settings, comparables: calculation.comparables } : null);

  const submitComparable = (current: ComparableDto | null) => async (values: ComparableFormValues, pending: PendingImages, mergeInto?: string) => {
    if (current) return run(() => api.market.updateComparable(valuationId, type, current.id, values), "Comparable guardado");
    const before = new Set(calculation?.comparables.map((item) => item.id) ?? []);
    return run(async () => {
      const created = await api.market.createComparable(valuationId, type, values, mergeInto);
      // The screenshot pasted before saving goes up once the comparable exists.
      const added = created.comparables.find((item) => !before.has(item.id));
      if (!pending.screenshot || !added) return created;
      try {
        return await api.market.uploadScreenshot(valuationId, type, added.id, pending.screenshot);
      } catch (error) {
        failed(error);
        return created;
      }
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
  const byReference = new Map(result?.homologation.comparables.map((row) => [row.id, row]) ?? []);
  const setDraftField = (key: keyof SettingsDraft) => (event: { target: { value: string } }) =>
    setDraft((current) => (current ? { ...current, [key]: event.target.value } : current));
  const editingComparable = editing === "nuevo" ? null : editing;
  const today = todayInMexico();
  const basis = homologationBasisOf(liveSettings);
  const againstBase = basis === "LOTE_TIPO";
  const fields = characteristicFieldsOf(liveSettings);
  // Factors rated from the catalog, whose subject rating is chosen once for all comparables.
  const ratedSlots = calculation.settings.factorSlots.filter((slot) =>
    !slot.key && !COMPUTED_FACTORS.has(slot.type) && !DIRECT_FACTORS.has(slot.type) && optionsFor(catalog, slot.type).length > 0);

  return (
    <section
      className="grid gap-5 rounded-lg border-2 border-dashed border-primary/30 bg-muted/20 p-3 sm:p-4"
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
        <p className="text-xs text-muted-foreground">
          Aquí capturas y se calcula; con estos datos se escriben las páginas del dictamen que ves abajo, fuera de este recuadro.
          {type === "TERRENO_VENTA" ? " El enfoque de costos toma el valor de este mercado de terrenos para el terreno." : null}
        </p>
      </header>

      {calculation.locked ? (
        <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p>
      ) : null}

      <Part number={1} title="Especificaciones" aside={savingSettings ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}>
        <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-4" onBlur={() => void saveSettings()}>
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
                    onChange={() => void saveSettings({ ...liveSettings, homologationBasis: value })}
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
              {!draft.baseArea ? <p className="text-xs text-amber-700 dark:text-amber-400">Sin lote tipo, el factor de superficie usa el sujeto.</p> : null}
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
              onChange={(surfacePower) => void saveSettings({ ...liveSettings, surfacePower })}
            />
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-4">
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
          onChange={(offer) => void saveSettings({ ...liveSettings, ...offer, offerLevel: null })}
        />
      </Part>

      <Part number={2} title="Comparables">
        <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly>
          <table className={cn(CALC_TABLE, "w-full min-w-[560px]")}>
            <thead className={CALC_HEAD}>
              <tr>
                <th className={CALC_HEAD_CELL}>Ref.</th>
                <th className={CALC_HEAD_CELL}>ID</th>
                <th className={CALC_HEAD_CELL}>Ubicación</th>
                <th className={CALC_HEAD_CELL}>Superficie</th>
                <th className={CALC_HEAD_CELL}>{labels.price}</th>
                <th className={CALC_HEAD_CELL}>${perUnit}</th>
                <th className={CALC_HEAD_CELL}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {comparables.map((comparable) => {
                const row = byReference.get(String(comparable.reference));
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
                  <tr key={comparable.id} className={CALC_ROW} data-comparable-row={formatComparableId(comparable.folio) ?? comparable.id}>
                    <td className="px-2 py-1.5">{comparable.reference}</td>
                    <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">
                      {formatComparableId(comparable.folio) ?? "—"}
                      <span className={cn("ml-1 font-sans", isVerifiedStatus(status) ? "text-emerald-700 dark:text-emerald-400" : status === "POR_REVISAR" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}>
                        · {REVIEW_STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="max-w-64 px-2 py-1.5" title={comparable.location}>
                      <span className="block truncate">
                        {comparable.location}
                        {comparable.photos.length ? <span className="ml-1 text-xs text-muted-foreground">({comparable.photos.length} fotos)</span> : null}
                      </span>
                      {warnings.length ? (
                        <span className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400" data-comparable-warnings title={warnings.map((warning) => warning.message).join("\n")}>
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                          <span className="truncate">{warnings.map((warning) => warning.message).join(" ")}</span>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{comparable.area === null ? "—" : characteristicNumberText(String(comparable.area), thousandsSeparator)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{comparable.price ? money(comparable.price) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row ? money(row.unitValue) : comparable.area && comparable.price ? money(comparable.price / comparable.area) : "—"}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <ComparableCardButton compact comparableId={comparable.id} label={`Ver ficha del comparable ${comparable.reference}`} />
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Editar comparable ${comparable.reference}`} onClick={() => setEditing(comparable)}>
                        <Pencil />
                      </Button>
                      {!readOnly ? (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Eliminar comparable ${comparable.reference}`}
                          onClick={() => {
                            if (window.confirm(`¿Eliminar el comparable ${comparable.reference}?`)) {
                              void run(() => api.market.deleteComparable(valuationId, type, comparable.id), "Comparable eliminado");
                            }
                          }}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!comparables.length ? (
                <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">Sin comparables todavía.</td></tr>
              ) : null}
            </tbody>
          </table>
        </CalcTableContextMenu>

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
                    onUse={(values, listingText) => { setPrefill({ values, listingText }); setEditing("nuevo"); }}
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
                  if (latest.current) latest.current = patch(latest.current);
                  setCalculation((current) => (current ? patch(current) : current));
                }}
              />
            ) : null}
          </div>
          {complete < MIN_COMPARABLES ? (
            <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5" /> El dictamen lleva al menos {MIN_COMPARABLES} comparables completos ({complete} de {MIN_COMPARABLES}).
            </span>
          ) : null}
        </div>

        {comparables.length ? (
          <h5 className="mt-2 border-t pt-3 text-sm font-semibold" data-characteristics-title="">2.1 Tabla de características de comparables</h5>
        ) : null}
        {comparables.length ? (
          <MarketCharacteristicsTable
            fields={fields}
            defaults={!liveSettings.characteristicFields}
            comparables={comparables}
            subject={liveSettings.subjectCharacteristics ?? {}}
            readOnly={readOnly}
            onFields={(characteristicFields) => void saveSettings({ ...liveSettings, characteristicFields })}
            onSubject={(subjectCharacteristics) => void saveSettings({ ...liveSettings, subjectCharacteristics })}
            onComparable={changeComparable}
          />
        ) : null}
      </Part>

      {/* After the comparables, as the appraiser asked (video of 27 Oct 2026); it prints only when its box is marked. */}
      <Part number={3} title="Monto adicional" collapsible={{ open: liveSettings.additionalAmount > 0 }}>
        <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-4" onBlur={() => void saveSettings()}>
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
                  void saveSettings({ ...liveSettings, additionalAmountInCalculation: inCalculation, ...(inCalculation ? {} : { showAdditionalAmount: false }) });
                }}
              />
              Cálculo
            </label>
            <label className="flex items-center gap-1.5">
              <Checkbox
                checked={printsAdditionalAmount(liveSettings)}
                disabled={readOnly || liveSettings.additionalAmountInCalculation === false}
                onCheckedChange={(checked) => void saveSettings({ ...liveSettings, showAdditionalAmount: checked === true })}
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
                onCheckedChange={(checked) => void saveSettings({ ...liveSettings, homologate: checked === true })}
              />
              Homologar
            </label>
            <label className="flex items-center gap-1.5">
              <Checkbox
                checked={homologatesOf(liveSettings) && liveSettings.showHomologationTable !== false}
                disabled={readOnly || !homologatesOf(liveSettings)}
                onCheckedChange={(checked) => void saveSettings({ ...liveSettings, showHomologationTable: checked === true })}
              />
              Mostrar en el dictamen
            </label>
          </span>
        )}
      >
        {!homologatesOf(liveSettings) ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-homologation-off="">
            Sin homologación: ningún factor se aplica. El promedio, la mediana y el rango del ±30 % salen de los valores unitarios de las ofertas tal como
            se capturaron, y el dictamen no imprime la tabla de homologación. Los factores capturados se conservan por si vuelves a homologar.
          </p>
        ) : null}
        {type === "TERRENO_RENTA" && homologatesOf(liveSettings) ? <p className="text-sm font-medium" data-same-factors="">{SAME_FACTORS_AS_LAND_SALE}</p> : null}
        <CalculationPrecisionControl
          valuationId={valuationId}
          precision={calculation.precision}
          readOnly={readOnly}
          onChanged={() => void api.market.get(valuationId, type).then(applyServerState).catch(failed)}
        />
        {homologatesOf(liveSettings) ? (<>
        <MarketFactorSlots
          slots={calculation.settings.factorSlots}
          customFactors={customFactors}
          readOnly={readOnly}
          saving={savingSettings}
          onChange={(factorSlots) => void saveSettings({ ...liveSettings, factorSlots })}
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
                    onChange={(event) => void saveSettings({
                      ...liveSettings,
                      factorSlots: liveSettings.factorSlots.map((item) =>
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
        <MarketHomologationTable
          comparables={comparables}
          slots={calculation.settings.factorSlots}
          result={result}
          catalog={catalog}
          readOnly={readOnly}
          unitValueLabel={`${labels.unitValue} $${perUnit}`}
          homologatedLabel={`Homologado $${perUnit}`}
          note={{ show: liveSettings.showHomologationNote !== false, text: liveSettings.homologationNote ?? null, defaultText: DEFAULT_HOMOLOGATION_NOTE }}
          onNote={(note) => void saveSettings({ ...liveSettings, ...note })}
          onFactors={changeComparable}
          onInvalid={(message) => toast.error(message)}
          decimals={factorDecimals(calculation.precision)}
          surfaceFormulas={surfaceFactorFormulas({ settings: liveSettings, comparables }, calculation.precision)}
          onRenameSlot={(slot, label) => void saveSettings({
            ...liveSettings,
            factorSlots: liveSettings.factorSlots.map((item) => (factorKey(item) === factorKey(slot) ? { ...item, label } : item)),
          })}
        />
        </>) : null}
        {homologatesOf(liveSettings) && liveSettings.showHomologationTable === false ? (
          <p className="text-xs text-muted-foreground" data-homologation-hidden="">
            La tabla de homologación no se imprime en el dictamen; los datos de los comparables, las estadísticas y el valor sí. La memoria de cálculo
            la conserva.
          </p>
        ) : null}
      </Part>

      <Part number={5} title="Resultados">
        <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-4" onBlur={() => void saveSettings()}>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="market-adopted">{labels.adopted}</FieldLabel>
            <FormulaInput
              id="market-adopted"
              grouping
              value={draft.adoptedUnitValue}
              placeholder={stats ? `Promedio: ${stats.mean.toFixed(2)}` : undefined}
              // Saved as typed: the field is always free to be retyped or cleared; only concluding waits for a value within the range.
              className={result?.adoptedOutsideLimits ? "border-destructive focus-visible:ring-destructive/30" : undefined}
              onChange={setDraftField("adoptedUnitValue")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="market-rounding">Redondeo del valor</FieldLabel>
            <RoundingSelect
              id="market-rounding"
              label="Redondeo del valor"
              value={liveSettings.rounding === undefined ? DEFAULT_ENGINE_CONFIG.rounding.market.comparativeValue : liveSettings.rounding}
              onChange={(rounding) => void saveSettings({ ...liveSettings, rounding })}
            />
          </Field>
        </fieldset>
        {result && stats ? (
          <div className="grid gap-2 rounded-md border bg-background p-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Estadísticas informativas: el promedio y la mediana son referencia para el valor que adoptas. Un valor fuera del rango permitido
              se guarda, pero el avalúo no se puede concluir mientras este mercado esté en el informe.
            </p>
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Promedio homologado</dt><dd className="tabular-nums">{money(stats.mean)} {perUnit}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Mediana homologada</dt><dd className="tabular-nums">{money(stats.median)} {perUnit}</dd></div>
              <div>
                <dt className="text-xs text-muted-foreground">Dispersión inicial (máx. ÷ mín. de las ofertas)</dt>
                <dd className="tabular-nums" data-dispersion="inicial">{stats.initialDispersion.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Dispersión final (máx. ÷ mín. homologados)</dt>
                <dd className={cn("tabular-nums", stats.dispersion > 1.25 && "text-amber-700 dark:text-amber-400")} data-dispersion="final">
                  {stats.dispersion.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{labels.unitValue} de oferta (mín.–máx.)</dt>
                <dd className="tabular-nums">{money(stats.offerMin)} – {money(stats.offerMax)} {perUnit}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Valores homologados (mín.–máx.)</dt>
                <dd className="tabular-nums">{money(stats.min)} – {money(stats.max)} {perUnit}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Rango permitido para el valor adoptado (±30 % del promedio y la mediana)</dt>
                <dd className="tabular-nums">{money(result.adoptedLimits.min)} – {money(result.adoptedLimits.max)}</dd>
              </div>
              <div><dt className="text-xs text-muted-foreground">Adoptado</dt><dd className="tabular-nums">{money(result.adoptedUnitValue)} {perUnit}</dd></div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">{labels.value}</dt>
                <dd className="text-base font-semibold tabular-nums">{money(result.value)}</dd>
              </div>
            </dl>
            {result.adoptedOutsideLimits ? (
              <p role="alert" className="flex items-center gap-1 text-sm font-medium text-destructive" data-adopted-outside="">
                <AlertTriangle className="size-3.5 shrink-0" /> {ADOPTED_VALUE_OUTSIDE_MESSAGE}
              </p>
            ) : null}
            <PrintedStatisticsControl
              value={printedStatisticsOf(liveSettings)}
              readOnly={readOnly}
              onChange={(printedStatistics) => void saveSettings({ ...liveSettings, printedStatistics })}
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
              onCheckedChange={(checked) => void saveSettings({ ...liveSettings, showFactorJustification: checked === true })}
            />
            Mostrar en el dictamen
          </label>
        )}
      >
        <fieldset disabled={readOnly} className="grid gap-3" onBlur={() => void saveSettings()}>
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

      {editing ? (
        <ComparableDialog
          key={editingComparable?.id ?? "nuevo"}
          open
          onOpenChange={(open) => { if (!open) { setEditing(null); setPrefill(null); } }}
          prefill={prefill?.values}
          listingText={prefill?.listingText}
          comparable={editingComparable ? comparables.find((item) => item.id === editingComparable.id) ?? editingComparable : null}
          characteristicFields={fields}
          comparableType={type}
          unitLabel={priceLabel}
          readOnly={readOnly}
          onSubmit={submitComparable(editingComparable)}
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
          attributeNames={[...new Set(comparables.flatMap((item) => (item.attributes ?? []).map((attribute) => attribute.name)))]}
        />
      ) : null}
    </section>
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
