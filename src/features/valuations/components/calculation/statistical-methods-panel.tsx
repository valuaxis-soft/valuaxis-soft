"use client";

import { AlertTriangle, BarChart3, Download, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api, SessionExpiredError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { factorDecimals } from "@/features/valuations/calculation/calculation-precision";
import {
  COMPARABLE_TYPE_LABELS,
  SALE_COMPARABLE_TYPES,
  characteristicFieldsOf,
  isRentComparableType,
  type ComparableType,
  type MarketCalculationDto,
} from "@/features/valuations/calculation/market-types";
import { COEFFICIENTS_NOTE, NO_CONTRIBUTION_NOTE, STATISTICAL_VALUE_NOTE, methodComparison, regressionEquation } from "@/features/valuations/calculation/statistical-document";
import {
  DEFAULT_GOAL_TITLE,
  DEFAULT_REGRESSION_TITLE,
  computeStatisticalGoal,
  computeStatisticalRegression,
  renumbered,
  withFoundComparables,
  withMarketComparables,
  type StatisticalCalculationDto,
  type GoalExtraTable,
  type RegressionExtraTable,
  type StatisticalDependent,
  type StatisticalMethodSettings,
} from "@/features/valuations/calculation/statistical-types";
import { ConfigSwitch } from "@/features/valuations/components/editor/editor-config-panel";
import type { ComparableSearchHit } from "@/features/valuations/comparable-search/types";
import { goalProgrammingWarnings } from "@/features/valuations/engine/goal-programming";
import { RECOMMENDED_REGRESSION_COMPARABLES, minimumRegressionComparables, sampleSizeRecommendation } from "@/features/valuations/engine/regression";
import { CALC_HEAD, CALC_HEAD_CELL, CALC_ROW, CALC_SECTION_HEADING, CALC_TABLE, CALC_TABLE_FRAME } from "./calculation-table-style";
import { CalcTableContextMenu } from "./calc-table-context-menu";
import { SearchComparablesDialog } from "./search-comparables-dialog";
import { StatisticalDataTable, type SubjectSource } from "./statistical-data-table";
import { StatisticalVariables } from "./statistical-variables";
import { useSerializedSave } from "./use-serialized-save";
import { useConfirmDelete } from "@/features/valuations/components/editor/delete-confirm";

type Draft = Pick<StatisticalCalculationDto, "settings" | "comparables">;

const money = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-MX", { style: "currency", currency: "MXN" }));
const figure = (value: number | null, digits: number) =>
  (value === null ? "—" : value.toLocaleString("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const significant = (value: number) => value.toLocaleString("es-MX", { maximumSignificantDigits: 8 });
const draftOf = (calculation: StatisticalCalculationDto): Draft => ({ settings: calculation.settings, comparables: calculation.comparables });
const newId = () => globalThis.crypto.randomUUID();

/**
 * "Métodos estadísticos" of a section's markets (sale or rent), one tab per
 * comparable type: the regression and the goal programming with comparables
 * of their own, apart from the market approach above it.
 */
export function StatisticalMethodsPanel(props: {
  valuationId: string;
  types?: ComparableType[];
  readOnly: boolean;
  onCalculation: (calculation: StatisticalCalculationDto) => void;
}) {
  const { valuationId } = props;
  const types = props.types ?? SALE_COMPARABLE_TYPES;
  const typesKey = types.join(",");
  const [type, setType] = useState<ComparableType | null>(null);
  const [shown, setShown] = useState<ReadonlySet<ComparableType>>(new Set());

  // A type with stored methods, or a regression the market kept before, has its tab from the start.
  useEffect(() => {
    let active = true;
    const all = typesKey.split(",") as ComparableType[];
    void Promise.all(all.map((item) => api.statistical.get(valuationId, item)
      .then((calculation) => ((calculation.configured || calculation.fromMarket) && !calculation.settings.removed ? item : null))
      .catch(() => null)))
      .then((found) => {
        if (!active) return;
        const present = found.filter((item): item is ComparableType => item !== null);
        setShown((current) => new Set([...current, ...present]));
        setType((current) => current ?? present[0] ?? null);
      });
    return () => { active = false; };
  }, [typesKey, valuationId]);

  const visible = types.filter((item) => shown.has(item));
  const missing = types.filter((item) => !shown.has(item));
  // "Quitar este cálculo": the tab goes, the capture is kept (undo, or adding the type again, brings it back).
  const removed = (item: ComparableType) => {
    setShown((current) => new Set([...current].filter((kept) => kept !== item)));
    setType((current) => (current === item ? visible.find((other) => other !== item) ?? null : current));
  };
  const restored = (item: ComparableType) => {
    setShown((current) => new Set([...current, item]));
    setType(item);
  };

  return (
    <section
      className="grid gap-3 rounded-lg border-2 border-dashed border-chart-4/40 bg-muted/20 p-3 sm:p-4"
      aria-labelledby="statistical-methods-title"
    >
      <header className="grid gap-1">
        <h3 id="statistical-methods-title" className="flex items-center gap-2 font-display text-lg font-semibold">
          <BarChart3 className="size-5" /> Métodos alternativos para estimación de valor
        </h3>
        <p className="text-xs text-muted-foreground">
          Regresión lineal múltiple y programación por metas, con comparables propios. Son una referencia: no cambian el valor del enfoque de mercado
          ni la conclusión. Se imprimen en el dictamen, después del mercado, con «Agregar al informe valuatorio» y «Mostrar en el dictamen» de cada método.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        {visible.length ? (
          <div role="tablist" aria-label="Métodos alternativos por tipo de comparable" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {visible.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={item === type}
                className={cn("rounded-md px-3 py-1 text-sm font-medium", item === type ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                onClick={() => setType(item)}
              >
                {COMPARABLE_TYPE_LABELS[item]}
              </button>
            ))}
          </div>
        ) : null}
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
            <Plus data-icon="inline-start" /> {COMPARABLE_TYPE_LABELS[item]}
          </Button>
        )) : null}
        {!visible.length && props.readOnly ? <span className="text-xs text-muted-foreground">Sin métodos alternativos capturados.</span> : null}
      </div>
      {type ? <StatisticalTypePanel key={type} {...props} type={type} onRemoved={removed} onRestored={restored} /> : null}
    </section>
  );
}

