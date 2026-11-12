"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useNumberPresentation } from "@/features/valuations/components/number-presentation-context";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import {
  MAX_CHARACTERISTIC_FIELDS,
  NUMERIC_CHARACTERISTICS,
  characteristicText,
  characteristicValueText,
  duplicateCharacteristicLabel,
  isBuiltinCharacteristic,
  nextCharacteristicLabel,
  withCharacteristic,
  type CharacteristicField,
  type ComparableDto,
} from "@/features/valuations/calculation/market-types";
import { cn } from "@/lib/utils";
import { CalcTableContextMenu } from "./calc-table-context-menu";
import { CALC_CELL, CALC_HEAD, CALC_HEAD_CELL, CALC_ROW, CALC_TABLE, CALC_TABLE_FRAME } from "./calculation-table-style";
import { CommitCell } from "./commit-cell";

/** A key for a field the appraiser adds: short, and unlike any other in the list. */
const newFieldKey = () => `custom:${Date.now().toString(36)}`;

const grouped = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 4 });

/** A number of a characteristic as the document writes its numbers: "1,800,000" with the separator, "1800000" without. */
export function characteristicNumberText(text: string, thousandsSeparator: boolean) {
  const plain = text.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(plain)) return text;
  return thousandsSeparator ? grouped.format(Number(plain)) : plain;
}

/**
 * The characteristics of the comparables, beside the subject's: a row per
 * field (the appraiser renames, reorders, hides, removes or adds them, up to
 * thirty) and a column per comparable. The dictamen prints each comparable's
 * line with the fields shown, in this order, unless a free text is written
 * for it; a hidden field keeps what was captured and prints nothing.
 */
