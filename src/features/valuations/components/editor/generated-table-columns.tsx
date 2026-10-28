"use client";

import { Columns3, PencilLine, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  MAX_EXTRA_COLUMNS,
  applyTableLayout,
  layoutOf,
  sourceOf,
  summaryCaptionKey,
  summaryRowKey,
  withBoxLabel,
  withColumnHidden,
  withExtraColumn,
  withExtraColumnChange,
  withConceptLabel,
  withHeaderLabel,
  withoutExtraColumn,
} from "@/features/valuations/calculation/generated-table-layout";
import type { Block, Concept, TableContent } from "@/features/valuations/model";
import { getDisplayColumns, type GeneratedTableLayout } from "@/features/valuations/services/table";
import { CommitCell } from "../calculation/commit-cell";

const AT_END = "__end";

/**
 * The columns of a table the calculation writes, as the appraiser sets them
 * for the dictamen: show or hide each one, rename its header (or the header
 * of its group) and add columns of text that print and do not enter the
 * calculation. The figures stay the calculation's.
 */
export function GeneratedTableColumns(props: { table: TableContent; readOnly: boolean; onChange: (table: TableContent) => void }) {
  const source = sourceOf(props.table);
  const layout = layoutOf(props.table);
  const columns = getDisplayColumns(source);
  const groups = source.schema?.headerGroups ?? [];
  const hidden = new Set(layout.hidden ?? []);
  const extras = layout.extraColumns ?? [];
  const boxes = source.schema?.summaryBoxes ?? [];
  const renamedBoxLabels = Object.values(layout.boxLabels ?? {}).filter((label) => label.trim()).length;
  const change = (next: GeneratedTableLayout) => props.onChange(applyTableLayout(source, next));
  const firstColumn = columns[0];
  const rowLabel = (index: number) => {
    const cell = firstColumn ? source.rows[index]?.cells[firstColumn.id] : undefined;
    const text = cell?.kind === "value" ? cell.value.trim() : "";
    return text || `Renglón ${index + 1}`;
  };
  const summary = [
    hidden.size ? `${hidden.size} ${hidden.size === 1 ? "oculta" : "ocultas"}` : "",
    extras.length ? `${extras.length} ${extras.length === 1 ? "agregada" : "agregadas"}` : "",
    renamedBoxLabels ? `${renamedBoxLabels} ${renamedBoxLabels === 1 ? "etiqueta renombrada" : "etiquetas renombradas"}` : "",
  ].filter(Boolean).join(", ");

  return (
    <details className="rounded-md border bg-background text-xs" data-generated-table-columns={source.id}>
      <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5 font-medium">
        <Columns3 className="size-3.5" aria-hidden /> Columnas{boxes.length ? " y recuadros" : ""} de «{source.title}»{summary ? <span className="font-normal text-muted-foreground">· {summary}</span> : null}
      </summary>
      <div className="grid gap-3 border-t p-2">
        <p className="text-muted-foreground">
          Oculta las columnas que no uses y cambia el nombre de sus encabezados; las cifras las sigue escribiendo el cálculo. Las columnas que agregues son
          informativas: se imprimen y no entran al cálculo.
        </p>
        {groups.length ? (
          <div className="grid gap-1">
            <span className="font-semibold">Grupos de encabezados</span>
            {groups.map((group) => (
              <CommitCell
                key={group.id}
                ariaLabel={`Nombre del grupo ${group.title}`}
                disabled={props.readOnly}
                value={layout.labels?.[group.id] ?? ""}
                placeholder={group.title}
                className="border-input text-xs"
                onCommit={(text) => change(withHeaderLabel(layout, group.id, text))}
              />
            ))}
          </div>
        ) : null}
        <div className="grid gap-1">
          <span className="font-semibold">Columnas del cálculo</span>
          {columns.map((column) => (
            <div key={column.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
              <Checkbox
                aria-label={`Mostrar la columna ${column.name}`}
                checked={!hidden.has(column.id)}
                disabled={props.readOnly}
                onCheckedChange={(checked) => change(withColumnHidden(layout, column.id, checked !== true))}
              />
              <CommitCell
                ariaLabel={`Encabezado de la columna ${column.name}`}
                disabled={props.readOnly || hidden.has(column.id)}
                value={layout.labels?.[column.id] ?? ""}
                placeholder={column.name}
                className="border-input text-xs"
                onCommit={(text) => change(withHeaderLabel(layout, column.id, text))}
              />
            </div>
          ))}
        </div>
        {boxes.length ? (
          <div className="grid gap-1" data-generated-table-boxes>
            <span className="font-semibold">Etiquetas de los recuadros</span>
            <span className="text-muted-foreground">
              Escribe el nombre con el que se imprime cada renglón (por ejemplo, «Valor neto de reposición»); la cifra la sigue escribiendo el cálculo. Vacío, vuelve el nombre del
              cálculo.
            </span>
            {boxes.flatMap((box) => [
              ...(box.caption !== undefined ? [{ key: summaryCaptionKey(box), name: box.caption }] : []),
              ...box.rows.map((row, index) => ({ key: summaryRowKey(box, row, index), name: row.label })),
            ]).map(({ key, name }) => (
              <CommitCell
                key={key}
                ariaLabel={`Etiqueta ${name}`}
                disabled={props.readOnly}
                value={layout.boxLabels?.[key] ?? ""}
                placeholder={name}
                className="border-input text-xs"
                onCommit={(text) => change(withBoxLabel(layout, key, text))}
              />
            ))}
          </div>
        ) : null}
        {extras.map((extra) => (
          <div key={extra.id} className="grid gap-1 rounded-md border border-dashed p-2">
            <div className="flex flex-wrap items-center gap-2">
              <CommitCell
                ariaLabel="Nombre de la columna agregada"
                disabled={props.readOnly}
                value={extra.name}
                className="min-w-40 flex-1 border-input text-xs font-semibold"
                onCommit={(text) => change(withExtraColumnChange(layout, extra.id, { name: text }))}
              />
              <NativeSelect
                size="sm"
                aria-label={`Lugar de la columna ${extra.name}`}
                className="text-xs"
                disabled={props.readOnly}
                value={extra.after ?? AT_END}
                onChange={(event) => change(withExtraColumnChange(layout, extra.id, { after: event.target.value === AT_END ? null : event.target.value }))}
              >
                {columns.map((column) => <NativeSelectOption key={column.id} value={column.id}>Después de {column.name}</NativeSelectOption>)}
                <NativeSelectOption value={AT_END}>Al final</NativeSelectOption>
              </NativeSelect>
              {!props.readOnly ? (
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar la columna ${extra.name}`} onClick={() => change(withoutExtraColumn(layout, extra.id))}>
                  <Trash2 />
                </Button>
              ) : null}
            </div>
            {source.rows.map((row, index) => (
              <label key={row.id} className="grid grid-cols-[minmax(4rem,8rem)_minmax(0,1fr)] items-center gap-2">
                <span className="truncate text-muted-foreground">{rowLabel(index)}</span>
                <CommitCell
                  ariaLabel={`${extra.name}, ${rowLabel(index)}`}
                  disabled={props.readOnly}
                  value={extra.values[row.id] ?? ""}
                  className="border-input text-xs"
                  onCommit={(text) => change(withExtraColumnChange(layout, extra.id, { value: { rowId: row.id, text } }))}
                />
              </label>
            ))}
          </div>
        ))}
        {!props.readOnly ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            disabled={extras.length >= MAX_EXTRA_COLUMNS}
            onClick={() => change(withExtraColumn(layout, "Nueva columna", null))}
          >
            <Plus data-icon="inline-start" /> Columna informativa
          </Button>
        ) : null}
      </div>
    </details>
  );
}

/**
 * The labels of the concepts a calculation writes as label and value (the
 * income approach's result, for one): the appraiser prints them under names
 * of their own; the values stay the calculation's and the name stays when the
 * calculation writes the block again.
 */
export function GeneratedConceptLabels(props: { block: Block; readOnly: boolean; onChange: (patch: Pick<Block, "concepts" | "apartados">) => void }) {
  const concepts = [...props.block.concepts, ...props.block.apartados.flatMap((apartado) => apartado.concepts)];
  if (!concepts.length) return null;
  const renamed = concepts.filter((concept) => concept.generatedLabel !== undefined).length;
  const rename = (id: string, name: string) => {
    const relabel = (items: Concept[]) => items.map((concept) => (concept.id === id ? withConceptLabel(concept, name) : concept));
    props.onChange({
      concepts: relabel(props.block.concepts),
      apartados: props.block.apartados.map((apartado) => ({ ...apartado, concepts: relabel(apartado.concepts) })),
    });
  };
  return (
    <details className="rounded-md border bg-background text-xs" data-generated-concept-labels={props.block.id}>
      <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5 font-medium">
        <PencilLine className="size-3.5" aria-hidden /> Etiquetas de «{props.block.title}»
        {renamed ? <span className="font-normal text-muted-foreground">· {renamed} {renamed === 1 ? "renombrada" : "renombradas"}</span> : null}
      </summary>
      <div className="grid gap-1 border-t p-2">
        <p className="text-muted-foreground">Escribe el nombre con el que se imprime cada dato; la cifra la sigue escribiendo el cálculo. Vacío, vuelve el nombre del cálculo.</p>
        {concepts.map((concept) => {
          const original = concept.generatedLabel ?? concept.label;
          return (
            <CommitCell
              key={concept.id}
              ariaLabel={`Etiqueta ${original}`}
              disabled={props.readOnly}
              value={concept.generatedLabel !== undefined ? concept.label : ""}
              placeholder={original}
              className="border-input text-xs"
              onCommit={(text) => rename(concept.id, text)}
            />
          );
        })}
      </div>
    </details>
  );
}
