import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { api, SessionExpiredError } from "@/lib/api-client";
import {
  asCaptureTable,
  captureTablesOf,
  findCaptureTable,
  isCaptureMarked,
  isCaptureUnlinked,
  normalizeCapture,
  readCapture,
  sameItems,
  serverItems,
  syncedFromTable,
  withCaptureTables,
  withConstructionTables,
  type CaptureKind,
  type InstallationItem,
  type SyncedItem,
  type TypeItem,
} from "@/features/valuations/calculation/construction-capture";
import {
  costColumnsOf,
  costInputOf,
  emptyInstallation,
  type ConstructionCostDto,
  type CostCalculationDto,
  type InstallationDto,
} from "@/features/valuations/calculation/cost-types";
import type { AppSection } from "@/features/valuations/model";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import type { ConstructionCaptureContextValue } from "../../editor/construction-capture-table";

const refKey = (ref: string) => ref.trim().toLowerCase();
const KINDS: CaptureKind[] = ["types", "installations"];
const constructionSection = (sections: AppSection[]) => sections.find((section) => getCanonicalSectionKey(section.id) === "CONSTRUCCION");

/**
 * The capture tables of the construction section (video 5.3): the
 * construction types and the special installations are written in their
 * table of the dictamen, and that is what the cost approach takes. What the
 * appraiser writes there is saved a moment later (the types with
 * `/construcciones`, the installations with the cost approach); what the
 * server changed (the cost panel, or on opening) is written back into the
 * table only where it changed (`mergeCapture`). A type taken out of the
 * table and brought back with «Deshacer» comes back with its cost columns.
 */
