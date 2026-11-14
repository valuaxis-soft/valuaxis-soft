/**
 * Live formulas of the calculation panels: a numeric field that reads a
 * concept or a cell of the valuation ("=[Medidas y colindancias]!B1*2")
 * follows it, as a formula of the document's tables does.
 *
 * Stored: the formula with each reference written as a tag that names what
 * it reads by id and carries the number it read last,
 *
 *   =[Superficie total de terreno]*2   →  ={c:concept-7|1250}*2
 *   =[Lotes]!B1+[Lotes]!B2             →  ={t:table-3:row-1:col-2|600}+{t:table-3:row-2:col-2|650}
 *
 * so renaming or moving what it reads keeps the reference, and everything
 * that computed the formulas with values of before ("=1250*2": the panels,
 * the server's check, the memory) still computes it: the free formula reads
 * a tag as its last number (free-formula.ts, `withLastReadValues`). A
 * formula without tags is one of before, or plain arithmetic, and stays as
 * it is.
 *
 * Resolving reads every reference again against the document. A reference
 * to something deleted, to a value without a number, or to a figure that the
 * field's own calculation produces (a circular reference: the cost approach
 * reading the concluded value) keeps the last number and says why; nothing
 * is blocked. Pure TypeScript.
 */
import { isConclusionCalculatedConcept } from "../calculation/conclusion-document";
import { LIVE_REFERENCE_TAG, parseDecimal, withLastReadValues } from "../calculation/free-formula";
import { COMPARABLE_TYPES, type ComparableType } from "../calculation/market-types";
import { getCanonicalSectionKey } from "../sections/section-registry";
import { capturedFormulaText, cellNumber, formulaNumber, spanCells } from "./formula-reference-values";
import { cellReferenceText, compileFormula, conceptReferenceText, formulaToText, MISSING_REFERENCE_TEXT, type FormulaIndex } from "./formula-references";
import { getDisplayColumns, type FormulaExpression, type FormulaOperand, type TableV2 } from "./table";
import { referenceKey } from "./table-formula-engine";
import { conceptSourceValue } from "./valuation-formulas";

/* ================================================================== */
/*  WHO CALCULATES WHAT                                                */
/* ================================================================== */

/** A calculation of the valuation: the one a panel field belongs to, or the one that wrote a figure of the document. */
export type LiveFormulaOwner =
  | `MERCADO:${ComparableType}`
  | `ESTADISTICO:${ComparableType}`
  | "CONSTRUCCIONES"
  | "COSTOS"
  | "INGRESOS"
  | "MAQUINARIA"
  | "CONCLUSION";

/** The calculation of a field: one, or the ones a panel may be (the market section holds the land and the buildings markets). */
export type LiveFormulaOwners = LiveFormulaOwner | readonly LiveFormulaOwner[] | null | undefined;

/** What each calculation feeds when it changes, as the server chains them (market.service.ts `recomputeDependents`). */
const FEEDS: Partial<Record<LiveFormulaOwner, LiveFormulaOwner[]>> = {
  "MERCADO:TERRENO_VENTA": ["COSTOS", "CONCLUSION", "ESTADISTICO:TERRENO_VENTA"],
  "MERCADO:INMUEBLE_VENTA": ["CONCLUSION", "ESTADISTICO:INMUEBLE_VENTA"],
  "MERCADO:INMUEBLE_RENTA": ["INGRESOS", "ESTADISTICO:INMUEBLE_RENTA"],
  "MERCADO:TERRENO_RENTA": ["ESTADISTICO:TERRENO_RENTA"],
  CONSTRUCCIONES: ["COSTOS"],
  COSTOS: ["CONCLUSION"],
  INGRESOS: ["CONCLUSION"],
  MAQUINARIA: ["CONCLUSION"],
};

