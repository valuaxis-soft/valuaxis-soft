"use client";

/**
 * The conclusion as the despacho's book prints it (video 7.1, 16:52–19:23;
 * 24 Nov 2026): the resumen de valores as his Excel, an optional chart of the
 * values at its left, the concluded value in the carátula's box with the
 * amount in words, and the signatures of the carátula under FIRMAS.
 */
import type { Block, CaratulaFormData, Concept } from "../model";
import {
  CONCLUSION_KEYS,
  conceptCalculationKey,
  isConcludedValueBlock,
  isSummaryConcept,
} from "@/features/valuations/calculation/conclusion-document";
import type { ValuationSignature } from "@/features/valuations/services/valuation-signatures";
import { appraisedGoodWording } from "@/features/valuations/services/appraised-good-wording";
import { formatMoneyForDocument } from "@/features/valuations/services/concept-value-format";
import { ConcludedValueBox, SignatureLines } from "./caratula-preview-modules";
import type { DocumentFlowItem } from "./document-preview-page";

const keyOf = (concept: Concept) => conceptCalculationKey(concept);
const REAL_ESTATE_WORDING = appraisedGoodWording(null);
const REAL_ESTATE_CONCLUDED_LABEL = REAL_ESTATE_WORDING.concludedValueLabel.toLowerCase();
const REAL_ESTATE_COMMERCIAL_TITLE = REAL_ESTATE_WORDING.commercialValueTitle;
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

type ChartRow = { id: string; label: string; value: number };

/** What a bar is called under it: «VALOR POR ENFOQUE DE COSTOS» reads «COSTOS». */
export function chartLabel(label: string) {
  const short = label.trim().replace(/:$/, "").replace(/^valor\s+(estimado\s+)?(por|de)\s+(el\s+)?(enfoque\s+de\s+)?/i, "");
  return (short || label).toUpperCase();
}

/** A label in lines of about `width` letters, at most two: the second one ends in «…» when it does not fit. */
function labelLines(label: string, width = 14): string[] {
  const lines: string[] = [];
  for (const word of label.split(/\s+/)) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.length > 2 ? [lines[0], `${lines[1]}…`] : lines;
}

