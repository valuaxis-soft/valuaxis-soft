"use client";

import { AlertTriangle, Calculator, FileDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { api, SessionExpiredError, type ComparableFormValues } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { CALC_HEAD, CALC_HEAD_CELL, CALC_ROW, CALC_TABLE, CALC_TABLE_FRAME } from "./calculation-table-style";
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
  homologationBasisOf,
  isComparableComplete,
  isRentComparableType,
  marketEngineConfig,
  offerLabelsOf,
  offerMarkOf,
  toMarketEngineInput,
  type ComparableDto,
  type ComparableType,
  type HomologationBasis,
  type MarketCalculationDto,
  type MarketSettingsDto,
} from "@/features/valuations/calculation/market-types";
import { DEFAULT_HOMOLOGATION_NOTE, defaultOfferIntro } from "@/features/valuations/calculation/market-document";
import {
  COMPUTED_FACTORS,
  DIRECT_FACTORS,
  EMPTY_FACTOR_CATALOG,
  optionsFor,
  type FactorCatalog,
} from "@/features/valuations/calculation/factor-catalog";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { collectFormulas, withFormulaTexts } from "@/features/valuations/calculation/captured-formulas";
import { FormulaInput } from "./formula-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatComparableId, todayInMexico } from "@/features/valuations/calculation/comparable-card";
import { REVIEW_STATUS_LABELS, comparableWarnings } from "@/features/valuations/calculation/comparable-review";
import { ComparableCardButton } from "./comparable-card-dialog";
import { ComparableDialog, type PendingImages } from "./comparable-dialog";
import { ComparableReviewDialog } from "./comparable-review-dialog";
import { RoundingSelect, SurfacePowerSelect } from "./calculation-controls";
import { ImportComparablesDialog } from "./import-comparables-dialog";
import { MarketCharacteristicsTable } from "./market-characteristics-table";
import { MarketFactorSlots } from "./market-factor-slots";
import { MarketHomologationTable } from "./market-homologation-table";
import { MarketOfferLevel } from "./market-offer-level";
import { MarketRegression } from "./market-regression";
import { PasteListingDialog } from "./paste-listing-dialog";
import { SearchComparablesDialog } from "./search-comparables-dialog";
import { useSerializedSave } from "./use-serialized-save";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const text = (value: number | null) => (value === null ? "" : String(value));

function compute(calculation: Pick<MarketCalculationDto, "settings" | "comparables">):
  { result: MarketApproachResult | null; reason: string | null } {
  const input = toMarketEngineInput(calculation);
  if (!input.ok) return { result: null, reason: input.reason };
  return { result: computeMarketApproach(input.input, marketEngineConfig(calculation.settings)), reason: null };
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
  /** Suggested subject area (terreno section) while none is captured. */
  suggestedSubjectArea: number | null;
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

  return (
    <div className="grid gap-2">
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
      <MarketTypePanel key={type} {...props} type={type} />
    </div>
  );
}