/** The calculation of the panel of a section (by canonical key); a market section may be any of its markets. */
export function sectionLiveFormulaOwner(sectionKey: string, machinery: boolean): LiveFormulaOwners {
  if (machinery && (sectionKey === "COSTOS" || sectionKey === "MERCADO_VENTA")) return "MAQUINARIA";
  switch (sectionKey) {
    case "MERCADO_VENTA":
      return ["MERCADO:TERRENO_VENTA", "MERCADO:INMUEBLE_VENTA"];
    case "MERCADO_RENTAS":
      return ["MERCADO:INMUEBLE_RENTA", "MERCADO:TERRENO_RENTA"];
    case "COSTOS":
      return "COSTOS";
    case "CONSTRUCCION":
      return "CONSTRUCCIONES";
    case "INGRESOS":
      return "INGRESOS";
    case "CONCLUSIONES":
      return "CONCLUSION";
    default:
      return null;
  }
}

/** Every calculation that changes when `owner` changes, itself included. */
export function downstreamOf(owners: Iterable<LiveFormulaOwner>): Set<LiveFormulaOwner> {
  const reached = new Set<LiveFormulaOwner>();
  const pending = [...owners];
  while (pending.length) {
    const owner = pending.pop() as LiveFormulaOwner;
    if (reached.has(owner)) continue;
    reached.add(owner);
    pending.push(...(FEEDS[owner] ?? []));
  }
  return reached;
}

/** The calculation that writes a generated block, by its id (motor-costos-…, motor-mercado-terreno_venta-…). */
function blockProducers(blockId: string): LiveFormulaOwner[] {
  const id = blockId.toLowerCase();
  if (!id.startsWith("motor-")) return [];
  const typed = (prefix: "mercado" | "estadistico") =>
    COMPARABLE_TYPES.filter((type) => id.startsWith(`motor-${prefix}-${type.toLowerCase()}`))
      .map((type) => `${prefix === "mercado" ? "MERCADO" : "ESTADISTICO"}:${type}` as LiveFormulaOwner);
  if (id.startsWith("motor-mercado-")) return typed("mercado");
  if (id.startsWith("motor-estadistico-")) return typed("estadistico");
  if (id.startsWith("motor-anexo-factores")) return COMPARABLE_TYPES.map((type) => `MERCADO:${type}` as const);
  if (id.startsWith("motor-costos")) return ["COSTOS"];
  if (id.startsWith("motor-ingresos")) return ["INGRESOS"];
  if (id.startsWith("motor-maquinaria")) return ["MAQUINARIA"];
  return [];
}

/** The references of a stored formula of the document, wherever they sit in it. */
function operandsOf(expression: FormulaExpression | undefined, found: FormulaOperand[] = [], depth = 0): FormulaOperand[] {
  if (!expression || typeof expression !== "object" || depth > 200) return found;
  if (expression.type === "operand" && expression.operand) found.push(expression.operand);
  if (expression.type === "binary" || expression.type === "compare") {
    operandsOf(expression.left, found, depth + 1);
    operandsOf(expression.right, found, depth + 1);
  }
  if (expression.type === "function" && Array.isArray(expression.args)) for (const arg of expression.args) operandsOf(arg, found, depth + 1);
  return found;
}

/**
 * The calculations whose figures a concept or a cell shows: the one that
 * wrote it (a generated block, a concept the conclusion fills) and, through
 * its own formula, the ones of what it reads.
 */
function producersOf(reference: LiveReference, index: FormulaIndex, seen = new Set<string>()): Set<LiveFormulaOwner> {
  const producers = new Set<LiveFormulaOwner>();
  const key = reference.kind === "concept" ? `c:${reference.conceptId}` : `t:${reference.tableId}:${reference.rowId}:${reference.columnId}`;
  if (seen.has(key)) return producers;
  seen.add(key);
  const follow = (operands: FormulaOperand[], home: { id: string; table: TableV2 } | null) => {
    for (const operand of operands) {
      for (const next of operandReferences(operand, index, home)) for (const producer of producersOf(next, index, seen)) producers.add(producer);
    }
  };
  if (reference.kind === "concept") {
    const entry = index.conceptById.get(referenceKey(reference.conceptId));
    if (!entry) return producers;
    for (const producer of blockProducers(entry.blockId)) producers.add(producer);
    if (!entry.concept.calculationUnlinked && isConclusionCalculatedConcept(getCanonicalSectionKey(entry.sectionId), entry.concept)) producers.add("CONCLUSION");
    follow(operandsOf(entry.concept.formula?.expression), null);
    return producers;
  }
  const entry = index.tableById.get(reference.tableId);
  if (!entry) return producers;
  for (const producer of blockProducers(entry.blockId)) producers.add(producer);
  const cell = entry.table.rows.find((row) => row.id === reference.rowId)?.cells[reference.columnId];
  if (cell?.kind === "formula") follow(operandsOf(cell.formula?.expression), { id: entry.id, table: entry.table });
  return producers;
}