/** «$8,530,000»; with more than three bars, «$8.53 M» so the figures fit over them. */
const barFigure = (value: number, compact: boolean) =>
  compact ? `$${(value / 1_000_000).toLocaleString("es-MX", { maximumFractionDigits: 2 })} M` : `$${value.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

const CHART = { width: 240, height: 168, top: 18, bottom: 30, side: 8 };

/**
 * The chart of the values (V7.1-26; 24 Nov 2026: «una gráfica vertical… con
 * los tres valores… a un costado»): one vertical bar per value of the
 * resumen, small, at the left of the values. Drawn inline (SVG) in the
 * strong colour of the palette: it prints in the PDF with nothing to load.
 */
function ValueChart({ rows }: { rows: ChartRow[] }) {
  const max = Math.max(...rows.map((row) => row.value));
  if (!(max > 0)) return null;
  const plot = { left: CHART.side, right: CHART.width - CHART.side, top: CHART.top, bottom: CHART.height - CHART.bottom };
  const slot = (plot.right - plot.left) / rows.length;
  const barWidth = Math.min(44, slot * 0.58);
  const compact = rows.length > 3;
  return (
    <figure className="m-0 break-inside-avoid" data-conclusion-chart>
      <figcaption className="pb-0.5 text-center text-[9.5px] font-bold uppercase tracking-wide text-[color:var(--caratula-dark-blue,#00285A)]">Gráfica de valores</figcaption>
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="block h-auto w-full" role="img" aria-label="Gráfica de los valores del resumen">
        {rows.map((row, index) => {
          const height = Math.max(1, ((plot.bottom - plot.top) * Math.max(0, row.value)) / max);
          const center = plot.left + slot * index + slot / 2;
          return (
            <g key={row.id} data-chart-bar={row.label}>
              <rect x={center - barWidth / 2} y={plot.bottom - height} width={barWidth} height={height} rx={1.5} className="fill-[var(--caratula-dark-blue,#00285A)]" />
              <text x={center} y={plot.bottom - height - 4} textAnchor="middle" fontSize={8.5} fontWeight={700} className="fill-[#1A1A1A] tabular-nums">{barFigure(row.value, compact)}</text>
              <text x={center} y={plot.bottom + 11} textAnchor="middle" fontSize={7.5} fontWeight={700} className="fill-[#333333]">
                {labelLines(row.label).map((line, lineIndex) => <tspan key={lineIndex} x={center} dy={lineIndex ? 9 : 0}>{line}</tspan>)}
              </text>
            </g>
          );
        })}
        <line x1={plot.left} x2={plot.right} y1={plot.bottom + 0.5} y2={plot.bottom + 0.5} strokeWidth={1} className="stroke-[var(--doc-rule,#8EA9D1)]" />
      </svg>
    </figure>
  );
}

/** A label as it prints in the box: in capitals, without the colon the rows carry. */
const boxTitle = (label: string) => label.trim().replace(/:$/, "").toUpperCase();

/**
 * The title of the box: the name the appraiser gave the concluded value
 * (V7.3-28); the template's «Valor concluido» reads as the carátula's
 * «VALOR COMERCIAL DEL INMUEBLE» (24 Nov 2026).
 */
function concludedTitle(label: string) {
  return label.trim().toLowerCase() === REAL_ESTATE_CONCLUDED_LABEL ? REAL_ESTATE_COMMERCIAL_TITLE : boxTitle(label);
}

/** The concluded amount as the carátula prints it: «$8,260,000.00 M.N.»; a text written by hand as it is. */
function concludedAmount(concept: Concept) {
  const number = amountOf(concept.value);
  if (number === null) return concept.value.trim() || "—";
  return formatMoneyForDocument(number, { legalTender: concept.valueFormat !== "mxn" });
}

/**
 * The resumen de valores, the concluded value in its box and its amount in
 * words, from the concepts of the block (linked to the calculation or
 * written by hand), as the appraiser's Excel prints them (24 Nov 2026): each
 * name right-aligned on the pastel of the palette and its value in a white
 * box, «$» at the left; the chart, when chosen, at the left of the values;
 * and the concluded value in the box of the carátula.
 */
export function ConclusionValueModule({ block }: { block: Block }) {
  const concepts = block.concepts.filter(visible);
  const summary = concepts.filter(isSummaryConcept);
  const concluded = concepts.find((concept) => keyOf(concept) === CONCLUSION_KEYS.value);
  const words = concepts.find((concept) => keyOf(concept) === CONCLUSION_KEYS.words);
  const chartRows = block.valueChart
    ? summary
        .map((concept) => ({ id: concept.id, label: chartLabel(concept.label), value: amountOf(concept.value) }))
        .filter((row): row is ChartRow => row.value !== null)
    : [];
  const chart = chartRows.length ? <ValueChart rows={chartRows} /> : null;
  const values = summary.length ? (
    <table className="w-full border-separate border-spacing-x-[4px] border-spacing-y-[3px] text-[11px] font-bold" data-conclusion-summary-rows>
      <tbody>
        {summary.map((concept) => (
          <tr key={concept.id}>
            <td className="bg-[var(--doc-pastel,#BDD7EE)] px-2 py-0.5 text-right uppercase text-[color:var(--doc-ink-on-pastel,#1A1A1A)] [-webkit-print-color-adjust:exact] [print-color-adjust:exact]" data-summary-label>
              {printedLabel(concept.label)}
            </td>
            <td className="w-[34%] border border-[var(--caratula-dark-blue,#00285A)] bg-white px-2 py-0.5 text-slate-900" data-summary-value>
              <Amount value={concept.value} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : null;
  return (
    <section className="pt-1 text-slate-800" data-conclusion-value-module>
      {chart && values ? (
        <div className="grid grid-cols-[36%_minmax(0,1fr)] items-center gap-3 break-inside-avoid" data-conclusion-values-with-chart>
          {chart}
          {values}
        </div>
      ) : values ? (
        <div className="ml-auto w-[88%]">{values}</div>
      ) : chart ? (
        <div className="mx-auto w-[40%]">{chart}</div>
      ) : null}
      {concluded ? (
        <div className="mx-auto mt-4 w-[86%] break-inside-avoid">
          <ConcludedValueBox title={concludedTitle(concluded.label)} amount={concludedAmount(concluded)} words={words?.value.trim() ?? ""} />
        </div>
      ) : words?.value.trim() ? (
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