export function useConstructionCapture({
  canEdit,
  machinery,
  sections,
  valuationId,
  onCostsSaved,
  refreshCosts,
}: {
  canEdit: boolean;
  machinery: boolean;
  sections: AppSection[];
  valuationId: string | null;
  /** The cost approach the server saved: its pages and the conclusion follow. */
  onCostsSaved: (calculation: CostCalculationDto) => void;
  /** Reads the cost approach again and writes it in the document (after a type is saved). */
  refreshCosts: () => Promise<void>;
}) {
  const active = canEdit && !machinery && Boolean(valuationId);
  // What the server held the last time each table and the server agreed; null until the first reading.
  const synced = useRef<Record<CaptureKind, SyncedItem[] | null>>({ types: null, installations: null });
  const costsRef = useRef<CostCalculationDto | null>(null);
  const [costs, setCosts] = useState<CostCalculationDto | null>(null);
  const sectionsRef = useRef(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  });
  const saving = useRef(0);
  // What the server refused, by kind: it is not sent again until the table changes.
  const refused = useRef<Record<CaptureKind, string | null>>({ types: null, installations: null });
  const refusedBefore = (kind: CaptureKind, items: Array<{ item: unknown }>) => {
    const text = JSON.stringify(items.map(({ item }) => item));
    if (refused.current[kind] === text) return { skip: true, text };
    return { skip: false, text };
  };
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The cost columns of what was taken out of the table, by reference, to bring them back with it.
  const removedConstructions = useRef(new Map<string, ConstructionCostDto>());
  const removedInstallations = useRef(new Map<string, InstallationDto>());

  useEffect(() => {
    synced.current = { types: null, installations: null };
    costsRef.current = null;
    removedConstructions.current.clear();
    removedInstallations.current.clear();
  }, [valuationId]);

  /**
   * The construction section following the cost calculation the server
   * holds: called while the document takes it. A table saved before becomes
   * the capture; while a save is on its way only the figures of the system
   * are written.
   */
  const withCostCapture = (section: AppSection, calculation: CostCalculationDto): AppSection => {
    costsRef.current = calculation;
    setCosts(calculation);
    if (!active) return section;
    if (saving.current > 0) {
      return withCaptureTables(section, (table) => {
        const converted = asCaptureTable(table, calculation);
        return converted !== table ? converted : normalizeCapture(table, calculation);
      });
    }
    const next = withConstructionTables(section, calculation, synced.current);
    for (const kind of KINDS) {
      const table = findCaptureTable(next, kind);
      synced.current[kind] = table && !isCaptureUnlinked(table) ? syncedFromTable(table, serverItems(kind, calculation), synced.current[kind]) : null;
    }
    return next;
  };

  const reportError = (error: unknown, what: string) => {
    toast.error(error instanceof SessionExpiredError
      ? "Tu sesión expiró. Vuelve a iniciar sesión."
      : `${error instanceof Error ? error.message : "Error desconocido."} No se guardaron ${what}: corrige lo escrito en la tabla.`);
  };

  const saveTypes = async (id: string, section: AppSection) => {
    const table = findCaptureTable(section, "types");
    const previous = synced.current.types;
    if (!table || !isCaptureMarked(table) || !previous) return;
    const items = readCapture(table, "types", previous);
    if (sameItems(items, previous)) return;
    const attempt = refusedBefore("types", items);
    if (attempt.skip) return;
    const kept = new Set(items.map((entry) => refKey(entry.item.ref)));
    // What is taken out keeps its cost columns here, to come back with «Deshacer».
    for (const entry of previous) {
      const cost = costsRef.current?.constructions.find((row) => refKey(row.ref) === refKey(entry.item.ref));
      if (!kept.has(refKey(entry.item.ref)) && cost) removedConstructions.current.set(refKey(cost.ref), cost);
    }
    const restore = items.filter((entry) => entry.id === undefined && removedConstructions.current.has(refKey(entry.item.ref)));
    saving.current += 1;
    try {
      const saved = await api.constructionTypes.save(id, { types: items.map(({ id: typeId, item }) => ({ ...(typeId === undefined ? {} : { id: typeId }), ...(item as TypeItem) })) });
      // What was sent is what both hold; the server's figures (rounded, for one) are written back by the merge.
      synced.current.types = items.map((entry, index) => ({ rowId: entry.rowId, ...(saved.types[index]?.id === undefined ? {} : { id: saved.types[index].id }), item: entry.item }));
      refused.current.types = null;
    } catch (error) {
      refused.current.types = attempt.text;
      reportError(error, "los tipos de construcción");
    } finally {
      saving.current -= 1;
    }
    await refreshCosts();
    if (restore.length) await restoreConstructionCosts(id, restore.map((entry) => entry.item.ref));
  };

  /** The cost columns of the types brought back, as they were when they were taken out. */
  const restoreConstructionCosts = async (id: string, refs: string[]) => {
    const current = costsRef.current;
    if (!current?.configured) return;
    const input = costInputOf(current);
    const back = refs.flatMap((ref) => {
      const cost = removedConstructions.current.get(refKey(ref));
      removedConstructions.current.delete(refKey(ref));
      return cost && !input.constructions.some((row) => refKey(row.ref) === refKey(ref)) ? [{ ...costOnly(cost), ref }] : [];
    });
    if (!back.length) return;
    const columns = costColumnsOf(current.columns);
    const excludedTypes = (columns.excludedTypes ?? []).filter((ref) => !back.some((row) => refKey(row.ref) === refKey(ref)));
    try {
      onCostsSaved(await api.costs.save(id, { ...input, constructions: [...input.constructions, ...back], columns: { ...columns, excludedTypes } }));
    } catch (error) {
      reportError(error, "las columnas de costo de los tipos");
    }
  };

  const saveInstallations = async (id: string, section: AppSection) => {
    const table = findCaptureTable(section, "installations");
    const previous = synced.current.installations;
    const current = costsRef.current;
    if (!table || !isCaptureMarked(table) || isCaptureUnlinked(table) || !previous || !current) return;
    const items = readCapture(table, "installations", previous);
    if (sameItems(items, previous)) return;
    const attempt = refusedBefore("installations", items);
    if (attempt.skip) return;
    const byRef = new Map(current.installations.map((row, index) => [refKey(row.ref), { row, index }]));
    const previousRef = new Map(previous.flatMap((entry) => (entry.rowId ? [[entry.rowId, entry.item.ref] as const] : [])));
    const sources: (number | null)[] = [];
    const installations = items.map(({ rowId, item }, index): InstallationDto => {
      const source = byRef.get(refKey(previousRef.get(rowId) ?? item.ref)) ?? byRef.get(refKey(item.ref));
      sources.push(source?.index ?? null);
      const base = source?.row ?? removedInstallations.current.get(refKey(item.ref)) ?? emptyInstallation(index);
      return { ...base, ...(item as InstallationItem) };
    });
    // What is taken out keeps its cost columns here, to come back with «Deshacer».
    for (const [index, row] of current.installations.entries()) {
      if (!sources.includes(index)) removedInstallations.current.set(refKey(row.ref), row);
    }
    const input = costInputOf(current);
    saving.current += 1;
    try {
      const next = await api.costs.save(id, {
        ...input,
        installations,
        formulas: installationFormulas(input.formulas ?? {}, current.installations, installations, sources),
      });
      synced.current.installations = items.map((entry) => ({ rowId: entry.rowId, item: entry.item }));
      refused.current.installations = null;
      saving.current -= 1;
      onCostsSaved(next);
    } catch (error) {
      saving.current -= 1;
      refused.current.installations = attempt.text;
      reportError(error, "las instalaciones especiales");
    }
  };

  const save = useEffectEvent(() => {
    if (!active || !valuationId) return;
    const id = valuationId;
    queue.current = queue.current.then(async () => {
      // What the table holds when its turn comes: the last thing written.
      const section = constructionSection(sectionsRef.current);
      if (!section) return;
      await saveTypes(id, section);
      const latest = constructionSection(sectionsRef.current);
      if (latest) await saveInstallations(id, latest);
    }).catch(() => undefined);
  });

  // A moment after the appraiser writes in a capture table, it is saved.
  const section = constructionSection(sections);
  const captureKey = useMemo(() => {
    if (!section) return "";
    return KINDS.map((kind) => JSON.stringify(findCaptureTable(section, kind) ?? null)).join("|");
  }, [section]);
  useEffect(() => {
    if (!captureKey) return;
    const timer = window.setTimeout(save, 400);
    return () => window.clearTimeout(timer);
  }, [captureKey]);

  const setExcludedTypes = async (excludedTypes: string[]) => {
    const current = costsRef.current;
    if (!current || !valuationId) return;
    try {
      const columns = costColumnsOf(current.columns);
      onCostsSaved(await api.costs.save(valuationId, { ...costInputOf(current), columns: { ...columns, excludedTypes } }));
      toast.success(excludedTypes.length ? "Los tipos ya no entran solos al enfoque de costos." : "Los tipos vuelven a entrar al enfoque de costos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar el vínculo con el enfoque de costos.");
    }
  };

  const context: ConstructionCaptureContextValue = {
    tables: section && active ? captureTablesOf(section) : new Map(),
    costs,
    setExcludedTypes,
    relink: (kind) => {
      synced.current[kind] = null;
      void refreshCosts();
    },
  };

  return { withCostCapture, context };
}