function Part(props: { number: number; title: string; aside?: ReactNode; children: ReactNode }) {
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

/** "Calcular", "Mostrar en el dictamen" and the title of a method's apartado. */
function MethodControls(props: {
  label: string;
  method: StatisticalMethodSettings;
  defaultTitle: string;
  readOnly: boolean;
  onChange: (patch: Partial<StatisticalMethodSettings>) => void;
}) {
  const { method, readOnly } = props;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <label className="flex items-center gap-1.5">
        <Checkbox checked={method.enabled} disabled={readOnly} onCheckedChange={(checked) => props.onChange({ enabled: checked === true })} />
        {props.label}
      </label>
      <label className="flex items-center gap-1.5 text-xs">
        <Checkbox
          checked={method.showInDictamen}
          disabled={readOnly || !method.enabled}
          onCheckedChange={(checked) => props.onChange({ showInDictamen: checked === true })}
        />
        Mostrar en el dictamen
      </label>
      {method.enabled ? (
        <label className="flex min-w-72 flex-1 items-center gap-1.5 text-xs">
          Título
          <input
            key={method.title ?? ""}
            aria-label={`Título de ${props.label}`}
            className="h-7 flex-1 rounded-md border bg-background px-2 text-xs"
            disabled={readOnly}
            defaultValue={method.title ?? ""}
            placeholder={props.defaultTitle}
            onBlur={(event) => {
              const title = event.target.value.trim() || null;
              if (title !== (method.title ?? null)) props.onChange({ title });
            }}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          />
        </label>
      ) : null}
    </div>
  );
}

/** Item 6 of 27 Oct: marked to print but not computable, the appraiser is told, never silently left out. */
function NotPrintedWarning({ reason }: { reason: string }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 rounded-md border border-highlight/50 bg-highlight/10 p-2 text-xs text-foreground">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>Marcaste «Mostrar en el dictamen», pero no se imprimirá hasta que se resuelva: {reason}</span>
    </p>
  );
}

