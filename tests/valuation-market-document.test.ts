import assert from "node:assert/strict";
import { test } from "node:test";
import { marketDocumentBlocks, marketPhotoBlocks, withGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { defaultMarketSettings, toMarketEngineInput, type ComparableDto, type MarketCalculationDto } from "../src/features/valuations/calculation/market-types";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeMarketApproach } from "../src/features/valuations/engine/market";
import type { AppSection, Block, TableContent } from "../src/features/valuations/model";
import { ensureTableV2, getTableHeaderLayout } from "../src/features/valuations/services/table";

function comparable(reference: number, area: number, price: number): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Comparable ${reference}`, area, price,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    sourceName: "Altos 360", contactName: null, contactPhone: "348 249 3129", url: null, offerDate: null,
    photos: reference === 1 ? [{ id: "foto-1", title: "Fachada", url: "/organizaciones/x/foto-1.jpg" }] : [],
    factors: [{ type: "NEGOCIACION", value: 0.95, subjectRating: null, comparableRating: null, justification: null }],
  };
}

const villaToledo: ComparableDto = {
  ...comparable(1, 140, 1260000),
  location: "Calle Villa Toledo, Arandas, Jalisco.",
  landUse: "AU-I/CS-D (Área Urbana-Incorporada / Comercial y Servicios Distrital)",
  shape: "Regular", zone: "Calle Inferior", frontage: 8, depth: 17.5, topography: "Plano (<6%)", services: "Completos", offerDate: "2026-05-04",
};

const calculation: MarketCalculationDto = {
  settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 169.78, surfacePower: 6, adoptedUnitValue: 9000 },
  comparables: [villaToledo, comparable(2, 192.5, 2032590), comparable(3, 196.62, 2261130), comparable(4, 140, 1330000)],
  locked: false,
};

function compute(target: MarketCalculationDto) {
  const input = toMarketEngineInput(target);
  assert.ok(input.ok);
  return computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG);
}
const result = () => compute(calculation);

/** A generated table as the dictamen prints it: header groups, column names, rows of texts and the schema. */
function printed(table: TableContent) {
  const v2 = ensureTableV2(table);
  return {
    title: v2.title,
    groups: getTableHeaderLayout(v2).topRow.flatMap((cell) => (cell.kind === "group-title" ? [[cell.group.title, cell.colSpan]] : [])),
    columns: v2.columns.map((column) => column.name),
    rows: v2.rows.map((row) => v2.columns.map((column) => {
      const cell = row.cells[column.id];
      return cell?.kind === "value" ? cell.value : "";
    })),
    align: v2.columns.map((column) => v2.schema?.columnPresentation?.[column.id]?.align ?? "left"),
    schema: v2.schema,
  };
}
const boxRows = (table: TableContent, id: string) => printed(table).schema?.summaryBoxes?.find((box) => box.id === id)?.rows.map((row) => [row.label, row.value]);

const templateBlock = (id: string): Block => ({ id, title: id, sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [] });
const section = (blocks: Block[]): AppSection => ({ id: "mercadoVenta", label: "VII", title: "MERCADO", sourceFile: "", enabled: true, required: false, blocks });

test("the market page is one block with the comparables data and the homologation, as the appraiser's format", () => {
  const blocks = marketDocumentBlocks(calculation, result());
  assert.deepEqual(blocks.map((block) => [block.id, block.title]), [
    ["motor-mercado-terreno_venta-enfoque", "ENFOQUE COMPARATIVO DE MERCADO (TERRENOS)"],
  ]);
  const [data, homologation] = blocks[0].apartados;
  assert.deepEqual(blocks[0].apartados.map((apartado) => apartado.title), ["DATOS DE COMPARABLES (TERRENOS)", "HOMOLOGACIÓN (TERRENOS)"]);

  const characteristics = printed(data.tables[0]);
  assert.deepEqual(characteristics.columns, ["REF.", "UBICACIÓN", "USO DE SUELO", "CARACTERÍSTICAS"]);
  assert.deepEqual(characteristics.rows[0], [
    "1",
    "Calle Villa Toledo, Arandas, Jalisco.",
    "AU-I/CS-D (Área Urbana-Incorporada / Comercial y Servicios Distrital)",
    "USO DE SUELO: AU-I/CS-D ; FORMA: Regular ; ZONA: Calle Inferior ; FRENTE: 8.00 m ; FONDO: 17.50 m ; SUPERFICIE: 140.00 m² ; "
      + "TOPOGRAFÍA: Plano (<6%) ; SERVICIOS: Completos ; OFERTA: $1,260,000.00",
  ]);
  assert.equal(characteristics.rows[1][3], "SUPERFICIE: 192.50 m² ; OFERTA: $2,032,590.00", "what was not captured is left out");
  assert.equal(characteristics.schema?.hideCaption, true, "the table's name is not printed as a caption");

  const offers = printed(data.tables[1]);
  assert.deepEqual(offers.columns, ["REF.", "CONTACTO", "TELÉFONO", "FECHA", "SUPERFICIE DE TERRENO (m²)", "OFERTA $ (TERRENO)", "$/m²"]);
  assert.deepEqual(offers.rows[0], ["1", "Altos 360", "348 249 3129", "04/05/2026", "140.00", "$ 1,260,000.00", "$ 9,000.00"]);
  assert.equal(offers.rows[1][3], "—", "no offer date");
  assert.deepEqual(offers.align.slice(-2), ["right", "right"], "amounts are right-aligned");

  const table = printed(homologation.tables[0]);
  assert.deepEqual(table.columns, [
    "REF", "OFERTA $ (TERRENO)", "SUP. TERRENO (m²)", "Valor unitario $/m²",
    "Neg.", "Ubic.", "Sup.", "Zona", "Frente", "Uso", "FRe", "Valor Unitario Homologado $/m²",
  ]);
  assert.deepEqual(table.groups, [["FACTORES DE HOMOLOGACIÓN", 7]], "the factors and the resultant share one header");
  assert.equal(table.rows.length, 4);
  assert.deepEqual(table.rows[0].slice(0, 6), ["1", "$ 1,260,000.00", "140.00", "$ 9,000.00", "0.95", "1.00"]);
  assert.match(table.rows[0][11], /^\$ \d,\d{3}\.\d{2}$/);
});

test("the boxes of the homologation lead from the homologated values to the value of the approach", () => {
  const [, homologation] = marketDocumentBlocks(calculation, result())[0].apartados;
  const table = homologation.tables[0];
  const boxes = printed(table).schema?.summaryBoxes ?? [];
  assert.deepEqual(boxes.map((box) => [box.id, box.position, box.align]), [
    ["base", "top", "start"], ["sujeto", "bottom", "start"], ["valores", "bottom", "end"], ["valor", "bottom", "end"],
  ]);
  assert.deepEqual(boxes[0].rows, [{ label: "Lote Sujeto:", value: "169.78 m²", mark: true }], "without a lote tipo the homologation is against the subject");
  assert.deepEqual(boxRows(table, "sujeto"), [["Superficie del sujeto (m²):", "169.78 m²"]]);
  assert.deepEqual(boxRows(table, "valores")?.[1], ["Valor homologado a utilizar ($/m²):", "$ 9,000.00"]);
  assert.match(boxRows(table, "valores")?.[0].join(" ") ?? "", /^Valor Prom\. Homologado \(\$\/m²\): \$ \d,\d{3}\.\d{2}$/);
  assert.deepEqual(boxRows(table, "valor"), [
    ["Superficie del sujeto:", "169.78 m²"],
    ["Subtotal:", "$ 1,528,020.00"],
    ["Monto adicional a considerar:", "$ -"],
    ["VALOR COMPARATIVO DE MERCADO (TERRENOS):", "$ 1,528,000.00"],
  ]);
  assert.equal(boxes[3].rows.at(-1)?.emphasis, "total", "the value of the approach is the dark bar");
  assert.equal(printed(table).schema?.notes, undefined, "no justification, no note");
});

test("a lote tipo, an additional amount and the justification show only when captured", () => {
  const withLoteTipo: MarketCalculationDto = {
    ...calculation,
    settings: { ...calculation.settings, baseArea: 140, additionalAmount: 25000, justification: "Dentro del rango." },
  };
  const computed = compute(withLoteTipo);
  const table = marketDocumentBlocks(withLoteTipo, computed)[0].apartados[1].tables[0];
  assert.deepEqual(printed(table).schema?.summaryBoxes?.[0].rows, [
    { label: "Lote Tipo:", value: "140.00 m²", mark: true },
    { label: "Lote Sujeto:", value: "169.78 m²", mark: false },
  ]);
  const rows = boxRows(table, "valor") ?? [];
  assert.deepEqual(rows.map(([label]) => label), [
    "Superficie del sujeto:", "Factor de superficie del sujeto contra el lote tipo:", "Subtotal:", "Monto adicional a considerar:",
    "VALOR COMPARATIVO DE MERCADO (TERRENOS):",
  ]);
  assert.equal(rows[1][1], computed.subjectSurfaceFactor.toFixed(4));
  assert.equal(rows[3][1], "$ 25,000.00");
  assert.deepEqual(printed(table).schema?.notes, [{ position: "bottom", label: "Justificación del valor adoptado:", text: "Dentro del rango." }]);
});

test("rents and built properties use the same page with their own wording", () => {
  const rents: MarketCalculationDto = {
    settings: { ...defaultMarketSettings("INMUEBLE_RENTA"), subjectArea: 467.27, adoptedUnitValue: 30 },
    comparables: [comparable(1, 410, 9500), comparable(2, 400, 9000), comparable(3, 380, 8300), comparable(4, 350, 8000)],
    locked: false,
  };
  const [block] = marketDocumentBlocks(rents, compute(rents));
  assert.equal(block.id, "motor-mercado-inmueble_renta-enfoque");
  assert.equal(block.title, "MERCADO DE RENTAS");
  assert.deepEqual(block.apartados.map((apartado) => apartado.title), ["DATOS DE COMPARABLES (INMUEBLES EN RENTA)", "HOMOLOGACIÓN (RENTAS)"]);
  assert.deepEqual(printed(block.apartados[0].tables[1]).columns.slice(-3), ["SUP. RENTABLE (m²)", "RENTA MENSUAL $", "$/m²/mes"]);
  const homologation = block.apartados[1].tables[0];
  assert.equal(printed(homologation).columns.at(-1), "Renta Unitaria Homologada $/m²/mes");
  assert.deepEqual(boxRows(homologation, "valores")?.[1], ["Renta homologada a utilizar ($/m²/mes):", "$ 30.00"]);
  assert.equal(boxRows(homologation, "valor")?.at(-1)?.[0], "RENTA MENSUAL ESTIMADA DEL SUJETO:");

  const built: MarketCalculationDto = { ...calculation, settings: { ...calculation.settings, comparableType: "INMUEBLE_VENTA" } };
  const [builtBlock] = marketDocumentBlocks(built, compute(built));
  assert.equal(builtBlock.title, "ENFOQUE COMPARATIVO DE MERCADO (INMUEBLES)");
  assert.equal(boxRows(builtBlock.apartados[1].tables[0], "valor")?.at(-1)?.[0], "VALOR COMPARATIVO DE MERCADO (INMUEBLES):");
});

test("without a result the page keeps the data and leaves the values out", () => {
  const pending = { ...calculation, settings: { ...calculation.settings, subjectArea: null } };
  const [block] = marketDocumentBlocks(pending, null);
  assert.equal(printed(block.apartados[1].tables[0]).rows[0][3], "—");
  assert.equal(printed(block.apartados[1].tables[0]).schema?.summaryBoxes, undefined);
  assert.deepEqual(marketDocumentBlocks({ ...calculation, comparables: [] }, null), [], "no comparables, no page");
});

test("a factor the appraiser renamed keeps its name in the homologation", () => {
  const renamed: MarketCalculationDto = {
    ...calculation,
    settings: { ...calculation.settings, factorSlots: [{ type: "NEGOCIACION", label: "Comercialización" }, { type: "SUPERFICIE", label: "Superficie" }] },
  };
  const table = printed(marketDocumentBlocks(renamed, compute(renamed))[0].apartados[1].tables[0]);
  assert.deepEqual(table.columns.slice(4, 7), ["Comercialización", "Sup.", "FRe"]);
  assert.deepEqual(table.groups, [["FACTORES DE HOMOLOGACIÓN", 3]]);
});

test("the generated blocks replace the template placeholders, only once there is content", () => {
  const placeholders = ["mercadoVenta-block-1", "mercadoVenta-block-2"];
  const untouched = section([templateBlock("mercadoVenta-block-1"), templateBlock("mercadoVenta-block-2"), templateBlock("nota-del-perito")]);
  assert.equal(withGeneratedBlocks(untouched, "TERRENO_VENTA", [], { placeholderIds: placeholders }), untouched, "sin comparables no cambia");

  const blocks = marketDocumentBlocks(calculation, result());
  const updated = withGeneratedBlocks(untouched, "TERRENO_VENTA", blocks, { placeholderIds: placeholders });
  assert.deepEqual(updated.blocks.map((block) => block.id), [...blocks.map((block) => block.id), "nota-del-perito"]);

  // Saved documents return block ids in lower case.
  const saved = section([templateBlock("mercadoventa-block-1"), templateBlock("nota-del-perito")]);
  const updatedSaved = withGeneratedBlocks(saved, "TERRENO_VENTA", blocks, { placeholderIds: ["mercadoVenta-block-1"] });
  assert.deepEqual(updatedSaved.blocks.map((block) => block.id), [...blocks.map((block) => block.id), "nota-del-perito"]);
});

test("a valuation saved with the former three blocks gets the page in their place, with nothing left behind", () => {
  const former = ["comparables", "homologacion", "resumen"].map((part) => templateBlock(`motor-mercado-terreno_venta-${part}`));
  const saved = section([templateBlock("introduccion"), ...former, templateBlock("nota-del-perito"), templateBlock("motor-mercado-inmueble_venta-comparables")]);
  const updated = withGeneratedBlocks(saved, "TERRENO_VENTA", marketDocumentBlocks(calculation, result()));
  assert.deepEqual(updated.blocks.map((block) => block.id), [
    "introduccion", "motor-mercado-terreno_venta-enfoque", "nota-del-perito", "motor-mercado-inmueble_venta-comparables",
  ], "the blocks of another comparable type wait for their own calculation");
  assert.equal(withGeneratedBlocks(updated, "TERRENO_VENTA", marketDocumentBlocks(calculation, result())), updated, "and the next calculation changes nothing");
});

test("a reloaded document with the same results is left as is, so opening a valuation does not mark it modified", () => {
  const blocks = marketDocumentBlocks(calculation, result());
  // Saving and reloading renumbers labels and returns the stored schema with its keys in another order.
  const stored = (table: TableContent) => {
    const v2 = ensureTableV2(table);
    const schema = v2.schema as unknown as Record<string, unknown>;
    return { ...v2, schema: JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(schema).sort().reverse().map((key) => [key, schema[key]])))) } as unknown as TableContent;
  };
  const reloaded = section(blocks.map((block, index) => ({
    ...block,
    sectionLabel: `VII.${index + 1}`,
    apartados: block.apartados.map((apartado) => ({ ...apartado, id: apartado.id.toUpperCase(), tables: apartado.tables.map(stored) })),
  })));
  assert.equal(withGeneratedBlocks(reloaded, "TERRENO_VENTA", marketDocumentBlocks(calculation, result())), reloaded);

  const changed = { ...calculation, settings: { ...calculation.settings, adoptedUnitValue: 9500 } };
  const input = toMarketEngineInput(changed);
  assert.ok(input.ok);
  const next = withGeneratedBlocks(reloaded, "TERRENO_VENTA", marketDocumentBlocks(changed, computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG)));
  assert.notEqual(next, reloaded, "otro valor adoptado cambia el dictamen");
});

test("photos go to the annex after the appraiser's own blocks", () => {
  const annex = section([templateBlock("croquis")]);
  const photos = marketPhotoBlocks(calculation);
  assert.equal(photos[0].images.length, 1);
  const updated = withGeneratedBlocks(annex, "TERRENO_VENTA", photos, { kind: "fotos", position: "end" });
  assert.deepEqual(updated.blocks.map((block) => block.id), ["croquis", "motor-mercado-terreno_venta-fotos"]);
  // The photo block and the calculation blocks of the same type do not replace each other.
  const withCalculation = withGeneratedBlocks(updated, "TERRENO_VENTA", marketDocumentBlocks(calculation, result()));
  assert.ok(withCalculation.blocks.some((block) => block.id === "motor-mercado-terreno_venta-fotos"));
});

test("the engine input skips incomplete comparables and explains what is missing", () => {
  assert.deepEqual(toMarketEngineInput({ ...calculation, settings: { ...calculation.settings, subjectArea: null } }), {
    ok: false,
    reason: "Captura la superficie del sujeto.",
  });
  const withDraft = { ...calculation, comparables: [...calculation.comparables, { ...comparable(5, 150, 0), price: null }] };
  const input = toMarketEngineInput(withDraft);
  assert.ok(input.ok);
  assert.equal(input.input.comparables.length, 4);
});
