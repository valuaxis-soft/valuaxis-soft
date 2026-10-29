import type { CSSProperties, ReactNode } from "react";

import type { CaratulaFormData, ImageContent, Letterhead } from "../../model";
import type { ComparableCardDto } from "../../calculation/comparable-card.service";
import { memoryChapters, type CalculationMemory, type MemoryApproach, type MemoryConcept, type MemoryTable } from "../../memory/calculation-memory";
import { formatDateValue } from "../../services/concept-value-format";
import { ComparableCardView } from "../calculation/comparable-card-view";
import { DocumentPreviewHeader } from "../document-preview-header";
import { UnaccreditedNotice } from "@/features/accreditation/components/unaccredited-notice";

/** The dictamen's blues, so the header prints as in the dictamen. */
const HEADER_COLORS = { "--caratula-blue": "#003B73", "--caratula-dark-blue": "#00285A" } as CSSProperties;

/** Values computed by a formula print in this blue; typed values in black. */
const COMPUTED = "text-[#1d4ed8]";

const generatedAtText = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

/** Consecutive items with the same place go under one heading. */
function byLocation<T extends { location: string[] }>(items: T[]) {
  const groups: Array<{ heading: string; items: T[] }> = [];
  for (const item of items) {
    const heading = item.location.join(" › ");
    const last = groups.at(-1);
    if (last?.heading === heading) last.items.push(item);
    else groups.push({ heading, items: [item] });
  }
  return groups;
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 break-after-avoid text-[10.5px] font-bold uppercase tracking-wide text-slate-700">{children}</h3>;
}

/** The explanation of a table or a calculation, apart from it: a tinted box with its own caption. */
function Explanation({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-2 rounded-sm border-l-4 border-[var(--caratula-blue)] bg-slate-50 px-2 py-1.5" data-memory-explanation>
      <p className="mb-1 text-[9px] font-bold tracking-wide text-[var(--caratula-blue)] uppercase">{title}</p>
      {children}
    </div>
  );
}

