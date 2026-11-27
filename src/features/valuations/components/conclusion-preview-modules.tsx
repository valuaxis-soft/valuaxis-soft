"use client";

/**
 * The conclusion as the despacho's book prints it (video 7.1, 16:52–19:23;
 * 24 Nov 2026): the resumen de valores as his Excel, an optional chart of the
 * values at its left, the concluded value in the carátula's box with the
 * amount in words, and the signatures of the carátula under FIRMAS.
 */
import type { Apartado, Block, CaratulaFormData, Concept, ValueChartStyle } from "../model";
import { resolveContentLayout } from "@/features/valuations/services/content-layout";
import { getBlockFlowApartadoOrder } from "@/features/valuations/services/visible-numbering";
import { titlePrints } from "@/features/valuations/services/block-title";
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
import { DocumentApartadoTitle, type ApartadoHead } from "./document-block-renderer";

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
const BAR_FILL = "fill-[var(--caratula-dark-blue,#00285A)]";

/** The bars lying down: the name at the left, the bar and its figure at its end. */
function HorizontalValueChart({ rows, max }: { rows: ChartRow[]; max: number }) {
  const row = 22;
  const labelWidth = 92;
  const height = rows.length * row + 6;
  const plot = { left: labelWidth, right: CHART.width - 58 };
  return (
    <svg viewBox={`0 0 ${CHART.width} ${height}`} className="block h-auto w-full" role="img" aria-label="Gráfica de los valores del resumen">
      {rows.map((item, index) => {
        const width = Math.max(1, ((plot.right - plot.left) * Math.max(0, item.value)) / max);
        const y = 3 + index * row;
        return (
          <g key={item.id} data-chart-bar={item.label}>
            <text x={labelWidth - 4} y={y + 12} textAnchor="end" fontSize={7.5} fontWeight={700} className="fill-[#333333]">{labelLines(item.label, 22)[0]}</text>
            <rect x={plot.left} y={y + 2} width={width} height={row - 8} rx={1.5} className={BAR_FILL} />
            <text x={plot.left + width + 3} y={y + 12} fontSize={8} fontWeight={700} className="fill-[#1A1A1A] tabular-nums">{barFigure(item.value, true)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The chart of the values (V7.1-26; 24 Nov 2026: «una gráfica vertical… con
 * los tres valores… a un costado»): one bar per value of the resumen, small.
 * Its style is the subbloque's (video 8.15, 3:10: «con alguna personalización,
 * estilo»): vertical bars, bars in relief, or horizontal bars. Drawn inline
 * (SVG) in the strong colour of the palette: it prints in the PDF with
 * nothing to load.
 */
function ValueChart({ rows, style = "bars", caption = true }: { rows: ChartRow[]; style?: ValueChartStyle; caption?: boolean }) {
  const max = Math.max(...rows.map((row) => row.value));
  if (!(max > 0)) return null;
  if (style === "horizontal") {
    return (
      <figure className="m-0 break-inside-avoid" data-conclusion-chart data-chart-style={style}>
        {caption ? <figcaption className="pb-0.5 text-center text-[9.5px] font-bold uppercase tracking-wide text-[color:var(--caratula-dark-blue,#00285A)]">Gráfica de valores</figcaption> : null}
        <HorizontalValueChart rows={rows} max={max} />
      </figure>
    );
  }
  const relief = style === "bars-3d";
  const plot = { left: CHART.side, right: CHART.width - CHART.side, top: CHART.top, bottom: CHART.height - CHART.bottom };
  const slot = (plot.right - plot.left) / rows.length;
  const barWidth = Math.min(44, slot * 0.58);
  const compact = rows.length > 3;
  // In relief: a face to the right and one on top, of the same colour in lighter tones.
  const depth = relief ? Math.min(8, barWidth * 0.25) : 0;
  return (
    <figure className="m-0 break-inside-avoid" data-conclusion-chart data-chart-style={style}>
      {caption ? <figcaption className="pb-0.5 text-center text-[9.5px] font-bold uppercase tracking-wide text-[color:var(--caratula-dark-blue,#00285A)]">Gráfica de valores</figcaption> : null}
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="block h-auto w-full" role="img" aria-label="Gráfica de los valores del resumen">
        {rows.map((row, index) => {
          const height = Math.max(1, ((plot.bottom - plot.top - depth) * Math.max(0, row.value)) / max);
          const center = plot.left + slot * index + slot / 2;
          const left = center - barWidth / 2;
          const top = plot.bottom - height;
          return (
            <g key={row.id} data-chart-bar={row.label}>
              <rect x={left} y={top} width={barWidth} height={height} rx={relief ? 0 : 1.5} className={BAR_FILL} />
              {relief ? (
                <>
                  <polygon points={`${left + barWidth},${top} ${left + barWidth + depth},${top - depth} ${left + barWidth + depth},${plot.bottom - depth} ${left + barWidth},${plot.bottom}`} className={BAR_FILL} opacity={0.7} />
                  <polygon points={`${left},${top} ${left + depth},${top - depth} ${left + barWidth + depth},${top - depth} ${left + barWidth},${top}`} className={BAR_FILL} opacity={0.45} />
                </>
              ) : null}
              <text x={center + depth / 2} y={top - depth - 4} textAnchor="middle" fontSize={8.5} fontWeight={700} className="fill-[#1A1A1A] tabular-nums">{barFigure(row.value, compact)}</text>
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

/** The rows of the resumen that the chart draws: those with an amount, in the order they print. */
function chartRowsOf(summary: Concept[]): ChartRow[] {
  return summary
    .map((concept) => ({ id: concept.id, label: chartLabel(concept.label), value: amountOf(concept.value) }))
    .filter((row): row is ChartRow => row.value !== null);
}

/** The resumen de valores as the appraiser's Excel prints it: each name on the pastel of the palette and its value in a white box. */
function SummaryValues({ summary }: { summary: Concept[] }) {
  return (
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
  );
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
  const chartRows = block.valueChart ? chartRowsOf(summary) : [];
  const chart = chartRows.length ? <ValueChart rows={chartRows} /> : null;
  const values = summary.length ? <SummaryValues summary={summary} /> : null;
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
  return [{ name: name?.value.trim() ?? "", cedula: cedula?.value.trim() ?? "", role: "", specialty: "" }];
}

/** The flow items of a block with a module of its own put right after its title (or first, without one). */
function withModule(items: DocumentFlowItem[], block: Block, module: DocumentFlowItem, at: "after-title" | "end"): DocumentFlowItem[] {
  if (at === "end") return [...items, { ...module, continuesPrevious: items.length ? true : undefined }];
  const title = items.findIndex((item) => item.id === `${block.id}:title`);
  return [...items.slice(0, title + 1), { ...module, continuesPrevious: title === -1 ? undefined : true }, ...items.slice(title + 1)];
}

/** The apartado's title as any apartado prints it, unless «Imprimir título» is off. */
function apartadoTitle(subBlock: Apartado, displayLabel: string) {
  if (!titlePrints(subBlock)) return null;
  return <DocumentApartadoTitle>{[displayLabel, subBlock.title].filter(Boolean).join(" ")}</DocumentApartadoTitle>;
}

/**
 * The concepts of a container in the order the editor shows them (its rows,
 * left to right), as they were moved there (video 8.14, 53:13: moving them
 * changed nothing in the dictamen).
 */
function inEditorOrder(container: Pick<Apartado, "concepts" | "tables" | "images" | "contentLayout">, concepts: Concept[]): Concept[] {
  const place = new Map(resolveContentLayout(container).rows
    .flatMap((row) => row.columns.flatMap((column) => column.items))
    .filter((item) => item.type === "concept")
    .map((item, index) => [item.id, index] as const));
  return [...concepts].sort((left, right) => (place.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (place.get(right.id) ?? Number.MAX_SAFE_INTEGER));
}

/** The content rows of a subbloque left after the concepts its format prints itself. */
function restRows(subBlock: Apartado, printsItself: (concept: Concept) => boolean) {
  return resolveContentLayout({ ...subBlock, concepts: subBlock.concepts.filter((concept) => !printsItself(concept)) }).rows;
}

const isValueConcept = (concept: Concept) => [CONCLUSION_KEYS.value, CONCLUSION_KEYS.words].includes(keyOf(concept) as never);

/**
 * The subbloques of the conclusion as the appraiser's Excel (video 8.15,
 * 27 Nov 2026), each moved, hidden and titled as any subbloque: the resumen
 * de valores (its rows in the pastel and white boxes), the chart of the
 * values (in the subbloque's style), the concluded value in the carátula's
 * box with its amount in words, and the signature. What else a subbloque
 * holds prints after it, as in any subbloque. Null for any other subbloque.
 */
function conclusionApartadoHead(block: Block, caratula: Pick<CaratulaFormData, "firmas"> | undefined) {
  // The chart draws the resumen of the block, wherever its subbloque is.
  const summaryOfBlock = [block, ...block.apartados.filter((apartado) => apartado.enabled !== false)]
    .flatMap((container) => inEditorOrder(container, container.concepts.filter(visible).filter(isSummaryConcept)));
  // The subbloques that print, in order: the concluded value keeps with the signature that follows it.
  const printed = getBlockFlowApartadoOrder(block).filter((apartado) => apartado.enabled !== false);
  const signsNext = (subBlock: Apartado) => {
    const next = printed[printed.findIndex((apartado) => apartado.id === subBlock.id) + 1];
    return Boolean(caratula && next?.concepts.filter(visible).some(isSignerConcept));
  };
  return (subBlock: Apartado, displayLabel: string): ApartadoHead | null => {
    const concepts = subBlock.concepts.filter(visible);
    const title = apartadoTitle(subBlock, displayLabel);
    if (subBlock.valueChart) {
      const rows = chartRowsOf(summaryOfBlock);
      return {
        node: (
          <section className="break-inside-avoid" data-conclusion-chart-subblock>
            {title}
            {rows.length ? <div className="mx-auto w-[46%] pt-1"><ValueChart rows={rows} style={subBlock.valueChartStyle} caption={!title} /></div> : null}
          </section>
        ),
        rows: restRows(subBlock, () => false),
      };
    }
    const concluded = concepts.find((concept) => keyOf(concept) === CONCLUSION_KEYS.value);
    const summary = inEditorOrder(subBlock, concepts.filter(isSummaryConcept));
    if (concluded || summary.length) {
      const words = concepts.find((concept) => keyOf(concept) === CONCLUSION_KEYS.words);
      return {
        node: (
          <section className="break-inside-avoid pt-1 text-slate-800" data-conclusion-value-module>
            {title}
            {summary.length ? <div className="ml-auto w-[88%]"><SummaryValues summary={summary} /></div> : null}
            {concluded ? (
              <div className="mx-auto mt-3 w-[86%] break-inside-avoid">
                <ConcludedValueBox title={concludedTitle(concluded.label)} amount={concludedAmount(concluded)} words={words?.value.trim() ?? ""} />
              </div>
            ) : null}
          </section>
        ),
        rows: restRows(subBlock, (concept) => isSummaryConcept(concept) || (Boolean(concluded) && isValueConcept(concept))),
        // Video 8.15: the signature never opens a page alone; when it does not fit under the value, the value goes with it.
        keepWithNext: Boolean(concluded) && signsNext(subBlock),
      };
    }
    if (caratula && concepts.some(isSignerConcept)) {
      const signatures = conclusionSignatures({ ...block, concepts: subBlock.concepts }, caratula);
      return {
        // No room of its own above or below: the gap to the value is the flow's, so it stays on the value's page when it fits (video 8.15).
        node: <section className="break-inside-avoid" data-conclusion-signatures>{title}<SignatureLines signatures={signatures} trailingRoom={false} /></section>,
        // Registro, Firma…: printed only when written; the line to sign is the signature's own.
        rows: restRows(subBlock, (concept) => isSignerConcept(concept) || !concept.value.trim()),
      };
    }
    return null;
  };
}

/**
 * The printed items of a block of the conclusion section: the block of the
 * concluded value and FIRMAS print in the book's format, as its subbloques
 * do (conclusionApartadoHead); any other block, or those without the
 * carátula at hand, as any block.
 */
export function conclusionBlockFlowItems(
  block: Block,
  caratula: Pick<CaratulaFormData, "firmas"> | undefined,
  print: (block: Block, options?: { renderApartadoHead?: (subBlock: Apartado, displayLabel: string) => ApartadoHead | null }) => DocumentFlowItem[],
): DocumentFlowItem[] {
  const renderApartadoHead = conclusionApartadoHead(block, caratula);
  if (isConcludedValueBlock(block)) {
    const rest = block.concepts.filter((concept) => !isSummaryConcept(concept) && !isValueConcept(concept));
    return withModule(print({ ...block, concepts: rest }, { renderApartadoHead }), block, { id: `${block.id}:conclusion-value`, node: <ConclusionValueModule block={block} /> }, "after-title");
  }
  if (caratula && isSignaturesBlock(block)) {
    // Registro, Firma…: printed only when written; the line to sign is the signature's own.
    const rest = block.concepts.filter((concept) => !isSignerConcept(concept) && concept.value.trim());
    const signatures = <section className="break-inside-avoid" data-conclusion-signatures><SignatureLines signatures={conclusionSignatures(block, caratula)} trailingRoom={false} /></section>;
    return withModule(print({ ...block, concepts: rest }, { renderApartadoHead }), block, { id: `${block.id}:signatures`, node: signatures }, "end");
  }
  return print(block, { renderApartadoHead });
}

