"use client";

/**
 * The conclusion as the despacho's book prints it (video 7.1, 16:52–19:23):
 * the resumen de valores in shaded rows, the concluded value large in its box
 * with the amount in words under it, an optional chart of the values, and
 * the signatures of the carátula under FIRMAS.
 */
import type { Block, CaratulaFormData, Concept } from "../model";
import {
  CONCLUSION_KEYS,
  conceptCalculationKey,
  isConcludedValueBlock,
  isSummaryConcept,
} from "@/features/valuations/calculation/conclusion-document";
import type { ValuationSignature } from "@/features/valuations/services/valuation-signatures";
import { SignatureLines } from "./caratula-preview-modules";
import type { DocumentFlowItem } from "./document-preview-page";

const keyOf = (concept: Concept) => conceptCalculationKey(concept);
const visible = (concept: Concept) => concept.enabled !== false;

/** "8530000.00" (or "$8,530,000.00" written by hand) as a number; null for a text such as "NO APLICA". */
function amountOf(value: string): number | null {
  const compact = value.replace(/[$,\s]|M\.?N\.?/gi, "");
  if (!/^-?\d+(\.\d+)?$/.test(compact)) return null;
  const number = Number(compact);
  return Number.isFinite(number) ? number : null;
}

const figure = (value: number) => value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A label as the book prints it: in capitals and ending in a colon. */
const printedLabel = (label: string) => {
  const text = label.trim().toUpperCase();
  return text.endsWith(":") ? text : `${text}:`;
};

/** "$" at the left of the cell and the figure at the right, as Excel's accounting format; a text as it is. */
function Amount({ value, className }: { value: string; className?: string }) {
  const number = amountOf(value);
  if (number === null) return <span className={`block text-right ${className ?? ""}`}>{value.trim() || "—"}</span>;
  return (
    <span className={`flex items-baseline justify-between gap-3 tabular-nums ${className ?? ""}`}>
      <span>$</span>
      <span>{figure(number)}</span>
    </span>
  );
}