export function MarketCharacteristicsTable(props: {
  fields: CharacteristicField[];
  /** The list is the format's own, not one the appraiser changed. */
  defaults: boolean;
  comparables: ComparableDto[];
  subject: Record<string, string>;
  readOnly: boolean;
  onFields: (fields: CharacteristicField[] | null) => void;
  onSubject: (subject: Record<string, string>) => void;
  onComparable: (comparable: ComparableDto, change: (current: ComparableDto) => ComparableDto) => void;
}) {
  const { fields, comparables, readOnly } = props;
  const { thousandsSeparator } = useNumberPresentation();
  const full = fields.length >= MAX_CHARACTERISTIC_FIELDS;

  const rename = (index: number) => (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const repeated = duplicateCharacteristicLabel(fields, trimmed, index);
    if (repeated) toast.warning(`Ya hay una característica llamada «${repeated.label}». Las dos se imprimen con el mismo nombre.`);
    props.onFields(fields.map((field, at) => (at === index ? { ...field, label: trimmed } : field)));
  };
  const move = (index: number, by: number) => {
    const next = [...fields];
    const [field] = next.splice(index, 1);
    next.splice(index + by, 0, field);
    props.onFields(next);
  };
  const toggleHidden = (index: number) => props.onFields(fields.map((field, at) => {
    if (at !== index) return field;
    const { hidden: _hidden, ...rest } = field;
    return field.hidden ? rest : { ...rest, hidden: true };
  }));
  const add = () => {
    if (full) {
      toast.info(`Hasta ${MAX_CHARACTERISTIC_FIELDS} características por mercado: quita u oculta alguna para agregar otra.`);
      return;
    }
    props.onFields([...fields, { key: newFieldKey(), label: nextCharacteristicLabel(fields) }]);
  };
  const setSubject = (key: string) => (text: string) => {
    const { [key]: _previous, ...rest } = props.subject;
    props.onSubject(text.trim() ? { ...rest, [key]: text.trim() } : rest);
  };
  const numberText = (text: string) => characteristicNumberText(text, thousandsSeparator);

  return (
    <div className="grid gap-1.5">
      {/* The data centered and a rule between every column, as the appraiser's format (video 5.4). */}
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
            {fields.map((field, index) => {
              const numeric = NUMERIC_CHARACTERISTICS.has(field.key);
              const hidden = field.hidden === true;
              return (
                <tr key={field.key} className={cn(CALC_ROW, hidden && "bg-muted/30 text-muted-foreground")} data-characteristic={field.key} data-hidden={hidden || undefined}>
                  <td className={cn(CALC_CELL, "px-1 py-1")}>
                    <CommitCell
                      ariaLabel={`Nombre de la característica ${field.label}`}
                      disabled={readOnly}
                      value={field.label}
                      onCommit={rename(index)}
                      className={cn("font-medium", hidden && "line-through")}
                      title={hidden ? "Oculta: no se imprime; lo capturado se conserva" : undefined}
                    />
                  </td>
                  <td className={cn(CALC_CELL, "px-1 py-1")}>
                    <CommitCell
                      ariaLabel={`${field.label} del sujeto`}
                      disabled={readOnly}
                      numeric={numeric}
                      value={props.subject[field.key] ?? ""}
                      display={numeric ? numberText(props.subject[field.key] ?? "") : undefined}
                      onCommit={setSubject(field.key)}
                      className="text-center"
                    />
                  </td>
                  {comparables.map((comparable) => (
                    <td key={comparable.id} className={cn(CALC_CELL, "px-1 py-1")}>
                      <CommitCell
                        ariaLabel={`${field.label}, comparable ${comparable.reference}`}
                        className="text-center"
                        disabled={readOnly}
                        numeric={numeric}
                        formulaKey={numeric ? `comparable:${comparable.id}:${field.key}` : undefined}
                        value={characteristicText(comparable, field.key)}
                        display={numeric ? numberText(characteristicValueText(comparable, field.key)) : undefined}
                        onCommit={(text) => props.onComparable(comparable, (current) =>
                          withCharacteristic(current, field.key, text, numeric ? parseDecimal(text) : null))}
                      />
                    </td>
                  ))}
                  <td className={cn(CALC_CELL, "px-1 py-1 whitespace-nowrap")}>
                    {!readOnly ? (
                      <>
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Subir ${field.label}`} disabled={index === 0} onClick={() => move(index, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bajar ${field.label}`} disabled={index === fields.length - 1} onClick={() => move(index, 1)}>
                          <ArrowDown />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={hidden ? `Mostrar ${field.label}` : `Ocultar ${field.label}`}
                          aria-pressed={hidden}
                          title={hidden ? "Volver a imprimir la característica" : "Ocultar: no se imprime en el dictamen; lo capturado se conserva"}
                          onClick={() => toggleHidden(index)}
                        >
                          {hidden ? <EyeOff /> : <Eye />}
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Quitar ${field.label}`}
                          title={isBuiltinCharacteristic(field.key) ? "Deja de imprimirse; lo capturado se conserva" : "Quitar la característica"}
                          onClick={() => props.onFields(fields.filter((item) => item.key !== field.key))}
                        >
                          <X />
                        </Button>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            <tr className={cn(CALC_ROW, "bg-muted/20")}>
              <td className={cn(CALC_CELL, "px-2 py-1.5 text-xs font-medium")}>Texto libre</td>
              <td className={cn(CALC_CELL, "px-2 py-1.5 text-center text-xs text-muted-foreground")}>En lugar de la línea de características</td>
              {comparables.map((comparable) => (
                <td key={comparable.id} className={cn(CALC_CELL, "px-1 py-1")}>
                  <CommitCell
                    ariaLabel={`Texto libre de características, comparable ${comparable.reference}`}
                    disabled={readOnly}
                    placeholder="Opcional"
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
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={full} title={full ? `Hasta ${MAX_CHARACTERISTIC_FIELDS} características` : undefined} onClick={add}>
            <Plus data-icon="inline-start" /> Agregar característica
          </Button>
          {!props.defaults ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => props.onFields(null)}>
              <RotateCcw data-icon="inline-start" /> Volver a las del formato
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            Escribe el nombre como quieres que se imprima. El sujeto es para comparar; el dictamen imprime la línea de cada comparable.
            {full ? ` Hasta ${MAX_CHARACTERISTIC_FIELDS} características.` : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}