function StatisticalTypePanel(props: {
  valuationId: string;
  type: ComparableType;
  readOnly: boolean;
  onCalculation: (calculation: StatisticalCalculationDto) => void;
  /** "Quitar este cálculo" took the type away; «Deshacer» brought it back. */
  onRemoved: (type: ComparableType) => void;
  onRestored: (type: ComparableType) => void;
}) {
  const { valuationId, type } = props;
  const rent = isRentComparableType(type);
  const unit = rent ? "$/m²/mes" : "$/m²";
  const [calculation, setCalculation] = useState<StatisticalCalculationDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [market, setMarket] = useState<MarketCalculationDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The last draft sent: a server answer to an older one does not replace what was typed after it.
  const latestDraft = useRef<Draft | null>(null);
  // Set once the save is defined; a reader never restores (the save checks it too).
  const restoreRemoved = useRef<(next: StatisticalCalculationDto) => void>(() => undefined);

  useEffect(() => {
    let active = true;
    api.statistical.get(valuationId, type)
      .then((next) => {
        if (!active) return;
        setCalculation(next);
        setDraft(draftOf(next));
        latestDraft.current = draftOf(next);
        // A type taken away and added again (or brought back with «Deshacer») comes back with its capture.
        if (next.settings.removed && !next.locked) restoreRemoved.current(next);
      })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "No se pudieron cargar los métodos alternativos."); });
    // The market of the same type: the subject's data for "=", and its comparables to import.
    api.market.get(valuationId, type).then((next) => { if (active) setMarket(next); }).catch(() => undefined);
    return () => { active = false; };
  }, [type, valuationId]);

  const readOnly = props.readOnly || Boolean(calculation?.locked);
  const confirmDelete = useConfirmDelete();
  // What «Importar del enfoque de mercado» would add, asked in the app's dialog before it happens.
  const [importQuestion, setImportQuestion] = useState<string[] | null>(null);

  const reportCalculation = useEffectEvent((next: StatisticalCalculationDto) => {
    if (!props.readOnly && !next.locked) props.onCalculation(next);
  });
  // The dictamen follows what the server stored.
  useEffect(() => {
    if (calculation) reportCalculation(calculation);
  }, [calculation]);

  const enqueue = useSerializedSave(async (sent: Draft) => {
    setSaving(true);
    try {
      const next = await api.statistical.save(valuationId, sent);
      setCalculation(next);
      // Only the answer to the last draft replaces it: a change typed meanwhile stays.
      if (latestDraft.current === sent) setDraft(draftOf(next));
    } catch (error) {
      toast.error(error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  });
  const update = (change: (current: Draft) => Draft) => {
    if (readOnly || !latestDraft.current) return;
    const next = change(latestDraft.current);
    latestDraft.current = next;
    setDraft(next);
    void enqueue(next);
  };
  useEffect(() => {
    restoreRemoved.current = (next) => {
      if (props.readOnly) return;
      const sent = { settings: { ...next.settings, removed: false }, comparables: next.comparables };
      latestDraft.current = sent;
      setDraft(sent);
      void enqueue(sent);
    };
  });
  // Saved before the tab goes, so «Deshacer» reads it back from the server.
  const removeCalculation = () => confirmDelete({
    title: `¿Quitar los métodos alternativos de ${COMPARABLE_TYPE_LABELS[type].toLowerCase()}?`,
    description: "Se quita la pestaña y sus páginas del dictamen; lo capturado se conserva. Puedes deshacerlo con «Deshacer» en el aviso que aparece, "
      + "o volver a agregar el tipo con su botón.",
    confirmLabel: "Quitar este cálculo",
    onConfirm: () => {
      const current = latestDraft.current;
      if (!current || readOnly) return;
      void (async () => {
        try {
          const next = await api.statistical.save(valuationId, { ...current, settings: { ...current.settings, removed: true } });
          props.onCalculation(next);
          props.onRemoved(type);
          toast.success("Métodos alternativos quitados.", {
            duration: 15000,
            action: { label: "Deshacer", onClick: () => props.onRestored(type) },
          });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "No se pudo quitar el cálculo.");
        }
      })();
    },
  });

  if (loadError) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  if (!calculation || !draft) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando los métodos alternativos…
      </div>
    );
  }

  const { settings, comparables } = draft;
  const live = { ...draft, goal: calculation.goal, market: calculation.market, precision: calculation.precision, locked: calculation.locked, configured: calculation.configured, fromMarket: calculation.fromMarket };
  const regression = computeStatisticalRegression(draft);
  const goal = computeStatisticalGoal(live);
  const decimals = factorDecimals(calculation.precision);
  const included = comparables.filter((comparable) => !comparable.excluded).length;
  const k = settings.variables.length;
  const priceLabel = rent ? "Renta mensual ($)" : "Precio de oferta ($)";
  const marketSubject: SubjectSource[] = market ? [
    ...(market.settings.subjectArea ? [{ label: `${characteristicFieldsOf(market.settings).find((field) => field.key === "area")?.label ?? "SUPERFICIE"} (sujeto)`, value: String(market.settings.subjectArea) }] : []),
    ...characteristicFieldsOf(market.settings).flatMap((field) => {
      const value = market.settings.subjectCharacteristics?.[field.key]?.trim();
      return value && field.key !== "area" ? [{ label: `${field.label} (sujeto)`, value }] : [];
    }),
  ] : [];
  const setMethod = (method: "regression" | "goal", patch: Partial<StatisticalMethodSettings>) =>
    update((current) => ({ ...current, settings: { ...current.settings, [method]: { ...current.settings[method], ...patch } } }));
  const importMarket = () => {
    if (!market?.comparables.length) {
      toast.info("El enfoque de mercado de este tipo no tiene comparables.");
      return;
    }
    // What the import would add, told before it happens: the comparables and the characteristics the market brings.
    const preview = withMarketComparables(draft, market, () => "preview");
    const newFields = preview.settings.fields.slice(draft.settings.fields.length).map((field) => field.label);
    if (!preview.imported && !newFields.length) {
      toast.info("Los comparables y las características del mercado ya estaban importados.");
      return;
    }
    const lines = [
      `Se agregarán ${preview.imported} comparables del enfoque de mercado (quedarán ${draft.comparables.length + preview.imported}).`,
      newFields.length ? `Se agregarán ${newFields.length} características: ${newFields.join(", ")}.` : "No se agregan características nuevas.",
      "Los comparables que ya estaban importados no se repiten.",
    ];
    setImportQuestion(lines);
  };
  const confirmImport = () => {
    setImportQuestion(null);
    if (!market) return;
    let imported = 0;
    update((current) => {
      const next = withMarketComparables(current, market, newId);
      imported = next.imported;
      return { settings: next.settings, comparables: next.comparables };
    });
    toast.success(imported ? `Se importaron ${imported} comparables del enfoque de mercado.` : "Los comparables del mercado ya estaban importados.");
  };
  const addFound = (found: ComparableSearchHit[]) => {
    let added = 0;
    update((current) => {
      const next = withFoundComparables(current, found, newId);
      added = next.added;
      return { settings: next.settings, comparables: next.comparables };
    });
    toast.success(added ? `Se agregaron ${added} comparables a este análisis.` : "Esos comparables ya estaban en este análisis.");
  };
  const fitted = regression?.ok ? new Map(regression.result.fit.residuals.map((row) => [row.id, row])) : null;
  const comparison = methodComparison(live);

  return (
    <div className="grid gap-5" data-comparable-type={type}>
      <AlertDialog open={importQuestion !== null} onOpenChange={(open) => { if (!open) setImportQuestion(null); }}>
        <AlertDialogContent size="sm" data-import-confirm="">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Importar del enfoque de mercado?</AlertDialogTitle>
            <AlertDialogDescription className="grid gap-1">
              {(importQuestion ?? []).map((line) => <span key={line}>{line}</span>)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={confirmImport}>Importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-background p-3">
        <h4 className="font-display text-base font-semibold">{COMPARABLE_TYPE_LABELS[type]}</h4>
        <div className="flex flex-wrap items-start gap-3">
          <ConfigSwitch
            checked={!settings.excludedFromReport}
            disabled={readOnly}
            label="Agregar al informe valuatorio"
            description={settings.excludedFromReport
              ? "No se imprime nada de este tipo de comparable; lo capturado se conserva."
              : "Se imprimen los métodos marcados con «Mostrar en el dictamen»."}
            onCheckedChange={(included) => update((current) => ({ ...current, settings: { ...current.settings, excludedFromReport: !included } }))}
          />
          {!readOnly ? (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={removeCalculation}>
              <Trash2 data-icon="inline-start" /> Quitar este cálculo
            </Button>
          ) : null}
        </div>
      </div>
      {calculation.locked ? <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p> : null}
      {calculation.fromMarket ? (
        <p className="rounded-md border border-primary/25 bg-primary/5 p-2 text-xs text-foreground dark:bg-primary/10">
          Esta regresión se capturó dentro del enfoque de mercado, antes de que los métodos alternativos fueran un apartado propio. Se lee de ahí con los
          comparables del mercado; al primer cambio que hagas aquí se guarda una copia propia y el mercado queda como estaba.
        </p>
      ) : null}

      <Part
        number={1}
        title="Comparables y características"
        aside={(
          <span className="flex items-center gap-2 text-xs font-normal">
            {saving ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
            {!readOnly ? (
              <Button type="button" size="sm" variant="outline" onClick={importMarket} disabled={!market}>
                <Download data-icon="inline-start" /> Importar del enfoque de mercado
              </Button>
            ) : null}
            {!readOnly ? (
              <SearchComparablesDialog
                valuationId={valuationId}
                type={type}
                readOnly={readOnly}
                label="Agregar de mis comparables"
                description={
                  "Busca entre los comparables que ya capturaste en otros avalúos (la base de tu despacho) por zona, colonia, municipio, calle o ID "
                  + "(C-00123), o con los filtros. Los elegidos se copian a esta tabla con su precio, superficie y características; no se agregan al "
                  + "enfoque de mercado."
                }
                onChoose={addFound}
              />
            ) : null}
          </span>
        )}
      >
        <StatisticalDataTable
          calculation={draft}
          readOnly={readOnly}
          priceLabel={priceLabel}
          subjectSources={marketSubject}
          onFields={(fields) => update((current) => ({
            ...current,
            settings: {
              ...current.settings,
              fields,
              // A criterion whose characteristic is removed goes with it.
              variables: current.settings.variables.filter((variable) => fields.some((field) => field.key === variable.key)),
            },
          }))}
          onSubject={(key, text) => update((current) => {
            const { [key]: _previous, ...rest } = current.settings.subject;
            return { ...current, settings: { ...current.settings, subject: text.trim() ? { ...rest, [key]: text.trim() } : rest } };
          })}
          onComparable={(id, change) => update((current) => ({ ...current, comparables: current.comparables.map((item) => (item.id === id ? change(item) : item)) }))}
          onAdd={() => update((current) => ({
            ...current,
            comparables: [...current.comparables, { id: newId(), reference: current.comparables.length + 1, price: null, values: {} }],
          }))}
          onRemove={(id) => update((current) => ({ ...current, comparables: renumbered(current.comparables.filter((item) => item.id !== id)) }))}
        />
        <p className="text-xs text-muted-foreground">Entran {included} de {comparables.length} comparables.</p>
      </Part>

      <Part number={2} title="Criterios (variables), codificación y escalas">
        <StatisticalVariables draft={draft} readOnly={readOnly} onUpdate={update} />
      </Part>

      <Part number={3} title="Regresión lineal múltiple (RLM)">
        <MethodControls label="Calcular por regresión lineal múltiple" method={settings.regression} defaultTitle={DEFAULT_REGRESSION_TITLE} readOnly={readOnly} onChange={(patch) => setMethod("regression", patch)} />
        {/* Video 5.4, 14:54: «Mostrar en el dictamen» of the regression is only the regression's; the goal programming has its own. */}
        {!settings.regression.showInDictamen && settings.goal.enabled && settings.goal.showInDictamen && !settings.excludedFromReport ? (
          <p className="rounded-md border border-primary/25 bg-primary/5 p-2 text-xs text-foreground dark:bg-primary/10" data-goal-still-printed="">
            La regresión no se imprime, pero el bloque de métodos alternativos sigue en el dictamen por la programación por metas (su «Mostrar en el
            dictamen» está marcado, abajo). Para quitar todo el bloque, apaga «Agregar al informe valuatorio» arriba.
          </p>
        ) : null}
        {settings.regression.enabled ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5">
                Variable dependiente (Y)
                <NativeSelect
                  className="h-7 text-xs"
                  disabled={readOnly}
                  value={settings.dependent}
                  onChange={(event) => update((current) => ({ ...current, settings: { ...current.settings, dependent: event.target.value as StatisticalDependent } }))}
                >
                  <NativeSelectOption value="PRICE">{rent ? "Renta mensual" : "Precio total de oferta"} ($)</NativeSelectOption>
                  <NativeSelectOption value="UNIT_VALUE">Valor unitario ({unit})</NativeSelectOption>
                </NativeSelect>
              </label>
              <label className="flex items-center gap-1.5">
                <Checkbox
                  checked={settings.regression.showResidual === true}
                  disabled={readOnly}
                  onCheckedChange={(checked) => setMethod("regression", { showResidual: checked === true } as Partial<StatisticalMethodSettings>)}
                />
                Mostrar la columna «Residuo»
              </label>
              <span className="text-muted-foreground">Necesita al menos {minimumRegressionComparables(Math.max(k, 1))} comparables (criterios + 2).</span>
            </div>
            <ExtraTablesControl
              label="Imprimir también en el dictamen"
              options={REGRESSION_TABLE_LABELS}
              value={settings.regression.printedTables}
              disabled={readOnly || !settings.regression.showInDictamen}
              onChange={(printedTables) => setMethod("regression", { printedTables } as Partial<StatisticalMethodSettings>)}
            />
            {regression?.ok ? (
              <div className="grid gap-3 rounded-md border bg-background p-3 text-sm" aria-label="Resultado de la regresión lineal">
                <p className="text-xs"><span className="font-medium">Ecuación de regresión lineal:</span> <span className="font-mono">{regressionEquation(regression.result.fit)}</span></p>
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-5">
                  <div><dt className="text-xs text-muted-foreground">R (correlación múltiple)</dt><dd className="tabular-nums">{figure(regression.result.fit.multipleR, decimals)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">R²</dt><dd className="tabular-nums">{figure(regression.result.fit.rSquared, decimals)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">R² ajustado</dt><dd className="tabular-nums">{figure(regression.result.fit.adjustedRSquared, decimals)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Error típico</dt><dd className="tabular-nums">{figure(regression.result.fit.standardError, decimals)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Observaciones</dt><dd className="tabular-nums">{regression.result.fit.n}</dd></div>
                </dl>
                {regression.result.fit.anova ? (
                  <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly={true}>
                    <table className={cn(CALC_TABLE, "w-full")} aria-label="Análisis de varianza">
                      <thead className={CALC_HEAD}>
                        <tr>
                          {["Análisis de varianza", "Grados de libertad", "Suma de cuadrados", "Promedio de los cuadrados", "F", "Valor crítico de F"].map((name) => (
                            <th key={name} className={cn(CALC_HEAD_CELL, "text-left")}>{name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {([
                          ["Regresión", regression.result.fit.anova.regression, regression.result.fit.anova.f, regression.result.fit.anova.significanceF],
                          ["Residuos", regression.result.fit.anova.residual, null, null],
                          ["Total", regression.result.fit.anova.total, null, null],
                        ] as const).map(([name, row, f, significance]) => (
                          <tr key={name} className={CALC_ROW}>
                            <td className="px-1.5 py-1">{name}</td>
                            <td className="px-1.5 py-1 tabular-nums">{row.df}</td>
                            <td className="px-1.5 py-1 tabular-nums">{figure(row.sumSquares, decimals)}</td>
                            <td className="px-1.5 py-1 tabular-nums">{row.meanSquare === null ? "" : figure(row.meanSquare, decimals)}</td>
                            <td className="px-1.5 py-1 tabular-nums">{f === null ? "" : figure(f, decimals)}</td>
                            <td className="px-1.5 py-1 tabular-nums">{significance === null ? "" : figure(significance, Math.max(decimals, 4))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CalcTableContextMenu>
                ) : null}
                <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly={true}>
                  <table className={cn(CALC_TABLE, "w-full")} aria-label="Coeficientes de la regresión">
                    <thead className={CALC_HEAD}>
                      <tr>
                        {["", "Coeficientes", "Error típico", "Estadístico t", "Probabilidad", "Inferior 95 %", "Superior 95 %"].map((name, index) => (
                          <th key={name || "nombre"} className={cn(CALC_HEAD_CELL, index ? "text-right" : "text-left")}>{name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {regression.result.fit.coefficientTable.map((row) => {
                        const stat = (value: number | null) => (value === null ? "" : figure(value, Math.max(decimals, 4)));
                        return (
                          <tr key={row.constant} className={CALC_ROW} data-coefficient={row.constant}>
                            <td className="px-1.5 py-1">{row.name === "Intercepción" ? row.name : `${row.constant} (${row.name})`}</td>
                            <td className="px-1.5 py-1 text-right font-mono tabular-nums">{row.coefficient.toLocaleString("es-MX", { maximumSignificantDigits: 8 })}</td>
                            <td className="px-1.5 py-1 text-right tabular-nums">{stat(row.standardError)}</td>
                            <td className="px-1.5 py-1 text-right tabular-nums">{stat(row.t)}</td>
                            <td className={cn("px-1.5 py-1 text-right tabular-nums", row.p !== null && row.p < 0.05 && "font-medium")}>{stat(row.p)}</td>
                            <td className="px-1.5 py-1 text-right tabular-nums">{stat(row.lower95)}</td>
                            <td className="px-1.5 py-1 text-right tabular-nums">{stat(row.upper95)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="px-1.5 py-1 text-xs text-muted-foreground">{COEFFICIENTS_NOTE}</p>
                </CalcTableContextMenu>
                <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly={true}>
                  <table className={cn(CALC_TABLE, "w-full")} aria-label="Valores estimados por la regresión">
                    <thead className={CALC_HEAD}>
                      <tr>
                        <th className={cn(CALC_HEAD_CELL, "text-left")}>Ref</th>
                        <th className={cn(CALC_HEAD_CELL, "text-left")}>Y ({settings.dependent === "PRICE" ? "$" : unit})</th>
                        <th className={cn(CALC_HEAD_CELL, "text-left")}>Y estimado</th>
                        {settings.regression.showResidual ? <th className={cn(CALC_HEAD_CELL, "text-left")}>Residuo</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {regression.result.data.rows.map((row) => {
                        const estimate = fitted?.get(String(row.reference));
                        return (
                          <tr key={row.reference} className={CALC_ROW}>
                            <td className="px-1.5 py-1">{row.reference}</td>
                            <td className="px-1.5 py-1 tabular-nums">{figure(row.y, 2)}</td>
                            <td className="px-1.5 py-1 tabular-nums">{estimate ? figure(estimate.fitted, 2) : "—"}</td>
                            {settings.regression.showResidual ? <td className="px-1.5 py-1 tabular-nums">{estimate ? figure(estimate.residual, 2) : "—"}</td> : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CalcTableContextMenu>
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Valor unitario estimado ({unit})</dt>
                    <dd className="tabular-nums">{money(regression.result.unitValue)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">{rent ? "Renta mensual estimada" : "Valor estimado del inmueble"}</dt>
                    <dd className="text-base font-semibold tabular-nums">{money(regression.result.value)}</dd>
                  </div>
                  {calculation.market?.mean !== null && calculation.market ? (
                    <div className="sm:col-span-3">
                      <dt className="text-xs text-muted-foreground">Promedio y mediana homologados del enfoque de mercado ({unit})</dt>
                      <dd className="tabular-nums">{money(calculation.market.mean)} · {money(calculation.market.median)}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className="text-xs text-muted-foreground">{STATISTICAL_VALUE_NOTE}</p>
                {!regression.result.fit.reliable ? (
                  <p className="flex items-center gap-1 text-xs text-highlight-strong">
                    <AlertTriangle className="size-3.5 shrink-0" /> Con {regression.result.fit.n} comparables (se recomiendan más de {RECOMMENDED_REGRESSION_COMPARABLES}) la
                    regresión es poco confiable y muy sensible a errores de captura.
                  </p>
                ) : null}
                <SampleSizeAdvice n={regression.result.fit.n} k={regression.result.fit.k} />
              </div>
            ) : regression && !regression.ok ? (
              <div className="grid gap-1">
                <p className="text-sm text-muted-foreground">{regression.reason}</p>
                <SampleSizeAdvice n={included} k={k} />
              </div>
            ) : null}
            {settings.regression.showInDictamen && regression && !regression.ok ? <NotPrintedWarning reason={regression.reason} /> : null}
          </div>
        ) : null}
      </Part>

      <Part number={4} title="Programación por metas (PM)">
        <MethodControls label="Calcular por programación por metas" method={settings.goal} defaultTitle={DEFAULT_GOAL_TITLE} readOnly={readOnly} onChange={(patch) => setMethod("goal", patch)} />
        {settings.goal.enabled ? (
          <div className="grid gap-3">
            <p className="text-xs text-muted-foreground">
              Mismos comparables y criterios; Y es el precio total de oferta. Mínimo de Σ (p + n) con Σ criterio × coeficiente + p − n = precio, coeficientes y
              desviaciones ≥ 0, sin ordenada al origen, como LINGO. Se resuelve en el servidor (HiGHS) al guardar.
            </p>
            <ExtraTablesControl
              label="Imprimir también en el dictamen"
              options={GOAL_TABLE_LABELS}
              value={settings.goal.printedTables}
              disabled={readOnly || !settings.goal.showInDictamen}
              onChange={(printedTables) => setMethod("goal", { printedTables } as Partial<StatisticalMethodSettings>)}
            />
            <SampleSizeAdvice n={goal?.outcome.ok ? goal.outcome.fit.n : included} k={goal?.outcome.ok ? goal.outcome.fit.k : k} />
            {goal?.outcome.ok ? (
              <div className="grid gap-3 rounded-md border bg-background p-3 text-sm" aria-label="Resultado de la programación por metas">
                {goalProgrammingWarnings(goal.outcome.fit.n, goal.outcome.fit.k).map((warning) => (
                  <p key={warning} className="flex items-center gap-1 text-xs text-highlight-strong"><AlertTriangle className="size-3.5 shrink-0" /> {warning}</p>
                ))}
                <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly={true}>
                  <table className={cn(CALC_TABLE, "w-full")} aria-label="Contribución de cada criterio">
                    <thead className={CALC_HEAD}>
                      <tr>
                        {["Criterio", "Coeficiente", "Valor sujeto", "Contribución", ""].map((name, index) => <th key={index} className={cn(CALC_HEAD_CELL, "text-left")}>{name}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {goal.outcome.fit.contributions.map((row) => (
                        <tr key={row.name} className={cn(CALC_ROW, !row.contributes && "text-muted-foreground")}>
                          <td className="px-1.5 py-1">{row.name}</td>
                          <td className="px-1.5 py-1 tabular-nums">{significant(row.coefficient)}</td>
                          <td className="px-1.5 py-1 tabular-nums">{significant(row.subjectValue)}</td>
                          <td className="px-1.5 py-1 tabular-nums">{money(row.contribution)}</td>
                          <td className="px-1.5 py-1 text-xs">{row.contributes ? "" : NO_CONTRIBUTION_NOTE}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CalcTableContextMenu>
                <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly={true}>
                  <table className={cn(CALC_TABLE, "w-full")} aria-label="Desviaciones de cada comparable">
                    <thead className={CALC_HEAD}>
                      <tr>
                        {["Ref", "Precio", "Estimado", "p (por debajo)", "n (por encima)", ""].map((name, index) => <th key={index} className={cn(CALC_HEAD_CELL, "text-left")}>{name}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {goal.outcome.fit.deviations.map((row) => (
                        <tr key={row.id} className={cn(CALC_ROW, row.observe && "font-medium")}>
                          <td className="px-1.5 py-1">{row.id}</td>
                          <td className="px-1.5 py-1 tabular-nums">{money(row.observed)}</td>
                          <td className="px-1.5 py-1 tabular-nums">{money(row.fitted)}</td>
                          <td className="px-1.5 py-1 tabular-nums">{money(row.positive)}</td>
                          <td className="px-1.5 py-1 tabular-nums">{money(row.negative)}</td>
                          <td className="px-1.5 py-1 text-xs">{row.observe ? <span className="text-highlight-strong">A observar</span> : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CalcTableContextMenu>
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
                  <div><dt className="text-xs text-muted-foreground">Suma de desviaciones</dt><dd className="tabular-nums">{money(goal.outcome.fit.objective)}</dd></div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">{rent ? "Renta mensual estimada" : "Valor estimado del inmueble"}</dt>
                    <dd className="text-base font-semibold tabular-nums">{money(goal.outcome.fit.estimate)}</dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">{STATISTICAL_VALUE_NOTE}</p>
              </div>
            ) : goal ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {goal.pending ? <Loader2 className="size-3.5 animate-spin" /> : null} {goal.outcome.ok ? null : goal.outcome.reason}
              </p>
            ) : null}
            {settings.goal.showInDictamen && goal && !goal.outcome.ok && !goal.pending ? <NotPrintedWarning reason={goal.outcome.reason} /> : null}
          </div>
        ) : null}
      </Part>

      <Part
        number={5}
        title="Comparación de métodos"
        aside={(
          <label className="flex items-center gap-1.5 text-xs font-normal">
            <Checkbox
              checked={settings.showComparison}
              disabled={readOnly}
              onCheckedChange={(checked) => update((current) => ({ ...current, settings: { ...current.settings, showComparison: checked === true } }))}
            />
            Mostrar en el dictamen
          </label>
        )}
      >
        {comparison.length ? (
          <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly={true}>
            <table className={cn(CALC_TABLE, "w-full")} aria-label="Comparación de métodos">
              <thead className={CALC_HEAD}>
                <tr>
                  <th className={cn(CALC_HEAD_CELL, "text-left")}>Método</th>
                  <th className={cn(CALC_HEAD_CELL, "text-left")}>{rent ? "Renta unitaria" : "Valor unitario"} ({unit})</th>
                  <th className={cn(CALC_HEAD_CELL, "text-left")}>{rent ? "Renta mensual" : "Valor"}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.method} className={CALC_ROW}>
                    <td className="px-1.5 py-1">{row.method}</td>
                    <td className="px-1.5 py-1 tabular-nums">{money(row.unitValue)}</td>
                    <td className="px-1.5 py-1 tabular-nums">{money(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CalcTableContextMenu>
        ) : <p className="text-xs text-muted-foreground">Calcula algún método para compararlo con la homologación del enfoque de mercado.</p>}
        <p className="text-xs text-muted-foreground">Ningún método se adopta automáticamente: el valor lo concluye el valuador.</p>
      </Part>
    </div>
  );
}

const REGRESSION_TABLE_LABELS: Record<RegressionExtraTable, string> = {
  products: "Tabla de sumas y productos",
  statistics: "Estadísticas de la regresión",
  anova: "Análisis de varianza",
  coefficients: "Coeficientes",
};
const GOAL_TABLE_LABELS: Record<GoalExtraTable, string> = { deviations: "Desviaciones", contributions: "Contribución de cada criterio" };

/**
 * The technical tables of a method (video 5.3, 21:48): they are always in the
 * calculation memory; marked, they print in the dictamen too, before the
 * conclusion.
 */
function ExtraTablesControl<K extends string>(props: {
  label: string;
  options: Record<K, string>;
  value: K[] | undefined;
  disabled: boolean;
  onChange: (value: K[]) => void;
}) {
  const chosen = new Set(props.value ?? []);
  const keys = Object.keys(props.options) as K[];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" data-extra-tables="">
      <span className="font-medium">{props.label}:</span>
      {keys.map((key) => (
        <label key={key} className="flex items-center gap-1.5">
          <Checkbox
            checked={chosen.has(key)}
            disabled={props.disabled}
            onCheckedChange={(checked) => props.onChange(keys.filter((item) => (item === key ? checked === true : chosen.has(item))))}
          />
          {props.options[key]}
        </label>
      ))}
      <span className="text-muted-foreground">Sin marcar, van solo a la memoria de cálculo; el dictamen lleva una tabla breve y la conclusión.</span>
    </div>
  );
}

/** The appraiser's rule of ten to twenty comparables per criterion, as advice: nothing stops for it. */
function SampleSizeAdvice({ n, k }: { n: number; k: number }) {
  const advice = sampleSizeRecommendation(n, k);
  if (!advice) return null;
  return (
    <p className="rounded-md border border-primary/25 bg-primary/5 p-2 text-xs text-foreground dark:bg-primary/10" data-sample-size-advice="">
      {advice}
    </p>
  );
}