const costOnly = (row: ConstructionCostDto): ConstructionCostDto => ({
  ref: row.ref, conservation: row.conservation, conservationRating: row.conservationRating,
  ...(row.conservationState ? { conservationState: row.conservationState } : {}),
  ageFactor: row.ageFactor, otherFactor: row.otherFactor, extraFactors: row.extraFactors, resultantFactor: row.resultantFactor,
  completion: row.completion, undivided: row.undivided, unitReplacementCost: row.unitReplacementCost,
});

/**
 * The formulas of the installations' cost fields, following each
 * installation to its new place in the list; a formula of a datum the table
 * changed (quantity, age, useful life) is dropped, since its value is no
 * longer the formula's.
 */
function installationFormulas(formulas: Record<string, string>, before: InstallationDto[], after: InstallationDto[], sources: (number | null)[]) {
  const next: Record<string, string> = {};
  for (const [path, formula] of Object.entries(formulas)) {
    const match = /^installations\.(\d+)\.(.+)$/.exec(path);
    if (!match) {
      next[path] = formula;
      continue;
    }
    const to = sources.indexOf(Number(match[1]));
    if (to < 0) continue;
    const field = match[2] as keyof InstallationDto;
    if (before[Number(match[1])]?.[field] !== after[to]?.[field]) continue;
    next[`installations.${to}.${match[2]}`] = formula;
  }
  return next;
}
