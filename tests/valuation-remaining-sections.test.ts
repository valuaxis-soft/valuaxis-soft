import assert from "node:assert/strict";
import test from "node:test";

import { createInitialSections } from "../src/features/valuations/sections";
import type { AppSection } from "../src/features/valuations/model";

const sections = createInitialSections();

test("las secciones valuatorias restantes exponen sus bloques base editables", () => {
  assert.deepEqual(blockTitles("consideraciones"), ["CONSIDERACIONES PREVIAS AL AVALÚO"]);
  assert.deepEqual(blockTitles("costos"), [
    "TERRENO",
    "CONSTRUCCIONES",
    "INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS",
    "RESUMEN DEL ENFOQUE DE COSTOS",
  ]);
  assert.deepEqual(blockTitles("mercadoVenta"), [
    "COMPARABLES DE MERCADO EN VENTA",
    "HOMOLOGACIÓN DE COMPARABLES EN VENTA",
    "RESUMEN DEL ENFOQUE DE MERCADO EN VENTA",
  ]);
  assert.deepEqual(blockTitles("mercadoRentas"), [
    "COMPARABLES DE MERCADO DE RENTAS",
    "HOMOLOGACIÓN DE RENTAS",
    "RENTA ESTIMADA",
  ]);
  assert.deepEqual(blockTitles("ingresos"), [
    "CAPITALIZACIÓN DE RENTAS",
    "TASA DE CAPITALIZACIÓN",
    "RESULTADO DEL ENFOQUE DE INGRESOS",
  ]);
  assert.deepEqual(blockTitles("conclusiones"), [
    "CONCLUSIÓN DEL VALOR",
    "DECLARACIONES Y CERTIFICACIÓN",
    "FIRMAS",
  ]);
});

test("Consideraciones contiene definiciones y doce comentarios con claves cortas", () => {
  const block = section("consideraciones").blocks[0];
  assert.deepEqual(block.apartados.map((subBlock) => subBlock.title), [
    "CONSIDERACIONES GENERALES",
    "DEFINICIONES",
    "COMENTARIOS GENERALES, SUPUESTOS Y CONDICIONES LIMITANTES DEL AVALÚO",
  ]);
  assert.equal(block.apartados[1].concepts.length, 24);
  assert.deepEqual(
    block.apartados[2].concepts.map((concept) => concept.id),
    Array.from({ length: 12 }, (_, index) => `comentario_${String(index + 1).padStart(2, "0")}`),
  );
});

test("los anexos registrados usan sus claves reales y una estructura mínima editable", () => {
  assert.deepEqual(blockTitles("fotosSujeto"), ["ANEXO FOTOGRÁFICO DEL SUJETO"]);
  assert.deepEqual(blockTitles("croquisComparables"), ["CROQUIS Y FOTOGRAFÍAS DE COMPARABLES"]);
  assert.deepEqual(blockTitles("homologacion"), ["FACTORES DE HOMOLOGACIÓN"]);
  assert.deepEqual(blockTitles("indirectos"), ["INDIRECTOS"]);
  assert.equal(section("fotosSujeto").blocks[0].images.length, 1);
  assert.equal(section("croquisComparables").blocks[0].images.length, 1);
});

test("todas las tablas nuevas tienen etiquetas y claves internas deterministas y seguras", () => {
  const scopedIds = new Set([
    "costos",
    "mercadoVenta",
    "mercadoRentas",
    "homologacion",
    "indirectos",
  ]);
  const tables = sections
    .filter((item) => scopedIds.has(item.id))
    .flatMap((item) => item.blocks)
    .flatMap((block) => [...block.tables, ...block.apartados.flatMap((subBlock) => subBlock.tables)]);

  assert.ok(tables.length >= 8);
  for (const table of tables) {
    assert.equal(table.columnKeys?.length, table.columns.length, table.title);
    assert.equal(new Set(table.columnKeys).size, table.columns.length, table.title);
    for (const key of table.columnKeys ?? []) {
      assert.match(key, /^[a-z0-9_]+$/);
      assert.ok(key.length <= 120);
    }
  }
});

function section(id: string): AppSection {
  const found = sections.find((item) => item.id === id);
  assert.ok(found, `No se encontró ${id}`);
  return found;
}

function blockTitles(id: string) {
  return section(id).blocks.map((block) => block.title);
}
