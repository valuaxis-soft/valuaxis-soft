"use client";

import { ArrowDown, ArrowUp, Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import {
  NUMERIC_CHARACTERISTICS,
  characteristicText,
  isBuiltinCharacteristic,
  withCharacteristic,
  type CharacteristicField,
  type ComparableDto,
} from "@/features/valuations/calculation/market-types";
import { CommitCell } from "./commit-cell";

/** A key for a field the appraiser adds: short, and unlike any other in the list. */
const newFieldKey = () => `custom:${Date.now().toString(36)}`;

/**
 * The characteristics of the comparables, beside the subject's: a row per
 * field (the appraiser renames, reorders, removes or adds them) and a column
 * per comparable. The dictamen prints each comparable's line with these
 * fields, in this order, unless a free text is written for it.
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

  const rename = (index: number) => (label: string) => {
    const trimmed = label.trim();
    if (trimmed) props.onFields(fields.map((field, at) => (at === index ? { ...field, label: trimmed } : field)));
  };
  const move = (index: number, by: number) => {
    const next = [...fields];
    const [field] = next.splice(index, 1);
    next.splice(index + by, 0, field);
    props.onFields(next);
  };
  const setSubject = (key: string) => (text: string) => {
    const { [key]: _previous, ...rest } = props.subject;
    props.onSubject(text.trim() ? { ...rest, [key]: text.trim() } : rest);
  };

  return (
    <div className="grid gap-1.5">
      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full min-w-[640px] text-sm" aria-label="Características de los comparables">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="min-w-40 px-2 py-1.5 text-left font-medium">Característica</th>
              <th className="min-w-28 px-2 py-1.5 text-left font-medium">Sujeto</th>
              {comparables.map((comparable) => (
                <th key={comparable.id} className="min-w-28 px-2 py-1.5 text-left font-medium">Comparable {comparable.reference}</th>
              ))}
              <th className="px-2 py-1.5"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => {
              const numeric = NUMERIC_CHARACTERISTICS.has(field.key);
              return (
                <tr key={field.key} className="border-t">
                  <td className="px-1 py-1">
                    <CommitCell ariaLabel={`Nombre de la característica ${field.label}`} disabled={readOnly} value={field.label} onCommit={rename(index)} className="font-medium" />
                  </td>
                  <td className="px-1 py-1">
                    <CommitCell ariaLabel={`${field.label} del sujeto`} disabled={readOnly} value={props.subject[field.key] ?? ""} onCommit={setSubject(field.key)} />
                  </td>
                  {comparables.map((comparable) => (
                    <td key={comparable.id} className="px-1 py-1">
                      <CommitCell
                        ariaLabel={`${field.label}, comparable ${comparable.reference}`}
                        disabled={readOnly}
                        numeric={numeric}
                        value={characteristicText(comparable, field.key)}
                        onCommit={(text) => props.onComparable(comparable, (current) =>
                          withCharacteristic(current, field.key, text, numeric ? parseDecimal(text) : null))}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1 whitespace-nowrap">
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
            <tr className="border-t bg-muted/20">
              <td className="px-2 py-1.5 text-xs font-medium">Texto libre</td>
              <td className="px-2 py-1.5 text-xs text-muted-foreground">En lugar de la línea de características</td>
              {comparables.map((comparable) => (
                <td key={comparable.id} className="px-1 py-1">
                  <CommitCell
                    ariaLabel={`Texto libre de características, comparable ${comparable.reference}`}
                    disabled={readOnly}
                    placeholder="Opcional"
                    value={comparable.characteristicsText ?? ""}
                    onCommit={(text) => props.onComparable(comparable, (current) => ({ ...current, characteristicsText: text.trim() || null }))}
                  />
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => props.onFields([...fields, { key: newFieldKey(), label: "NUEVA CARACTERÍSTICA" }])}>
            <Plus data-icon="inline-start" /> Agregar característica
          </Button>
          {!props.defaults ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => props.onFields(null)}>
              <RotateCcw data-icon="inline-start" /> Volver a las del formato
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            Escribe el nombre como quieres que se imprima. El sujeto es para comparar; el dictamen imprime la línea de cada comparable.
          </span>
        </div>
      ) : null}
    </div>
  );
}
