import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  emptyValueColumns,
  hasCapturableValue,
  limitDbText,
  normalizeDbKey,
  normalizeDocumentTableColumnForPersistence,
  normalizeDocumentTableRowForPersistence,
  valueColumns,
} from "../src/features/valuations/services/valuation-workflow.service";

const valueColumnNames = ["SValorTexto", "NValorNumerico", "BValorBooleano", "DValorFecha", "JValorComplejo"] as const;

test("crear un concepto y guardar texto ocupa solo SValorTexto", () => {
  const columns = valueColumns("Respuesta capturada");

  assert.equal(columns.SValorTexto, "Respuesta capturada");
  assert.deepEqual(occupiedColumns(columns), ["SValorTexto"]);
  assert.equal(hasCapturableValue("Respuesta capturada"), true);
});

test("editar el texto existente limpia todas las representaciones anteriores", () => {
  const updateData = { ...emptyValueColumns(), ...valueColumns("Texto editado") };

  assert.equal(updateData.SValorTexto, "Texto editado");
  assert.equal(updateData.NValorNumerico, null);
  assert.equal(updateData.BValorBooleano, null);
  assert.equal(updateData.DValorFecha, null);
  assert.equal(updateData.JValorComplejo, Prisma.DbNull);
});

test("renombrar un concepto sin respuesta no fuerza ValorNodoDocumento", () => {
  assert.equal(hasCapturableValue(""), false);
  assert.equal(hasCapturableValue("   "), false);
  assert.equal(hasCapturableValue(null), false);
  assert.equal(hasCapturableValue(undefined), false);
});

test("cambiar un valor JSON previo a texto no deja dos columnas ocupadas", () => {
  const previous = valueColumns({ respuesta: "json-previo" });
  assert.deepEqual(occupiedColumns(previous), ["JValorComplejo"]);

  const updateData = { ...emptyValueColumns(), ...valueColumns("ahora texto") };
  assert.deepEqual(occupiedColumns(updateData), ["SValorTexto"]);
  assert.equal(updateData.JValorComplejo, Prisma.DbNull);
});

test("las columnas documentales respetan los límites existentes sin perder la etiqueta completa", () => {
  const valid = normalizeDocumentTableColumnForPersistence({
    generatedKey: "tabla-column-1",
    label: "Tipo",
    index: 0,
  });
  assert.equal(valid.SClave, "tabla-column-1");
  assert.equal(valid.SNombre, "Tipo");

  const fullLabel = "Descripción técnica ".repeat(20);
  const normalized = normalizeDocumentTableColumnForPersistence({
    generatedKey: "construccion-".repeat(30),
    label: fullLabel,
    index: 2,
  });
  assert.ok(normalized.SClave.length <= 120);
  assert.ok(normalized.SNombre.length <= 180);
  assert.equal(normalized.JConfiguracion.fullLabel, fullLabel);
  assert.equal(normalized.JConfiguracion.sourceKey, "construccion-".repeat(30));
});

test("normalizeDbKey genera claves tecnicas cortas y estables", () => {
  assert.equal(normalizeDbKey("Superficie Vendible", "fallback", 120), "superficie_vendible");
  assert.equal(normalizeDbKey("Configuración y Topografía", "fallback", 120), "configuracion_y_topografia");
  assert.equal(normalizeDbKey("  Valor   Unitario  ", "fallback", 120), "valor_unitario");
  assert.equal(normalizeDbKey("", "Campo Vacío", 120), "campo_vacio");

  const longA = `${"bloque_".repeat(40)}a`;
  const longB = `${"bloque_".repeat(40)}b`;
  const normalizedA = normalizeDbKey(longA, "fallback", 120);
  const normalizedB = normalizeDbKey(longB, "fallback", 120);

  assert.ok(normalizedA.length <= 120);
  assert.ok(normalizedB.length <= 120);
  assert.notEqual(normalizedA, normalizedB);
});

test("limitDbText recorta textos visibles al limite de la columna", () => {
  assert.equal(limitDbText("Texto visible", 180), "Texto visible");
  assert.equal(limitDbText("x".repeat(181), 180).length, 180);
});

test("las filas documentales no usan ids largos de tabla como SClave", () => {
  const normalized = normalizeDocumentTableRowForPersistence({
    tableId: "tabla-con-id-descriptivo-".repeat(20),
    tableIndex: 4,
    index: 0,
  });

  assert.equal(normalized.SClave, "fila_0");
  assert.ok(normalized.SClave.length <= 120);
  assert.equal(normalized.JMetadatos.sourceKey, "tabla-con-id-descriptivo-".repeat(20));
});

function occupiedColumns(columns: ReturnType<typeof valueColumns>) {
  return valueColumnNames.filter((column) => {
    const value = columns[column];
    return value !== null && value !== Prisma.JsonNull && value !== Prisma.DbNull;
  });
}
