"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { variableLetters } from "@/features/valuations/engine/regression";
import {
  CODING_LABELS,
  DEFAULT_CONTRARY_BASE,
  MAX_SCALE_LEVELS,
  MAX_STATISTICAL_VARIABLES,
  STATISTICAL_CODINGS,
  formatScaleValue,
  isNumericField,
  normalizedLevel,
  scaleValues,
  unscaledValues,
  writtenValues,
  type StatisticalCalculationDto,
  type StatisticalCoding,
  type StatisticalVariableDto,
} from "@/features/valuations/calculation/statistical-types";
import { cn } from "@/lib/utils";
import { CALC_HEAD, CALC_HEAD_CELL, CALC_ROW, CALC_TABLE, CALC_TABLE_FRAME } from "./calculation-table-style";
import { CommitCell } from "./commit-cell";

type Draft = Pick<StatisticalCalculationDto, "settings" | "comparables">;

/** The draft with one criterion changed. */
const withVariable = (draft: Draft, key: string, change: (variable: StatisticalVariableDto) => StatisticalVariableDto): Draft => ({
  ...draft,
  settings: { ...draft.settings, variables: draft.settings.variables.map((variable) => (variable.key === key ? change(variable) : variable)) },
});

/** A level renamed everywhere it is written: in the scale, the comparables and the subject. */
function renameLevel(draft: Draft, key: string, from: string, to: string): Draft {
  const same = (text: string | undefined) => text !== undefined && normalizedLevel(text) === normalizedLevel(from);
  const renamed = withVariable(draft, key, (variable) => ({
    ...variable,
    scale: (variable.scale ?? []).map((level) => (same(level.label) ? { ...level, label: to } : level)),
  }));
  return {
    settings: { ...renamed.settings, subject: same(renamed.settings.subject[key]) ? { ...renamed.settings.subject, [key]: to } : renamed.settings.subject },
    comparables: renamed.comparables.map((comparable) => (same(comparable.values[key]) ? { ...comparable, values: { ...comparable.values, [key]: to } } : comparable)),
  };
}

/**
 * The scale of a qualitative criterion, as a vertical table (level, rating):
 * the appraiser orders, renames and adds levels (also ones no comparable
 * has), numbered 1, 2, 3… in their order or with his own numbers (8, 4, 2, 1).
 */
