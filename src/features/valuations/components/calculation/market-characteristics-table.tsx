"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Link2, Plus, RotateCcw, Ruler, Hash, X } from "lucide-react";
import type { MouseEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useNumberPresentation } from "@/features/valuations/components/number-presentation-context";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { isFormulaText } from "@/features/valuations/services/formula-references";
import {
  MAX_CHARACTERISTIC_FIELDS,
  characteristicText,
  characteristicValueText,
  duplicateCharacteristicLabel,
  isBuiltinCharacteristic,
  isNumericCharacteristic,
  nextCharacteristicLabel,
  withCharacteristic,
  type CharacteristicField,
  type CharacteristicKind,
  type ComparableDto,
} from "@/features/valuations/calculation/market-types";
import { cn } from "@/lib/utils";
import { CalcTableContextMenu } from "./calc-table-context-menu";
import { CALC_CELL, CALC_HEAD, CALC_HEAD_CELL, CALC_ROW, CALC_TABLE, CALC_TABLE_FRAME } from "./calculation-table-style";
import { CommitCell } from "./commit-cell";
import { SortableRows, keepUnderPointer, useSortableRow } from "./sortable-rows";

/** A key for a field the appraiser adds: short, and unlike any other in the list. */
export const newFieldKey = (index = 0) => `custom:${Date.now().toString(36)}${index ? `-${index}` : ""}`;

const grouped = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 4 });

/** A number of a characteristic as the document writes its numbers: "1,800,000" with the separator, "1800000" without. */
export function characteristicNumberText(text: string, thousandsSeparator: boolean) {
  const plain = text.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(plain)) return text;
  return thousandsSeparator ? grouped.format(Number(plain)) : plain;
}

/** What a subject's cell reads as a figure: a formula shows its result, as a comparable's does. */
function subjectFigureText(text: string) {
  if (!isFormulaText(text)) return text;
  const value = parseDecimal(text);
  return value === null ? text : String(value);
}

/** Changes to the list, applied to the list as it is when they arrive, never to the one of an earlier render (V7.2-11). */
export type FieldsUpdate = (fields: CharacteristicField[]) => CharacteristicField[] | null;
export type SubjectUpdate = (subject: Record<string, string>) => Record<string, string>;

const ADD_KINDS: Array<{ kind: CharacteristicKind | undefined; label: string; title: string }> = [
  { kind: undefined, label: "Agregar característica", title: "Un texto: vista, proyecto, ubicación…" },
  { kind: "area", label: "Agregar superficie", title: "Una superficie con su nombre, en m²: común, amenidades, cajones…" },
  { kind: "number", label: "Agregar dato numérico", title: "Un número: cajones, niveles, recámaras…" },
];

/**
 * The characteristics of the comparables, beside the subject's: a row per
 * field (the appraiser renames, reorders by dragging or with the arrows,
 * hides, removes or adds them, up to thirty) and a column per comparable.
 * The dictamen prints each comparable's line with the fields shown, in this
 * order, unless a free text is written for it; a hidden field keeps what was
 * captured and prints nothing. While the subject's cell is empty it shows
 * what the valuation already has (V7.1-13), linked and muted.
 */