/** The caption over a table of the memory, so it reads apart from the text before it. */
function TableCaption({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-[9px] font-bold tracking-wide text-slate-600 uppercase">{children}</p>;
}

function Formula({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <code className={`font-mono text-[8.5px] leading-tight [overflow-wrap:anywhere] text-slate-600 ${className}`}>{children}</code>;
}

function Cover({ memory }: { memory: CalculationMemory }) {
  const rows: Array<[string, string]> = [
    ["Folio", memory.folio || "—"],
    ["Fecha del avalúo", formatDateValue(memory.valuationDate, "normal") || "—"],
    ["Despacho", memory.firmName || "—"],
    ["Estado", memory.concluded ? "Concluido (versión final, de solo lectura)" : "En proceso (versión de trabajo)"],
    ["Versión del motor de cálculo", memory.engineVersion],
    ["Generada", generatedAtText(memory.generatedAt)],
  ];
  return (
    <section data-memory-item className="mb-5 break-inside-avoid">
      <dl className="grid grid-cols-[180px_minmax(0,1fr)] border border-slate-300 text-[10.5px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="border-b border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">{label}</dt>
            <dd className="border-b border-slate-200 px-2 py-1">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[9.5px] leading-snug text-slate-600">
        Anexo técnico del dictamen: muestra cómo se obtuvo cada valor calculado. Los valores en{" "}
        <strong className={COMPUTED}>azul</strong> se calculan con una fórmula; los valores en <strong>negro</strong> se capturaron
        directamente. Las tablas llevan las letras de columna y los números de renglón del editor, para seguir referencias como
        G1·F1. Los cálculos del motor se reproducen paso a paso, en el orden en que se calculan, con lo que el avalúo tiene guardado.
      </p>
    </section>
  );
}

function FormulaTable({ table }: { table: MemoryTable }) {
  const developed = table.rows.flatMap((row) => row.cells).filter((cell) => cell.computed && cell.withValues);
  return (
    <div data-memory-item className="mb-5">
      <TableCaption>Tabla: {table.title}</TableCaption>
      <table className="w-full border-collapse text-[9px] leading-tight">
        <thead>
          <tr className="bg-slate-100 text-slate-600">
            <th className="w-6 border border-slate-300 px-1 py-0.5" />
            {table.columns.map((column) => (
              <th key={column.letter} className="border border-slate-300 px-1 py-0.5 text-center font-bold">{column.letter}</th>
            ))}
          </tr>
          <tr className="bg-slate-50">
            <th className="border border-slate-300 px-1 py-0.5" />
            {table.columns.map((column) => (
              <th key={column.letter} className="border border-slate-300 px-1 py-0.5 text-left font-semibold">{column.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.number} className="break-inside-avoid">
              <th className="border border-slate-300 bg-slate-100 px-1 py-0.5 text-center font-bold text-slate-600">{row.number}</th>
              {row.cells.map((cell) => (
                <td key={cell.address} className="border border-slate-300 px-1 py-0.5 align-top" data-cell={cell.address} data-computed={cell.computed || undefined}>
                  <span className={cell.computed ? `font-semibold ${COMPUTED}` : "text-black"}>{cell.text}</span>
                  {cell.formula ? <Formula className="block">{cell.formula}</Formula> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {developed.length ? (
        <Explanation title="Desarrollo de las fórmulas de la tabla">
          <ul className="space-y-0.5 text-[9px]">
            {developed.map((cell) => (
              <li key={cell.address} className="break-inside-avoid">
                <strong className="inline-block w-9 text-slate-700">{cell.address}</strong>
                <Formula>{cell.formula}</Formula> <span className="text-slate-400">→</span> <Formula>{cell.withValues}</Formula>{" "}
                <span className="text-slate-400">=</span> <span className={`font-semibold ${COMPUTED}`}>{cell.text}</span>
              </li>
            ))}
          </ul>
        </Explanation>
      ) : null}
    </div>
  );
}

function FormulaConcepts({ concepts }: { concepts: MemoryConcept[] }) {
  return (
    <div data-memory-item className="mb-5">
    <TableCaption>Conceptos calculados con fórmula</TableCaption>
    <table className="w-full border-collapse text-[9.5px] leading-tight">
      <thead>
        <tr className="bg-slate-100 text-left text-slate-700">
          <th className="w-[30%] border border-slate-300 px-1.5 py-0.5">Concepto</th>
          <th className="w-[38%] border border-slate-300 px-1.5 py-0.5">Fórmula</th>
          <th className="border border-slate-300 px-1.5 py-0.5">Valor</th>
        </tr>
      </thead>
      <tbody>
        {concepts.map((concept) => (
          <tr key={concept.id} className="break-inside-avoid">
            <td className="border border-slate-300 px-1.5 py-0.5 align-top">{concept.label}</td>
            <td className="border border-slate-300 px-1.5 py-0.5 align-top">
              <Formula className="block">{concept.formula}</Formula>
              {concept.withValues ? <Formula className="block text-slate-500">{concept.withValues}</Formula> : null}
            </td>
            <td className={`border border-slate-300 px-1.5 py-0.5 align-top font-semibold ${COMPUTED}`}>{concept.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function Approach({ approach, engineVersion }: { approach: MemoryApproach; engineVersion: string }) {
  return (
    <section data-memory-item className="mb-6">
      <Heading>{approach.title}</Heading>
      {approach.storedVersion && approach.storedVersion !== engineVersion ? (
        <p className="mb-1 text-[9px] text-amber-800">
          Lo guardado se calculó con el motor {approach.storedVersion}; aquí se reproduce con {engineVersion}.
        </p>
      ) : null}
      {approach.differs ? (
        <p className="mb-1 text-[9px] font-semibold text-red-700">
          Algún paso no coincide con el valor guardado; se indica en el renglón. Abre el avalúo para recalcularlo.
        </p>
      ) : null}
      {approach.pending ? <p className="text-[9.5px] text-slate-600">Sin cálculo: {approach.pending}</p> : null}
      {approach.captured.length ? (
        <div className="mb-3 rounded-sm border border-slate-200 px-2 py-1.5 text-[9px]">
          <p className="mb-1 text-[9px] font-bold tracking-wide text-slate-600 uppercase">Valores capturados con fórmula</p>
          <ul className="space-y-0.5">
            {approach.captured.map((item, index) => (
              <li key={`${item.label}-${index}`} data-captured-formula={item.formula}>
                {item.label}: <Formula>{item.formula}</Formula> <span className="text-slate-400">=</span>{" "}
                <span className={`font-semibold ${COMPUTED}`}>{item.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {approach.steps.length ? (
        <>
        <TableCaption>Cálculo paso a paso</TableCaption>
        <table className="w-full border-collapse text-[9px] leading-tight">
          <thead>
            <tr className="bg-slate-100 text-left text-slate-700">
              <th className="w-6 border border-slate-300 px-1 py-0.5 text-center">#</th>
              <th className="w-[24%] border border-slate-300 px-1.5 py-0.5">Concepto</th>
              <th className="w-[26%] border border-slate-300 px-1.5 py-0.5">Fórmula</th>
              <th className="border border-slate-300 px-1.5 py-0.5">Datos</th>
              <th className="w-[15%] border border-slate-300 px-1.5 py-0.5 text-right">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {approach.steps.map((step, index) => (
              <tr key={`${step.key}-${index}`} className="break-inside-avoid" data-step={step.key}>
                <td className="border border-slate-300 px-1 py-0.5 text-center align-top text-slate-500">{index + 1}</td>
                <td className="border border-slate-300 px-1.5 py-0.5 align-top">{step.label}</td>
                <td className="border border-slate-300 px-1.5 py-0.5 align-top">
                  <Formula>{step.formula}</Formula>
                  {step.rounding !== undefined ? <span className="block text-[8px] text-slate-500">Redondeo a {step.rounding} dígitos (REDONDEAR de Excel)</span> : null}
                </td>
                <td className="border border-slate-300 px-1.5 py-0.5 align-top">
                  {step.inputs.map((item) => (
                    <span key={item.name} className="block">
                      {item.name}: <span className="text-black">{item.value}</span>
                    </span>
                  ))}
                </td>
                <td className="border border-slate-300 px-1.5 py-0.5 text-right align-top">
                  <span className={`font-semibold ${COMPUTED}`}>{step.value}</span>
                  {step.storedValue ? <span className="block text-[8px] text-red-700">Guardado: {step.storedValue}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      ) : null}
    </section>
  );
}

/** "Memoria técnica de comparables": the sheet of each comparable used, with its photos and an active link to its listing. */
function ComparableSheets({ comparables }: { comparables: ComparableCardDto[] }) {
  if (!comparables.length) return null;
  return (
    <section className="mt-4 break-before-page" data-memory-comparables>
      <h2 className="mb-1 border-b border-slate-300 pb-0.5 text-[12px] font-black text-[var(--caratula-blue)]">Memoria técnica de comparables</h2>
      <p className="mb-3 text-[9.5px] text-slate-600">
        La ficha de cada comparable que usa el avalúo, con los datos capturados, sus fotografías y su fuente. La liga del anuncio queda activa en el PDF.
      </p>
      <div className="grid gap-6">
        {comparables.map((card) => (
          <div key={card.comparable.id} data-memory-item className="text-[10px]">
            <ComparableCardView card={card} printable />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The calculation memory as it prints: the dictamen's header with the firm's
 * data repeated on every page (the header row of a table repeats in print),
 * the cover data, the formulas of the document and the engine's steps.
 */
export function CalculationMemoryDocument({
  caratula,
  comparables = [],
  headerImage,
  letterhead,
  memory,
  propertyKind,
  unaccreditedNotice = false,
}: {
  caratula: CaratulaFormData;
  headerImage: ImageContent | null;
  letterhead: Letterhead;
  memory: CalculationMemory;
  propertyKind: string | null;
  /** The sheets of the comparables used, for the memoria técnica de comparables. */
  comparables?: ComparableCardDto[];
  /** The issuer is not accredited: the memory opens with "DOCUMENTO SIN VALIDEZ OFICIAL" (docs/ACREDITACION.md). */
  unaccreditedNotice?: boolean;
}) {
  const chapters = memoryChapters(memory);
  return (
    <main data-print-memory className="py-8 print:p-0" style={HEADER_COLORS}>
      <style>{"@page { size: letter; margin: 10mm 12mm 14mm; } @media print { [data-print-memory] thead.memory-page-header { display: table-header-group; } }"}</style>
      <table className="mx-auto w-full max-w-[816px] bg-white text-black shadow-sm print:max-w-none print:shadow-none">
        <thead className="memory-page-header">
          <tr>
            <td>
              <DocumentPreviewHeader caratula={caratula} letterhead={letterhead} headerImage={headerImage} propertyKind={propertyKind} />
              <p className="mx-5 mt-1 border-b-2 border-[var(--caratula-dark-blue)] pb-0.5 text-center text-sm font-black tracking-wide text-[var(--caratula-dark-blue)] sm:mx-8">
                MEMORIA DE CÁLCULO
              </p>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-5 pt-4 pb-8 sm:px-8">
              {unaccreditedNotice ? <div className="mb-3"><UnaccreditedNotice location="memoria-calculo" /></div> : null}
              <Cover memory={memory} />

              {chapters.length ? (
                chapters.map((chapter) => (
                  <section key={chapter.heading} className="mb-4" data-memory-chapter={chapter.heading}>
                    <h2 className="mb-2 border-b border-slate-300 pb-0.5 text-[12px] font-black text-[var(--caratula-blue)]">
                      {chapter.heading}
                    </h2>
                    {byLocation(chapter.document).map((group, groupIndex) => {
                      const concepts = group.items.filter((item): item is MemoryConcept => item.kind === "concept");
                      const subheading = group.items[0]?.location.slice(1, group.items[0].kind === "table" ? -1 : undefined).join(" › ");
                      return (
                        <div key={`${group.heading}-${groupIndex}`} className="mb-2">
                          {subheading ? <Heading>{subheading}</Heading> : null}
                          {concepts.length ? <FormulaConcepts concepts={concepts} /> : null}
                          {group.items.filter((item): item is MemoryTable => item.kind === "table").map((table) => <FormulaTable key={table.id} table={table} />)}
                        </div>
                      );
                    })}
                    {chapter.approaches.map((approach) => <Approach key={approach.key} approach={approach} engineVersion={memory.engineVersion} />)}
                  </section>
                ))
              ) : (
                <p data-memory-item className="mb-4 text-[10px] text-slate-600">El avalúo todavía no tiene tablas con fórmulas ni enfoques calculados.</p>
              )}

              <ComparableSheets comparables={comparables} />
            </td>
          </tr>
        </tbody>
      </table>
    </main>
  );
}
