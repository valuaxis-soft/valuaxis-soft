import assert from "node:assert/strict";
import test from "node:test";

import { construccionSection } from "../src/features/valuations/sections/construccion";
import { normalizeDbKey } from "../src/features/valuations/services/valuation-workflow.service";

test("Construcción inicia con tres bloques editables del formato de referencia", () => {
  assert.deepEqual(construccionSection.blocks.map((block) => [block.id, block.title]), [
    ["construccion_descripcion_general", "DESCRIPCIÓN GENERAL DE LAS CONSTRUCCIONES"],
    ["elementos_construccion", "ELEMENTOS DE CONSTRUCCIÓN"],
    ["instalaciones_especiales", "INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS"],
  ]);
  assert.equal(construccionSection.blocks.every((block) => !block.required), true);
  assert.equal(construccionSection.blocks.every((block) => block.enabled), true);
  assert.equal(construccionSection.blocks.every((block) => block.sectionLabel === ""), true);
});

test("Descripción general incluye campos exactos y tabla construccion_tipos con tres filas iniciales", () => {
  const block = construccionSection.blocks[0];
  assert.deepEqual(block.concepts.map((concept) => concept.label), [
    "Uso actual",
    "Distribución del bien",
    "Número de niveles",
    "Estado de conservación",
    "Calidad del proyecto",
    "Clase general del bien",
    "Calidad y clasificación de la construcción",
    "Clase de Edificio",
    "Unidades susceptibles a rentarse",
    "Grado de terminación de obra",
  ]);
  assert.equal(block.concepts.every((concept) => concept.value === ""), true);
  assert.equal(block.apartados.length, 1);
  assert.equal(block.apartados[0].id, "construccion_tipos");
  assert.equal(block.apartados[0].title, "TIPOS DE CONSTRUCCIONES, CALIDADES Y CLASIFICACIONES");

  const table = block.apartados[0].tables[0];
  assert.equal(table.id, "construccion_tipos");
  assert.deepEqual(table.columns, [
    "Tipo",
    "Tipo",
    "Clasificación",
    "Calidad",
    "Conservación",
    "Edad",
    "VUT",
    "VUR",
    "Sup. (m²)",
    "Descripción",
  ]);
  assert.deepEqual(table.columnKeys, [
    "tipo",
    "tipo_construccion",
    "clasificacion",
    "calidad",
    "conservacion",
    "edad",
    "vut",
    "vur",
    "sup_m2",
    "descripcion",
  ]);
  assert.deepEqual(table.rows, [
    ["T-1", "", "", "", "", "", "", "", "", ""],
    ["T-2", "", "", "", "", "", "", "", "", ""],
    ["T-3", "", "", "", "", "", "", "", "", ""],
  ]);
});

test("Elementos de construcción contiene franja introductoria y siete subbloques en orden exacto", () => {
  const block = construccionSection.blocks[1];
  assert.deepEqual(block.concepts.map(({ label, value }) => [label, value]), [
    ["Especificaciones observadas en la visita al bien salvo error u omisión.", ""],
  ]);
  assert.deepEqual(
    block.apartados.map((subBlock) => [
      subBlock.id,
      subBlock.title,
      subBlock.concepts.map((concept) => concept.label),
    ]),
    [
      ["obra_gruesa", "OBRA GRUESA O NEGRA", ["Cimentación", "Estructura", "Muros", "Entrepisos", "Techos", "Azoteas", "Bardas"]],
      ["acabados_interiores", "REVESTIMIENTOS Y ACABADOS INTERIORES", ["Aplanados", "Plafones", "Lambrines", "Pisos", "Zoclos", "Escaleras", "Pintura", "Recubrimientos Especiales"]],
      ["carpinteria", "CARPINTERÍA", ["Puertas de intercomunicación", "Puertas de closets", "Interiores de closet"]],
      ["instalaciones_hidraulicas", "INSTALACIONES HIDRÁULICAS Y SANITARIAS", ["Red hidráulica", "Red sanitaria", "Lavabos", "Muebles de baño", "Accesorios", "Canceles de baño"]],
      ["instalaciones_electricas", "INSTALACIONES ELÉCTRICAS", ["Tipo de instalación", "Materiales", "Salidas", "Tableros", "Tipo de Voltaje"]],
      ["herreria_canceleria", "HERRERÍA Y CANCELERÍA", ["Tipo de herrería", "Material de herrería", "Perfiles", "Claros", "Material Vidriería", "Tipo", "Espesor", "Espejos", "Domos", "Tragaluces"]],
      ["otros_construccion", "OTROS", ["Cerrajería", "Cocina", "Obra Exterior"]],
    ],
  );
});

test("Instalaciones especiales contiene tabla real con cinco filas y primera fila precargada", () => {
  const block = construccionSection.blocks[2];
  assert.equal(block.apartados.length, 1);
  assert.equal(block.apartados[0].id, "instalaciones_especiales_detalle");
  assert.equal(
    block.apartados[0].title,
    "INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS (I.E., E.A., O.C.)",
  );
  const table = block.apartados[0].tables[0];
  assert.equal(table.id, "instalaciones_especiales");
  assert.deepEqual(table.columns, [
    "#",
    "Tipo",
    "Edad",
    "VUT",
    "VUR",
    "Conservación",
    "Mantenimiento",
    "Descripción",
  ]);
  assert.deepEqual(table.columnKeys, [
    "numero",
    "tipo",
    "edad",
    "vut",
    "vur",
    "conservacion",
    "mantenimiento",
    "descripcion",
  ]);
  assert.deepEqual(table.rows, [
    ["1", "I.E.", "3", "7", "4", "bueno", "regular", "Aire acondicionado de 1 tonelada, con accesorios incluidos e instalado en sala principal."],
    ["2", "", "", "", "", "", "", ""],
    ["3", "", "", "", "", "", "", ""],
    ["4", "", "", "", "", "", "", ""],
    ["5", "", "", "", "", "", "", ""],
  ]);
});

test("Construcción usa claves internas cortas y seguras para persistencia documental", () => {
  const keys = [
    ...construccionSection.blocks.map((block) => block.id),
    ...construccionSection.blocks.flatMap((block) => block.apartados.map((subBlock) => subBlock.id)),
    ...construccionSection.blocks.flatMap((block) => block.apartados.flatMap((subBlock) => subBlock.tables.map((table) => table.id))),
    ...construccionSection.blocks.flatMap((block) => block.apartados.flatMap((subBlock) => subBlock.tables.flatMap((table) => table.columnKeys ?? []))),
  ];

  assert.ok(keys.length > 0);
  for (const key of keys) {
    assert.equal(key, normalizeDbKey(key, "fallback", 120));
    assert.ok(key.length <= 120, `${key} excede 120 caracteres`);
  }
});