export function MarketCharacteristicsTable(props: {
  fields: CharacteristicField[];
  /** The list is the format's own, not one the appraiser changed. */
  defaults: boolean;
  comparables: ComparableDto[];
  subject: Record<string, string>;
  /** What the valuation has captured of the subject, by field key, with where it comes from. */
  subjectDefaults?: Record<string, { value: string; source: string }>;
  /** Names the subject's cells among the fields of the document, for formulas: one per market. */
  formulaScope?: string;
  readOnly: boolean;
  onFields: (update: FieldsUpdate) => void;
  onSubject: (update: SubjectUpdate) => void;
  onComparable: (comparable: ComparableDto, change: (current: ComparableDto) => ComparableDto) => void;
}) {
  const { fields, comparables, readOnly } = props;
  const { thousandsSeparator } = useNumberPresentation();
  const full = fields.length >= MAX_CHARACTERISTIC_FIELDS;

  // Each change names its field by key: the list may have moved since this render.
  const rename = (key: string) => (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const index = fields.findIndex((field) => field.key === key);
    const repeated = duplicateCharacteristicLabel(fields, trimmed, index);
    if (repeated) toast.warning(`Ya hay una característica llamada «${repeated.label}». Las dos se imprimen con el mismo nombre.`);
    props.onFields((current) => current.map((field) => (field.key === key ? { ...field, label: trimmed } : field)));
  };
  const move = (key: string, by: -1 | 1, event: MouseEvent<HTMLButtonElement>) => {
    const row = event.currentTarget.closest("tr");
    keepUnderPointer(`[data-characteristic="${CSS.escape(key)}"]`, event.detail > 0 && row ? row.getBoundingClientRect() : null);
    props.onFields((current) => {
      const index = current.findIndex((field) => field.key === key);
      if (index < 0 || index + by < 0 || index + by >= current.length) return current;
      const next = [...current];
      const [field] = next.splice(index, 1);
      next.splice(index + by, 0, field);
      return next;
    });
  };
  const reorder = (keys: string[]) => props.onFields((current) => {
    const byKey = new Map(current.map((field) => [field.key, field]));
    const moved = keys.map((key) => byKey.get(key)).filter((field): field is CharacteristicField => field !== undefined);
    // A field added meanwhile keeps its place at the end.
    return [...moved, ...current.filter((field) => !keys.includes(field.key))];
  });
  const toggleHidden = (key: string) => props.onFields((current) => current.map((field) => {
    if (field.key !== key) return field;
    const { hidden: _hidden, ...rest } = field;
    return field.hidden ? rest : { ...rest, hidden: true };
  }));
  const add = (kind: CharacteristicKind | undefined) => {
    if (full) {
      toast.info(`Hasta ${MAX_CHARACTERISTIC_FIELDS} características por mercado: quita u oculta alguna para agregar otra.`);
      return;
    }
    props.onFields((current) => (current.length >= MAX_CHARACTERISTIC_FIELDS ? current : [
      ...current,
      { key: newFieldKey(), label: kind === "area" ? nextLabel(current, "Superficie") : nextCharacteristicLabel(current), ...(kind ? { kind } : {}) },
    ]));
  };
  const setSubject = (key: string) => (text: string) => props.onSubject((current) => {
    const { [key]: _previous, ...rest } = current;
    return text.trim() ? { ...rest, [key]: text.trim() } : rest;
  });
  const numberText = (text: string) => characteristicNumberText(text, thousandsSeparator);
  const linked = props.subjectDefaults ?? {};
  const anyLinked = fields.some((field) => !props.subject[field.key] && linked[field.key]);

  return (
    <div className="grid gap-1.5">
      {/* The data centered and a rule between every column, as the appraiser's format (video 5.4). */}
      <SortableRows ids={fields.map((field) => field.key)} onMove={reorder}>
        <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly={readOnly}>
          <table className={cn(CALC_TABLE, "w-full min-w-[640px] text-sm")} aria-label="Características de los comparables">
            <thead className={CALC_HEAD}>
              <tr>
                <th className={cn(CALC_HEAD_CELL, "min-w-40 text-left")}>Característica</th>
                <th className={cn(CALC_HEAD_CELL, "min-w-28")}>Sujeto</th>
                {comparables.map((comparable) => (
                  <th key={comparable.id} className={cn(CALC_HEAD_CELL, "min-w-28")}>Comparable {comparable.reference}</th>
                ))}
                <th className={CALC_HEAD_CELL}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <CharacteristicRow
                  key={field.key}
                  field={field}
                  first={index === 0}
                  last={index === fields.length - 1}
                  readOnly={readOnly}
                  comparables={comparables}
                  subject={props.subject[field.key] ?? ""}
                  linked={linked[field.key]}
                  formulaScope={props.formulaScope}
                  numberText={numberText}
                  onRename={rename(field.key)}
                  onSubject={setSubject(field.key)}
                  onComparable={props.onComparable}
                  onMove={(by, event) => move(field.key, by, event)}
                  onToggleHidden={() => toggleHidden(field.key)}
                  onRemove={() => props.onFields((current) => current.filter((item) => item.key !== field.key))}
                />
              ))}
              <tr className={cn(CALC_ROW, "bg-muted/20")}>
                <td className={cn(CALC_CELL, "px-2 py-1.5 text-xs font-medium")}>Texto libre</td>
                <td className={cn(CALC_CELL, "px-2 py-1.5 text-center text-xs text-muted-foreground")}>En lugar de la línea de características</td>
                {comparables.map((comparable) => (
                  <td key={comparable.id} className={cn(CALC_CELL, "px-1 py-1")}>
                    <CommitCell
                      ariaLabel={`Texto libre de características, comparable ${comparable.reference}`}
                      disabled={readOnly}
                      placeholder="Opcional"
                      // It replaces the whole line of characteristics: «Copiar valor a toda la columna» leaves it alone.
                      noFill
                      value={comparable.characteristicsText ?? ""}
                      onCommit={(text) => props.onComparable(comparable, (current) => ({ ...current, characteristicsText: text.trim() || null }))}
                    />
                  </td>
                ))}
                <td className={CALC_CELL} />
              </tr>
            </tbody>
          </table>
        </CalcTableContextMenu>
      </SortableRows>
      {anyLinked ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground" data-subject-linked-note="">
          <Link2 className="size-3.5 shrink-0" aria-hidden />
          En gris, el dato del sujeto que ya capturaste en el avalúo (pasa el puntero para ver de dónde). Cambia solo si cambias ese dato; si escribes otro valor, se queda el tuyo.
        </p>
      ) : null}
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          {ADD_KINDS.map((item) => (
            <Button key={item.label} type="button" size="sm" variant="outline" disabled={full} title={full ? `Hasta ${MAX_CHARACTERISTIC_FIELDS} características` : item.title} onClick={() => add(item.kind)}>
              {item.kind === "area" ? <Ruler data-icon="inline-start" /> : item.kind === "number" ? <Hash data-icon="inline-start" /> : <Plus data-icon="inline-start" />} {item.label}
            </Button>
          ))}
          {!props.defaults ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => props.onFields(() => null)}>
              <RotateCcw data-icon="inline-start" /> Volver a las del formato
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            Escribe el nombre como quieres que se imprima; arrastra el asa para cambiar el orden. El sujeto es para comparar; el dictamen imprime la línea de cada comparable.
            {full ? ` Hasta ${MAX_CHARACTERISTIC_FIELDS} características.` : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** "Superficie", then "Superficie 2", 3… */
function nextLabel(fields: ReadonlyArray<CharacteristicField>, base: string) {
  const taken = new Set(fields.map((field) => field.label.trim().toLocaleLowerCase("es-MX")));
  if (!taken.has(base.toLocaleLowerCase("es-MX"))) return base;
  let number = 2;
  while (taken.has(`${base} ${number}`.toLocaleLowerCase("es-MX"))) number += 1;
  return `${base} ${number}`;
}

/**
 * A characteristic of a comparable, typed in its cell: in the characteristics
 * sheet, and in the cell of the table of the dictamen that prints it (its
 * surface and its offer, its land use). The same datum and the same formulas
 * (`comparable:<id>:<key>`) wherever it is typed.
 */
export function ComparableCharacteristicCell(props: {
  comparable: ComparableDto;
  field: CharacteristicField;
  readOnly: boolean;
  numberText: (text: string) => string;
  className?: string;
  /** Where the cell sits, when the same datum has a cell in two places: its formula field must be one of a kind. */
  place?: string;
  onComparable: (comparable: ComparableDto, change: (current: ComparableDto) => ComparableDto) => void;
}) {
  const { comparable, field } = props;
  const numeric = isNumericCharacteristic(field);
  // The form's numbers keep their formulas apart; an added figure keeps the number a formula gives.
  const builtinNumber = numeric && isBuiltinCharacteristic(field.key);
  return (
    <CommitCell
      ariaLabel={`${field.label}, comparable ${comparable.reference}`}
      className={props.className}
      disabled={props.readOnly}
      numeric={numeric}
      formulaKey={builtinNumber ? `comparable:${comparable.id}:${field.key}${props.place ? `:${props.place}` : ""}` : undefined}
      value={characteristicText(comparable, field.key)}
      display={numeric ? props.numberText(characteristicValueText(comparable, field.key)) : undefined}
      onCommit={(text) => props.onComparable(comparable, (current) => {
        const parsed = numeric ? parseDecimal(text) : null;
        // An added figure is kept as the number it gives.
        const kept = numeric && !builtinNumber && parsed !== null ? String(parsed) : text;
        return withCharacteristic(current, field.key, kept, parsed);
      })}
    />
  );
}

function CharacteristicRow(props: {
  field: CharacteristicField;
  first: boolean;
  last: boolean;
  readOnly: boolean;
  comparables: ComparableDto[];
  subject: string;
  linked?: { value: string; source: string };
  formulaScope?: string;
  numberText: (text: string) => string;
  onRename: (label: string) => void;
  onSubject: (text: string) => void;
  onComparable: (comparable: ComparableDto, change: (current: ComparableDto) => ComparableDto) => void;
  onMove: (by: -1 | 1, event: MouseEvent<HTMLButtonElement>) => void;
  onToggleHidden: () => void;
  onRemove: () => void;
}) {
  const { field, readOnly, numberText } = props;
  const numeric = isNumericCharacteristic(field);
  const hidden = field.hidden === true;
  const sortable = useSortableRow(field.key, { disabled: readOnly, label: `Arrastrar ${field.label}` });
  const unit = field.kind === "area" ? " (m²)" : "";
  const shownLink = !props.subject && props.linked ? props.linked : null;
  return (
    <tr
      {...sortable.row}
      className={cn(CALC_ROW, hidden && "bg-muted/30 text-muted-foreground", sortable.className)}
      data-characteristic={field.key}
      data-hidden={hidden || undefined}
      data-kind={field.kind}
    >
      <td className={cn(CALC_CELL, "px-1 py-1")}>
        <span className="flex items-center gap-0.5">
          {sortable.handle}
          <CommitCell
            ariaLabel={`Nombre de la característica ${field.label}`}
            disabled={readOnly}
            value={field.label}
            onCommit={props.onRename}
            className={cn("font-medium", hidden && "line-through")}
            title={hidden ? "Oculta: no se imprime; lo capturado se conserva" : field.kind === "area" ? "Superficie: se imprime en m²" : field.kind === "number" ? "Dato numérico" : undefined}
          />
          {unit ? <span className="shrink-0 text-xs text-muted-foreground">{unit}</span> : null}
        </span>
      </td>
      <td className={cn(CALC_CELL, "px-1 py-1")}>
        <CommitCell
          ariaLabel={`${field.label} del sujeto`}
          disabled={readOnly}
          numeric={numeric}
          // "=" reads a concept or a cell of the valuation, as the comparables' cells (V7.1-12).
          formulaKey={numeric ? `subject:${props.formulaScope ?? ""}:${field.key}` : undefined}
          value={props.subject}
          display={shownLink ? (numeric ? numberText(shownLink.value) : shownLink.value) : numeric ? numberText(subjectFigureText(props.subject)) : undefined}
          editText={shownLink ? shownLink.value : undefined}
          computed={Boolean(shownLink)}
          title={shownLink ? `Tomado del avalúo: ${shownLink.source}. Escribe otro valor para cambiarlo.` : undefined}
          onCommit={props.onSubject}
          className="text-center"
        />
      </td>
      {props.comparables.map((comparable) => (
        <td key={comparable.id} className={cn(CALC_CELL, "px-1 py-1")}>
          <ComparableCharacteristicCell comparable={comparable} field={field} readOnly={readOnly} numberText={numberText} className="text-center" onComparable={props.onComparable} />
        </td>
      ))}
      <td className={cn(CALC_CELL, "px-1 py-1 whitespace-nowrap")}>
        {!readOnly ? (
          <>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Subir ${field.label}`} disabled={props.first} onClick={(event) => props.onMove(-1, event)}>
              <ArrowUp />
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bajar ${field.label}`} disabled={props.last} onClick={(event) => props.onMove(1, event)}>
              <ArrowDown />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={hidden ? `Mostrar ${field.label}` : `Ocultar ${field.label}`}
              aria-pressed={hidden}
              title={hidden ? "Volver a imprimir la característica" : "Ocultar: no se imprime en el dictamen; lo capturado se conserva"}
              onClick={props.onToggleHidden}
            >
              {hidden ? <EyeOff /> : <Eye />}
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Quitar ${field.label}`}
              title={isBuiltinCharacteristic(field.key) ? "Deja de imprimirse; lo capturado se conserva" : "Quitar la característica"}
              onClick={props.onRemove}
            >
              <X />
            </Button>
          </>
        ) : null}
      </td>
    </tr>
  );
}
