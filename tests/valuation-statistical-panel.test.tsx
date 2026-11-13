import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { defaultStatisticalSettings, isFigureColumn, type StatisticalCalculationDto } from "../src/features/valuations/calculation/statistical-types";
import { StatisticalDataTable } from "../src/features/valuations/components/calculation/statistical-data-table";
import { StatisticalVariables } from "../src/features/valuations/components/calculation/statistical-variables";

const draft: Pick<StatisticalCalculationDto, "settings" | "comparables"> = {
  settings: {
    ...defaultStatisticalSettings("TERRENO_VENTA"),
    fields: [{ key: "area", label: "SUPERFICIE" }, { key: "zone", label: "UBICACIÓN" }],
    subject: { area: "150", zone: "calle inferior" },
    variables: [
      { key: "area", coding: "DIRECT" },
      { key: "zone", coding: "SCALE", scaleMode: "FREE", scale: [{ label: "Calle inferior", value: 8 }, { label: "Avenida", value: 4 }, { label: "Esquina", value: 2 }] },
    ],
  },
  comparables: [
    { id: "a", reference: 1, price: 1500000, values: { area: "120", zone: "Avenida" } },
    { id: "b", reference: 2, price: 1800000, values: { area: "160", zone: "Mercado" }, excluded: true },
  ],
};
const noop = () => undefined;

test("the grid shows each level with its number, aligned left, and the legend of the own comparables", () => {
  const html = renderToStaticMarkup(createElement(StatisticalDataTable, {
    calculation: draft, readOnly: false, priceLabel: "Precio de oferta ($)", subjectSources: [],
    onFields: noop, onSubject: noop, onComparable: noop, onAdd: noop, onRemove: noop,
  }));
  assert.match(html, /value="Avenida \(4\)"/);
  assert.match(html, /value="calle inferior"|value="Calle inferior \(8\)"/);
  assert.match(html, /no se mostrarán en el enfoque de mercado; se usan solo para este análisis/);
  assert.doesNotMatch(html, /text-right/, "everything aligned left");
  assert.match(html, /data-row="1" data-col="zone"/, "cells know their row and column for Enter");
});

test("the scale is a vertical table with its levels in order, also the ones no comparable has, and the unrated values named", () => {
  const html = renderToStaticMarkup(createElement(StatisticalVariables, { draft, readOnly: false, onUpdate: noop }));
  const levels = [...html.matchAll(/aria-label="Nivel \d+ de UBICACIÓN"[^>]*value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(levels, ["Calle inferior", "Avenida", "Esquina"]);
  assert.match(html, /Sin calificación: «Mercado»/);
  assert.match(html, /Ordenada consecutiva/);
});

test("the grid's cells take formulas as every other table (V5.2-08): a formula shows its result in blue, letters among figures are marked", () => {
  const withFormulas: Pick<StatisticalCalculationDto, "settings" | "comparables"> = {
    settings: {
      ...draft.settings,
      fields: [...draft.settings.fields, { key: "custom:frente", label: "FRENTE" }],
      subject: { ...draft.settings.subject, "custom:frente": "=2*3" },
    },
    comparables: [
      { id: "a", reference: 1, price: 1500000, values: { area: "abc", zone: "Avenida", "custom:frente": "10" } },
      { id: "b", reference: 2, price: 1800000, values: { area: "160", zone: "Avenida", "custom:frente": "12" } },
    ],
  };
  const html = renderToStaticMarkup(createElement(StatisticalDataTable, {
    calculation: withFormulas, readOnly: false, priceLabel: "Precio de oferta ($)", subjectSources: [],
    onFields: noop, onSubject: noop, onComparable: noop, onAdd: noop, onRemove: noop,
  }));
  const subjectFront = /<input[^>]*aria-label="FRENTE del sujeto"[^>]*>/.exec(html)?.[0] ?? "";
  assert.match(subjectFront, /value="6"/, "the formula's result");
  assert.match(subjectFront, /data-formula="=2\*3"/);
  assert.match(subjectFront, /title="Fórmula: =2\*3"/);
  assert.match(subjectFront, /text-blue-700/);
  const typo = /<input[^>]*aria-label="SUPERFICIE, comparable 1"[^>]*>/.exec(html)?.[0] ?? "";
  assert.match(typo, /aria-invalid="true"/);
  assert.match(typo, /data-numeric-problem="Este campo es numérico"/);
  assert.doesNotMatch(/<input[^>]*aria-label="UBICACIÓN, comparable 1"[^>]*>/.exec(html)?.[0] ?? "", /aria-invalid/, "a scaled criterion takes words");
  assert.match(html, /«=» escribe una fórmula, con «Buscar valor»/);
});

test("a column of the grid holds figures as the editor's tables infer it: one typo among figures is still a figure column", () => {
  const calculation = (values: string[]): Pick<StatisticalCalculationDto, "settings" | "comparables"> => ({
    settings: { ...draft.settings, subject: { "custom:x": values[0] ?? "" } },
    comparables: values.slice(1).map((value, index) => ({ id: `c${index}`, reference: index + 1, price: 1, values: { "custom:x": value } })),
  });
  assert.equal(isFigureColumn(calculation([]), "custom:x"), true, "nothing written yet");
  assert.equal(isFigureColumn(calculation(["10", "12", "14", "abc"]), "custom:x"), true);
  assert.equal(isFigureColumn(calculation(["=2*3", "12"]), "custom:x"), true, "a formula counts as a figure");
  assert.equal(isFigureColumn(calculation(["Esquina", "Medio", "10"]), "custom:x"), false);
  assert.equal(isFigureColumn(calculation(["10", "12"]), "custom:x", "SCALE"), false);
  assert.equal(isFigureColumn(calculation(["abc"]), "area"), true);
});