/** The single values an operand of a document formula reads. */
function operandReferences(operand: FormulaOperand, index: FormulaIndex, home: { id: string; table: TableV2 } | null): LiveReference[] {
  const tableOf = (tableId: string | undefined) => {
    if (!tableId || tableId === home?.id) return home;
    const entry = index.tableById.get(tableId);
    return entry ? { id: entry.id, table: entry.table } : null;
  };
  const cells = (place: { id: string; table: TableV2 } | null, list: Array<{ rowId: string; columnId: string }> | null) =>
    place && list ? list.map((cell): LiveReference => ({ kind: "cell", tableId: place.id, rowId: cell.rowId, columnId: cell.columnId })) : [];
  switch (operand.type) {
    case "concept":
      return [{ kind: "concept", conceptId: String(operand.conceptId) }];
    case "cell":
      return cells(tableOf(operand.tableId), [operand]);
    case "span": {
      const place = tableOf(operand.tableId);
      return cells(place, place ? spanCells(place.table, operand.from, operand.to) : null);
    }
    case "range":
      return cells(home, operand.cells);
    case "row":
      return cells(home, home ? getDisplayColumns(home.table).map((column) => ({ rowId: operand.rowId, columnId: column.id })) : null);
    case "column":
      return cells(home, home?.table.rows.map((row) => ({ rowId: row.id, columnId: operand.columnId })) ?? null);
    default:
      return [];
  }
}

/* ================================================================== */
/*  TAGS                                                               */
/* ================================================================== */

export type LiveReference =
  | { kind: "concept"; conceptId: string }
  | { kind: "cell"; tableId: string; rowId: string; columnId: string };

const encode = (id: string) => encodeURIComponent(id);
const decode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

function tagOf(reference: LiveReference, value: number) {
  const ref = reference.kind === "concept"
    ? `c:${encode(reference.conceptId)}`
    : `t:${[reference.tableId, reference.rowId, reference.columnId].map(encode).join(":")}`;
  return `{${ref}|${formulaNumber(value)}}`;
}

function referenceOfTag(kind: string, ref: string): LiveReference | null {
  if (kind === "c") return ref ? { kind: "concept", conceptId: decode(ref) } : null;
  if (kind !== "t") return null;
  const [tableId, rowId, columnId] = ref.split(":").map(decode);
  return tableId && rowId && columnId ? { kind: "cell", tableId, rowId, columnId } : null;
}

type Tag = { text: string; reference: LiveReference | null; last: number | null };

function tagsOf(text: string): Tag[] {
  return [...text.matchAll(LIVE_REFERENCE_TAG)].map((match) => ({
    text: match[0],
    reference: referenceOfTag(match[1], match[2]),
    last: parseDecimal(match[3]),
  }));
}

/** Whether a stored formula reads the valuation (it has references to follow). */
export function hasLiveReferences(text: string | null | undefined): boolean {
  return Boolean(text?.includes("{")) && tagsOf(text as string).length > 0;
}