function ScaleEditor(props: {
  draft: Draft;
  variable: StatisticalVariableDto;
  label: string;
  readOnly: boolean;
  onUpdate: (change: (draft: Draft) => Draft) => void;
}) {
  const { variable, label, readOnly } = props;
  const [adding, setAdding] = useState("");
  const levels = scaleValues(variable);
  const ordered = variable.scaleMode === "ORDERED";
  const missing = unscaledValues(props.draft, variable);
  const full = levels.length >= MAX_SCALE_LEVELS;
  const setScale = (change: (scale: NonNullable<StatisticalVariableDto["scale"]>) => NonNullable<StatisticalVariableDto["scale"]>) =>
    props.onUpdate((draft) => withVariable(draft, variable.key, (current) => {
      const scale = change(current.scale ?? []);
      return { ...current, scale: scale.length ? scale : null };
    }));
  const add = (labels: string[]) => setScale((scale) => {
    const known = new Set(scale.map((level) => normalizedLevel(level.label)));
    const fresh = labels.map((text) => text.trim()).filter((text) => text && !known.has(normalizedLevel(text)));
    return [...scale, ...fresh.map((text, index) => ({ label: text, value: scale.length + index + 1 }))].slice(0, MAX_SCALE_LEVELS);
  });
  const move = (index: number, by: number) => setScale((scale) => {
    const next = [...scale];
    const [level] = next.splice(index, 1);
    next.splice(index + by, 0, level);
    return next;
  });

  return (
    <div className="grid gap-2 rounded-md border bg-background p-2.5" aria-label={`Escala de ${label}`}>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-medium">Escala de {label}</span>
        {(["ORDERED", "FREE"] as const).map((mode) => (
          <label key={mode} className="flex items-center gap-1">
            <input
              type="radio"
              name={`scale-mode-${variable.key}`}
              disabled={readOnly}
              checked={(variable.scaleMode ?? "FREE") === mode}
              onChange={() => props.onUpdate((draft) => withVariable(draft, variable.key, (current) => ({
                ...current,
                scaleMode: mode,
                // Leaving the ordered numbering keeps the numbers it gave, to edit from them.
                scale: mode === "FREE" ? scaleValues(current) : current.scale,
              })))}
            />
            {mode === "ORDERED" ? "Ordenada consecutiva (1, 2, 3…)" : "Libre (por ejemplo 8, 4, 2, 1)"}
          </label>
        ))}
      </div>
      <div className={CALC_TABLE_FRAME}>
        <table className={cn(CALC_TABLE, "w-full max-w-md")}>
          <thead className={CALC_HEAD}>
            <tr>
              <th className={cn(CALC_HEAD_CELL, "text-left")}>Nivel</th>
              <th className={cn(CALC_HEAD_CELL, "w-28 text-left")}>Calificación</th>
              <th className={cn(CALC_HEAD_CELL, "w-24")}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level, index) => (
              <tr key={`${index}:${level.label}`} className={CALC_ROW}>
                <td className="px-0.5 py-0.5">
                  <CommitCell
                    ariaLabel={`Nivel ${index + 1} de ${label}`}
                    disabled={readOnly}
                    value={level.label}
                    onCommit={(text) => {
                      const to = text.trim();
                      if (!to || levels.some((other, at) => at !== index && normalizedLevel(other.label) === normalizedLevel(to))) return;
                      props.onUpdate((draft) => renameLevel(draft, variable.key, level.label, to));
                    }}
                  />
                </td>
                <td className="px-0.5 py-0.5">
                  {ordered ? (
                    <span className="block px-1.5 tabular-nums">{index + 1}</span>
                  ) : (
                    <CommitCell
                      ariaLabel={`Calificación de ${level.label}`}
                      disabled={readOnly}
                      value={formatScaleValue(level.value)}
                      className="text-left"
                      onCommit={(text) => {
                        const value = parseDecimal(text);
                        if (value !== null) setScale((scale) => scale.map((item, at) => (at === index ? { ...item, value } : item)));
                      }}
                    />
                  )}
                </td>
                <td className="px-0.5 py-0.5 whitespace-nowrap">
                  {!readOnly ? (
                    <>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Subir ${level.label}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bajar ${level.label}`} disabled={index === levels.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar ${level.label}`} onClick={() => setScale((scale) => scale.filter((_, at) => at !== index))}><X /></Button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add([adding]);
            setAdding("");
          }}
        >
          <input
            aria-label={`Nuevo nivel de ${label}`}
            className="h-7 w-48 rounded-md border px-2 text-xs"
            placeholder="Nuevo nivel"
            disabled={full}
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
          />
          <Button type="submit" size="sm" variant="outline" disabled={full || !adding.trim()}><Plus data-icon="inline-start" /> Nivel</Button>
          {full ? <span className="text-xs text-muted-foreground">La escala lleva hasta {MAX_SCALE_LEVELS} niveles.</span> : null}
        </form>
      ) : null}
      {missing.length ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          Sin calificación: {missing.map((text) => `«${text}»`).join(", ")}.
          {!readOnly && !full ? (
            <Button type="button" size="sm" variant="link" className="h-auto px-0" onClick={() => add(missing)}>Agregarlos a la escala</Button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Steps 2 and 3 of the course: which characteristics are criteria and how
 * each becomes a number. Up to twelve; the same for the regression and the
 * goal programming.
 */
export function StatisticalVariables(props: {
  draft: Draft;
  readOnly: boolean;
  onUpdate: (change: (draft: Draft) => Draft) => void;
}) {
  const { draft, readOnly } = props;
  const { settings } = draft;
  const chosen = new Map(settings.variables.map((variable) => [variable.key, variable]));
  const letters = variableLetters(settings.variables.length);
  const toggle = (key: string, checked: boolean) => props.onUpdate((current) => {
    const numeric = isNumericField(current, key);
    const values = writtenValues(current, key);
    const added: StatisticalVariableDto = numeric || !values.length
      ? { key, coding: "DIRECT" }
      : { key, coding: "SCALE", scaleMode: "ORDERED", scale: values.slice(0, MAX_SCALE_LEVELS).map((label, index) => ({ label, value: index + 1 })) };
    return {
      ...current,
      settings: {
        ...current.settings,
        variables: checked
          ? [...current.settings.variables.filter((variable) => variable.key !== key), added]
          : current.settings.variables.filter((variable) => variable.key !== key),
      },
    };
  });
  const setCoding = (key: string, coding: StatisticalCoding) => props.onUpdate((current) => withVariable(current, key, (variable) => {
    if (coding !== "SCALE" || variable.scale?.length) return { ...variable, coding };
    const values = writtenValues(current, key).slice(0, MAX_SCALE_LEVELS);
    return { ...variable, coding, scaleMode: "ORDERED", scale: values.length ? values.map((label, index) => ({ label, value: index + 1 })) : null };
  }));

  return (
    <div className="grid gap-2">
      <div className={CALC_TABLE_FRAME}>
        <table className={cn(CALC_TABLE, "w-full min-w-140")} aria-label="Criterios de los métodos alternativos">
          <thead className={CALC_HEAD}>
            <tr>
              <th className={cn(CALC_HEAD_CELL, "w-16 text-left")}>Criterio</th>
              <th className={cn(CALC_HEAD_CELL, "text-left")}>Característica</th>
              <th className={cn(CALC_HEAD_CELL, "w-56 text-left")}>Codificación</th>
              <th className={cn(CALC_HEAD_CELL, "w-28 text-left")}>Base</th>
            </tr>
          </thead>
          <tbody>
            {settings.fields.map((field) => {
              const variable = chosen.get(field.key);
              const index = settings.variables.findIndex((item) => item.key === field.key);
              return (
                <tr key={field.key} className={CALC_ROW}>
                  <td className="px-1.5 py-1">
                    <label className="flex items-center gap-1.5">
                      <Checkbox
                        aria-label={`${field.label} es criterio`}
                        checked={Boolean(variable)}
                        disabled={readOnly || (!variable && settings.variables.length >= MAX_STATISTICAL_VARIABLES)}
                        onCheckedChange={(checked) => toggle(field.key, checked === true)}
                      />
                      <span className="font-mono text-[11px]">{variable ? letters[index] : ""}</span>
                    </label>
                  </td>
                  <td className="px-1.5 py-1 text-left">{field.label}</td>
                  <td className="px-1 py-0.5">
                    {variable ? (
                      <NativeSelect
                        aria-label={`Codificación de ${field.label}`}
                        className="h-7 w-full text-xs"
                        disabled={readOnly}
                        value={variable.coding}
                        onChange={(event) => setCoding(field.key, event.target.value as StatisticalCoding)}
                      >
                        {STATISTICAL_CODINGS.map((coding) => <NativeSelectOption key={coding} value={coding}>{CODING_LABELS[coding]}</NativeSelectOption>)}
                      </NativeSelect>
                    ) : null}
                  </td>
                  <td className="px-0.5 py-0.5">
                    {variable?.coding === "CONTRARY" ? (
                      <CommitCell
                        ariaLabel={`Base de ${field.label}`}
                        disabled={readOnly}
                        value={String(variable.base ?? DEFAULT_CONTRARY_BASE)}
                        className="text-left"
                        onCommit={(text) => {
                          const base = parseDecimal(text);
                          if (base !== null) props.onUpdate((current) => withVariable(current, field.key, (item) => ({ ...item, base })));
                        }}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Hasta {MAX_STATISTICAL_VARIABLES} criterios. Directo: el valor tal cual. Contrario: base − valor (vida útil remanente = {DEFAULT_CONTRARY_BASE} − antigüedad).
        Inverso: 1 / valor. Escala: el número que el valuador da a cada nivel (ordinales y nominales).
      </p>
      {settings.variables.filter((variable) => variable.coding === "SCALE").map((variable) => (
        <ScaleEditor
          key={variable.key}
          draft={draft}
          variable={variable}
          label={settings.fields.find((field) => field.key === variable.key)?.label ?? variable.key}
          readOnly={readOnly}
          onUpdate={props.onUpdate}
        />
      ))}
    </div>
  );
}