/** A numbered part of the specifications, in the order of the appraiser's format. */
function Part(props: { number: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-2" aria-label={props.title}>
      <h4 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold">
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
  suggestedSubjectArea: number | null;
  onCalculation: (calculation: MarketCalculationDto, result: MarketApproachResult | null) => void;
}) {
  const { valuationId, type } = props;
  const labels = MARKET_LABELS[type];
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
  // What the server last answered, for the changes of a comparable made one after another.
  const latest = useRef<MarketCalculationDto | null>(null);
  const comparableQueue = useRef<Promise<unknown>>(Promise.resolve());

  // The firm's own factor catalog and factors, if it keeps them; without a catalog every factor is typed.
  useEffect(() => {
    let active = true;
    api.firm.factors()
      .then((next) => { if (active) setCatalog(next.catalog); })
      .catch(() => undefined);
    api.firm.customFactors()
      .then((next) => { if (active) setCustomFactors(next.factors); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const readOnly = props.readOnly || Boolean(calculation?.locked);

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

  const liveSettings = calculation && draft ? settingsFrom(calculation.settings, draft) : null;
  // Recomputed on every render: a handful of comparables, and it follows every keystroke.
  const live = calculation && liveSettings ? compute({ settings: liveSettings, comparables: calculation.comparables }) : null;

  // The settings last asked to be saved, until the server has them: a change made right after another builds on it.
  const requested = useRef<MarketSettingsDto | null>(null);
  const enqueueSettings = useSerializedSave(async (settings: MarketSettingsDto) => {
    setSavingSettings(true);
    await run(() => api.market.saveSettings(valuationId, settings));
    if (requested.current === settings) requested.current = null;
    setSavingSettings(false);
  });
  const saveSettings = async (settings = liveSettings) => {
    if (!calculation || !settings || readOnly) return;
    if (JSON.stringify(settings) === JSON.stringify(calculation.settings)) return;
    requested.current = settings;
    await enqueueSettings(settings);
  };
  /** One change on top of any still on its way (a cell left by clicking a checkbox sends both). */
  const saveChange = (change: (current: MarketSettingsDto) => Partial<MarketSettingsDto>) => {
    if (!calculation || !draft) return;
    const current = settingsFrom(requested.current ?? calculation.settings, draft);
    void saveSettings({ ...current, ...change(current) });
  };

  /**
   * Changes one comparable from a cell of a table: shown at once, and sent
   * after any change still on its way, built on what the server answered last.
   */
  const changeComparable = (comparable: ComparableDto, change: (current: ComparableDto) => ComparableDto) => {
    if (readOnly) return;
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
    >
      <header className="grid gap-0.5">
        <h3 id="market-calculation-title" className="flex items-center gap-2 text-base font-semibold">
          <Calculator className="size-4" /> {labels.title} · {COMPARABLE_TYPE_LABELS[type]}
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
              value={draft.subjectArea}
              placeholder={props.suggestedSubjectArea ? String(props.suggestedSubjectArea) : undefined}
              onChange={setDraftField("subjectArea")}
            />
            {!draft.subjectArea && props.suggestedSubjectArea && type === "TERRENO_VENTA" ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto justify-start px-0"
                onClick={() => void saveSettings({ ...liveSettings, subjectArea: props.suggestedSubjectArea })}
              >
                Usar {props.suggestedSubjectArea} m² del terreno
              </Button>
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
              <FormulaInput id="market-base-area" value={draft.baseArea} onChange={setDraftField("baseArea")} />
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
        <div className={CALC_TABLE_FRAME}>
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
                  { type, subjectArea: liveSettings.subjectArea, today },
                );
                const status = comparable.review?.status ?? "POR_REVISAR";
                return (
                  <tr key={comparable.id} className={CALC_ROW} data-comparable-row={formatComparableId(comparable.folio) ?? comparable.id}>
                    <td className="px-2 py-1.5">{comparable.reference}</td>
                    <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">
                      {formatComparableId(comparable.folio) ?? "—"}
                      <span className={cn("ml-1 font-sans", status === "VERIFICADO" ? "text-emerald-700 dark:text-emerald-400" : status === "POR_REVISAR" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}>
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
                    <td className="px-2 py-1.5 text-right tabular-nums">{comparable.area ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{comparable.price ? money(comparable.price) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row ? money(row.unitValue) : "—"}</td>
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
        </div>

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
            <SearchComparablesDialog key={type} valuationId={valuationId} type={type} readOnly={readOnly} onAdded={applyServerState} />
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

      <Part number={3} title="Homologación">
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
        />
      </Part>

      <Part number={4} title="Resultados">
        <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-4" onBlur={() => void saveSettings()}>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="market-adopted">{labels.adopted}</FieldLabel>
            <FormulaInput
              id="market-adopted"
              value={draft.adoptedUnitValue}
              placeholder={stats ? `Promedio: ${stats.mean.toFixed(2)}` : undefined}
              // A warning, never a lock: the field is always free to be retyped or cleared.
              className={result?.adoptedOutsideLimits ? "border-amber-500 focus-visible:ring-amber-500/30" : undefined}
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
              Estadísticas informativas: el promedio y la mediana son referencia para el valor que adoptas; el rango permitido solo avisa de
              un posible error de captura (como 130,000 por 13,000) y no impide guardar.
            </p>
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Promedio homologado</dt><dd className="tabular-nums">{money(stats.mean)} {perUnit}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Mediana homologada</dt><dd className="tabular-nums">{money(stats.median)} {perUnit}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Dispersión (máx. ÷ mín.)</dt><dd className="tabular-nums">{stats.dispersion.toFixed(2)}</dd></div>
              <div>
                <dt className="text-xs text-muted-foreground">Rango de valores homologados (mín.–máx.)</dt>
                <dd className="tabular-nums">{money(stats.min)} – {money(stats.max)}</dd>
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
              <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-3.5 shrink-0" /> El valor adoptado sale del rango permitido (±30 % del promedio y la mediana): revisa que no
                sea un error de captura. Se guarda como lo capturaste.
              </p>
            ) : null}
          </div>
        ) : live?.reason ? (
          <p className="text-sm text-muted-foreground">{live.reason}</p>
        ) : null}
      </Part>

      <Part number={5} title="Homologación por el método de regresión lineal">
        <MarketRegression
          calculation={{ settings: liveSettings, comparables }}
          stats={stats ?? null}
          readOnly={readOnly}
          onChange={saveChange}
          onExclude={(comparable, regressionExcluded) => changeComparable(comparable, (current) => ({ ...current, regressionExcluded }))}
        />
      </Part>

      <Part number={6} title="Monto adicional">
        <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-4" onBlur={() => void saveSettings()}>
          <Field>
            <FieldLabel htmlFor="market-additional">Monto adicional a considerar ($)</FieldLabel>
            <FormulaInput id="market-additional" value={draft.additionalAmount} placeholder="0" onChange={setDraftField("additionalAmount")} />
          </Field>
        </fieldset>
      </Part>

      <Part
        number={7}
        title="Justificación de los factores utilizados"
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
          onUploadScreenshot={async (file) => {
            if (editingComparable) await run(() => api.market.uploadScreenshot(valuationId, type, editingComparable.id, file), "Pantalla de referencia guardada");
          }}
          onRemoveScreenshot={async () => {
            if (editingComparable) await run(() => api.market.deleteScreenshot(valuationId, type, editingComparable.id));
          }}
          onCheckDuplicates={(probe) => api.market.duplicates(valuationId, probe)}
          onReuse={(comparableId) => run(() => api.market.reuseComparable(valuationId, type, comparableId), "Comparable existente agregado. Califica sus factores.")}
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