/** The number a reference reads in the document today; null when it has none, undefined when it is gone. */
function currentValue(reference: LiveReference, index: FormulaIndex): number | null | undefined {
  if (reference.kind === "concept") {
    const entry = index.conceptById.get(referenceKey(reference.conceptId));
    if (!entry) return undefined;
    const read = conceptSourceValue(entry.concept);
    return read.kind === "number" ? read.value : null;
  }
  const entry = index.tableById.get(reference.tableId);
  if (!entry || !entry.table.rows.some((row) => row.id === reference.rowId) || !entry.table.columns.some((column) => column.id === reference.columnId)) return undefined;
  return cellNumber(entry.table, reference.rowId, reference.columnId);
}

/** How the appraiser reads a reference: [Concepto] or [Tabla]!B3; #REF! once it is gone. */
function referenceText(reference: LiveReference | null, index: FormulaIndex): string {
  if (!reference) return MISSING_REFERENCE_TEXT;
  if (reference.kind === "concept") return conceptReferenceText(index, reference.conceptId) ?? MISSING_REFERENCE_TEXT;
  const entry = index.tableById.get(reference.tableId);
  return (entry && cellReferenceText(index, entry.id, entry.table, reference.rowId, reference.columnId, undefined)) ?? MISSING_REFERENCE_TEXT;
}

/* ================================================================== */
/*  WRITING, READING AND RESOLVING                                     */
/* ================================================================== */

export type LiveFormulaText = { ok: true; text: string } | { ok: false; message: string };

/**
 * What a panel field keeps of a formula typed in it. With references to the
 * valuation, the formula with its tags ("=[Superficie]*2" kept as
 * "={c:…|1250}*2"); without them, as before (capturedFormulaText): plain
 * arithmetic as typed. A reference without a number answers with the reason.
 */
export function liveFormulaText(text: string, index: FormulaIndex): LiveFormulaText {
  const compiled = compileFormula(text, { index });
  if (!compiled.ok) return capturedFormulaText(text, index);
  let missing: string | null = null;
  let referenced = false;
  const tagged = formulaToText(compiled.formula, {
    index,
    referenceValue: (operand) => {
      const references = operandReferences(operand, index, null);
      if (!references.length) return null;
      referenced = true;
      const tags = references.map((reference) => {
        const value = currentValue(reference, index);
        if (typeof value !== "number") {
          missing ??= referenceText(reference, index);
          return "";
        }
        return tagOf(reference, value);
      });
      return tags.join("; ");
    },
  });
  // Plain arithmetic stays as typed, as before.
  if (!referenced) return capturedFormulaText(text, index);
  if (missing) return { ok: false, message: `${missing} no tiene un número: la fórmula no se puede calcular.` };
  return { ok: true, text: `=${tagged}` };
}

/** The formula as the appraiser reads and corrects it: "=[Superficie]*2". A formula without references, as stored. */
export function readableFormulaText(text: string, index: FormulaIndex): string {
  if (!hasLiveReferences(text)) return text;
  return text.replace(LIVE_REFERENCE_TAG, (_tag, kind: string, ref: string) => referenceText(referenceOfTag(kind, ref), index));
}

/** The formula with the numbers it read last: "=1250*2". */
export const formulaWithLastValues = (text: string) => withLastReadValues(text);

export type LiveFormulaProblem = {
  kind: "broken" | "empty" | "circular";
  /** The reference as the appraiser reads it. */
  reference: string;
  /** The number kept. */
  last: number | null;
};

export type ResolvedLiveFormula = {
  /** The formula with the numbers its references read today (the stored one where a reference has a problem). */
  text: string;
  /** Whether a number changed. */
  changed: boolean;
  problems: LiveFormulaProblem[];
};

/**
 * The formula read again against the document. `owner` is the calculation
 * the field belongs to: a reference to a figure it produces, directly or
 * through what depends on it, is circular and keeps its last number.
 */
