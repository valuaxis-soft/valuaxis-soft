import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { defaultStatisticalSettings, type StatisticalCalculationDto } from "../src/features/valuations/calculation/statistical-types";
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