/** The chart of the values (V7.1-26, «extra»): one horizontal bar each, the concluded value last. */
function ValueChart({ rows }: { rows: Array<{ id: string; label: string; value: number; concluded?: boolean }> }) {
  const max = Math.max(...rows.map((row) => row.value));
  if (!(max > 0)) return null;
  return (
    <figure className="mx-auto mt-3 w-[88%] break-inside-avoid" data-conclusion-chart>
      <figcaption className="pb-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-600">Gráfica de valores</figcaption>
      <div className="grid gap-1">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[38%_1fr] items-center gap-2 text-[9.5px] text-slate-700">
            <span className="truncate text-right font-semibold uppercase">{row.label}</span>
            <span className="flex items-center gap-1.5">
              <span
                className={`block h-3 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] ${row.concluded ? "bg-[var(--caratula-blue)]" : "bg-[var(--doc-strong-soft,#8EA9D1)]"}`}
                style={{ width: `${Math.max(1, (row.value / max) * 78)}%` }}
              />
              <span className="whitespace-nowrap tabular-nums">${figure(row.value)}</span>
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/**
 * The resumen de valores, the concluded value in its box and its amount in
 * words, from the concepts of the block (linked to the calculation or
 * written by hand): the book's «RESUMEN DE VALORES» and «VALOR DE MERCADO:».
 */
export function ConclusionValueModule({ block }: { block: Block }) {
  const concepts = block.concepts.filter(visible);
  const summary = concepts.filter(isSummaryConcept);
  const concluded = concepts.find((concept) => keyOf(concept) === CONCLUSION_KEYS.value);
  const words = concepts.find((concept) => keyOf(concept) === CONCLUSION_KEYS.words);
  const chartRows = block.valueChart
    ? [
        ...summary.map((concept) => ({ id: concept.id, label: concept.label, value: amountOf(concept.value) })),
        ...(concluded ? [{ id: concluded.id, label: concluded.label, value: amountOf(concluded.value), concluded: true }] : []),
      ].filter((row): row is { id: string; label: string; value: number; concluded?: boolean } => row.value !== null)
    : [];
  return (
    <section className="pt-1 text-slate-800" data-conclusion-value-module>
      {summary.length ? (
        <table className="ml-auto w-[88%] border-separate border-spacing-y-[3px] text-[11px] font-bold" data-conclusion-summary-rows>
          <tbody>
            {summary.map((concept) => (
              <tr key={concept.id} className="bg-[var(--doc-pastel,#B4C6E7)] text-[color:var(--doc-ink-on-pastel,inherit)] [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
                <td className="px-2 py-0.5 text-right uppercase">{printedLabel(concept.label)}</td>
                <td className="w-[30%] py-0.5 pr-2 pl-3"><Amount value={concept.value} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {chartRows.length ? <ValueChart rows={chartRows} /> : null}
      {concluded ? (
        <div className="mx-auto mt-4 flex w-[80%] border border-[var(--caratula-blue)] text-[15px] font-bold [-webkit-print-color-adjust:exact] [print-color-adjust:exact]" data-concluded-value-box>
          <div className="flex-1 bg-[var(--caratula-blue)] px-3 py-1 text-right uppercase text-[color:var(--doc-on-strong,#fff)]" data-concluded-value-label>{printedLabel(concluded.label)}</div>
          <div className="w-[42%] bg-[var(--doc-zebra-strong,#E2E8F0)] px-3 py-1 text-slate-900"><Amount value={concluded.value} /></div>
        </div>
      ) : null}
      {words?.value.trim() ? (
        <p className="pt-2 text-center text-[11px] font-bold uppercase text-slate-700" data-concluded-value-words>{words.value}</p>
      ) : null}
    </section>
  );
}

const SIGNER_KEYS = new Set<string>([CONCLUSION_KEYS.signerName, CONCLUSION_KEYS.signerCedula]);
const isSignerConcept = (concept: Concept) => SIGNER_KEYS.has(keyOf(concept) ?? "");

/** FIRMAS of the conclusion: the block holding who signs. */
function isSignaturesBlock(block: Block) {
  return block.concepts.some(isSignerConcept);
}

/**
 * Who signs the conclusion: the carátula's signatures while the concepts are
 * linked to them; written by hand, what the appraiser wrote.
 */
function conclusionSignatures(block: Block, caratula: Pick<CaratulaFormData, "firmas">): ValuationSignature[] {
  const name = block.concepts.find((concept) => keyOf(concept) === CONCLUSION_KEYS.signerName);
  const cedula = block.concepts.find((concept) => keyOf(concept) === CONCLUSION_KEYS.signerCedula);
  if (!name?.calculationUnlinked && !cedula?.calculationUnlinked) return caratula.firmas;
  return [{ name: name?.value.trim() ?? "", cedula: cedula?.value.trim() ?? "", role: "" }];
}

/** The flow items of a block with a module of its own put right after its title (or first, without one). */
function withModule(items: DocumentFlowItem[], block: Block, module: DocumentFlowItem, at: "after-title" | "end"): DocumentFlowItem[] {
  if (at === "end") return [...items, { ...module, continuesPrevious: items.length ? true : undefined }];
  const title = items.findIndex((item) => item.id === `${block.id}:title`);
  return [...items.slice(0, title + 1), { ...module, continuesPrevious: title === -1 ? undefined : true }, ...items.slice(title + 1)];
}

/**
 * The printed items of a block of the conclusion section: the block of the
 * concluded value and FIRMAS print in the book's format; any other block, or
 * those without the carátula at hand, as any block.
 */
export function conclusionBlockFlowItems(
  block: Block,
  caratula: Pick<CaratulaFormData, "firmas"> | undefined,
  print: (block: Block) => DocumentFlowItem[],
): DocumentFlowItem[] {
  if (isConcludedValueBlock(block)) {
    const rest = block.concepts.filter((concept) => !isSummaryConcept(concept) && ![CONCLUSION_KEYS.value, CONCLUSION_KEYS.words].includes(keyOf(concept) as never));
    return withModule(print({ ...block, concepts: rest }), block, { id: `${block.id}:conclusion-value`, node: <ConclusionValueModule block={block} /> }, "after-title");
  }
  if (caratula && isSignaturesBlock(block)) {
    // Registro, Firma…: printed only when written; the line to sign is the signature's own.
    const rest = block.concepts.filter((concept) => !isSignerConcept(concept) && concept.value.trim());
    const signatures = <section className="break-inside-avoid pt-1" data-conclusion-signatures><SignatureLines signatures={conclusionSignatures(block, caratula)} /></section>;
    return withModule(print({ ...block, concepts: rest }), block, { id: `${block.id}:signatures`, node: signatures }, "end");
  }
  return print(block);
}