export function resolveLiveFormula(text: string, index: FormulaIndex, owner?: LiveFormulaOwners): ResolvedLiveFormula {
  if (!hasLiveReferences(text)) return { text, changed: false, problems: [] };
  const owners = typeof owner === "string" ? [owner] : owner ?? [];
  const fed = owners.length ? downstreamOf(owners) : null;
  const problems: LiveFormulaProblem[] = [];
  let changed = false;
  const resolved = text.replace(LIVE_REFERENCE_TAG, (tag: string, kind: string, ref: string, lastText: string) => {
    const reference = referenceOfTag(kind, ref);
    const last = parseDecimal(lastText);
    const shown = referenceText(reference, index);
    if (!reference) {
      problems.push({ kind: "broken", reference: shown, last });
      return tag;
    }
    if (fed && [...producersOf(reference, index)].some((producer) => fed.has(producer))) {
      problems.push({ kind: "circular", reference: shown, last });
      return tag;
    }
    const value = currentValue(reference, index);
    if (value === undefined) {
      problems.push({ kind: "broken", reference: shown, last });
      return tag;
    }
    if (value === null) {
      problems.push({ kind: "empty", reference: shown, last });
      return tag;
    }
    const next = tagOf(reference, value);
    if (next !== tag && (last === null || formulaNumber(last) !== formulaNumber(value))) changed = true;
    return next;
  });
  return { text: changed ? resolved : text, changed, problems };
}

/** What a field says about its references, in the appraiser's words; null when they all read. */
export function liveFormulaWarning(problems: LiveFormulaProblem[]): string | null {
  if (!problems.length) return null;
  const kept = (problem: LiveFormulaProblem) => (problem.last === null ? "" : ` Se conserva el último valor (${formulaNumber(problem.last).replace(/[()]/g, "")}).`);
  return problems.map((problem) => {
    if (problem.kind === "circular") {
      return `Referencia circular: ${problem.reference} se calcula con este campo, así que no se vuelve a leer.${kept(problem)}`;
    }
    if (problem.kind === "empty") return `${problem.reference} ya no tiene un número.${kept(problem)}`;
    return `La referencia ya no existe (se borró el dato o su tabla).${kept(problem)}`;
  }).join(" ");
}

/* ================================================================== */
/*  THE FORMULAS OF A CAPTURE                                          */
/* ================================================================== */

/** Path of a field → the formula typed in it (captured-formulas.ts). */
type Formulas = Record<string, string>;

export type LiveCaptureUpdate = {
  /** The formulas with the numbers read today. */
  formulas: Formulas;
  /** Path → the value its formula gives now, for the fields whose value changed. */
  values: Record<string, number>;
  /** Path → what its references say, for the fields with a problem. */
  warnings: Record<string, string>;
};

/**
 * The live formulas of a capture read again: the new formulas, the values
 * of the fields that changed (a percentage field gives its fraction) and the
 * warnings of the ones that could not follow their references.
 */
export function resolveCaptureFormulas(
  formulas: Formulas,
  index: FormulaIndex,
  owner: LiveFormulaOwners,
  percent: (path: string) => boolean = () => false,
): LiveCaptureUpdate {
  const next: Formulas = {};
  const values: Record<string, number> = {};
  const warnings: Record<string, string> = {};
  for (const [path, formula] of Object.entries(formulas)) {
    const resolved = resolveLiveFormula(formula, index, owner);
    next[path] = resolved.text;
    const warning = liveFormulaWarning(resolved.problems);
    if (warning) warnings[path] = warning;
    if (!resolved.changed) continue;
    const result = parseDecimal(resolved.text);
    if (result === null) {
      next[path] = formula;
      continue;
    }
    values[path] = percent(path) ? result / 100 : result;
  }
  return { formulas: next, values, warnings };
}

/** `source` with `value` at `path` ("constructions.0.unitReplacementCost"); a path that is not there is left alone. */
export function withValueAtPath<T>(source: T, path: string, value: number): T {
  const segments = path.split(".");
  const copy = structuredClone(source);
  let current: unknown = copy;
  for (const segment of segments.slice(0, -1)) {
    if (current === null || typeof current !== "object") return source;
    current = (current as Record<string, unknown>)[segment];
  }
  const last = segments.at(-1) as string;
  if (current === null || typeof current !== "object" || !Object.hasOwn(current, last)) return source;
  (current as Record<string, unknown>)[last] = value;
  return copy;
}
