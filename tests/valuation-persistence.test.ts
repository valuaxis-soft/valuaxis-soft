import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const root = process.cwd();
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

test("renombrar un bloque no crea valor de nodo estructural", () => {
  const workflow = readFileSync(join(root, "src/features/valuations/services/valuation-workflow.service.ts"), "utf8");
  const blockUpsert = /const node = await upsertDocumentNode\(\{[\s\S]*?kind: "block"[\s\S]*?syncConcepts/.exec(workflow)?.[0] ?? "";

  assert.match(blockUpsert, /upsertDocumentNode/);
  assert.doesNotMatch(blockUpsert, /upsertNodeValue/);
});

test("cambiar un valor JSON previo a texto no deja dos columnas ocupadas", () => {
  const previous = valueColumns({ respuesta: "json-previo" });
  assert.deepEqual(occupiedColumns(previous), ["JValorComplejo"]);

  const updateData = { ...emptyValueColumns(), ...valueColumns("ahora texto") };
  assert.deepEqual(occupiedColumns(updateData), ["SValorTexto"]);
  assert.equal(updateData.JValorComplejo, Prisma.DbNull);
});

test("guardar direccion y codigo postal usa Propiedad y DireccionPropiedad normalizadas", () => {
  const saveValuation = readFileSync(join(root, "src/features/valuations/actions/save-valuation.ts"), "utf8");

  assert.match(saveValuation, /syncSubjectPropertyAndAddress/);
  assert.match(saveValuation, /tx\.propiedad\.(create|update)/);
  assert.match(saveValuation, /tx\.direccionPropiedad\.(create|update)/);
  assert.match(saveValuation, /SDireccionCompleta: location/);
  assert.match(saveValuation, /SCodigoPostal: postalCode/);
  assert.match(saveValuation, /IdPropiedadSujeto/);
});

test("recargar el avaluo conserva direccion y codigo postal desde la propiedad sujeto", () => {
  const repository = readFileSync(join(root, "src/features/valuations/repositories/valuation.repository.ts"), "utf8");

  assert.match(repository, /propiedadSujeto: \{ include: \{ direccionesPropiedad: true \} \}/);
  assert.match(repository, /location: currentAddress\(valuation\.propiedadSujeto\?\.direccionesPropiedad\)/);
  assert.match(repository, /postalCode: currentPostalCode\(valuation\.propiedadSujeto\?\.direccionesPropiedad\)/);
});

test("guardar e hidratar conceptos conserva metadatos opcionales desde JConfiguracion", () => {
  const workspace = readFileSync(join(root, "src/features/valuations/components/workspace/valuation-workspace.tsx"), "utf8");
  const repository = readFileSync(join(root, "src/features/valuations/repositories/valuation.repository.ts"), "utf8");
  const workflow = readFileSync(join(root, "src/features/valuations/services/valuation-workflow.service.ts"), "utf8");

  assert.match(workspace, /id: c\.id,[\s\S]*label: c\.label,[\s\S]*value: c\.value,[\s\S]*enabled: true,[\s\S]*layoutSpan: c\.layoutSpan,[\s\S]*type: c\.type,[\s\S]*labelKey: c\.labelKey,[\s\S]*valueKey: c\.valueKey,/);
  assert.match(repository, /JConfiguracion: Prisma\.JsonValue \| null/);
  assert.match(repository, /type: conceptType\(node\.JConfiguracion\)/);
  assert.match(repository, /labelKey: conceptStringMetadata\(node\.JConfiguracion, "labelKey"\)/);
  assert.match(repository, /valueKey: conceptStringMetadata\(node\.JConfiguracion, "valueKey"\)/);
  assert.match(repository, /function conceptType\(config: Prisma\.JsonValue \| null\)/);
  assert.match(repository, /const payload = \(config as \{ payload\?: unknown \}\)\.payload;/);
  assert.match(repository, /readConceptType\(payload\)/);
  assert.match(repository, /"longText"/);
  assert.match(workflow, /export type ConceptPayload = \{[\s\S]*type\?: ConceptType;[\s\S]*labelKey\?: string;[\s\S]*valueKey\?: string;/);
});
test("guardar dos veces consecutivas reutiliza claves y upserts sin duplicar nodos", () => {
  const workflow = readFileSync(join(root, "src/features/valuations/services/valuation-workflow.service.ts"), "utf8");

  assert.match(workflow, /findFirst\(\{\s*where: \{\s*IdSeccionDocumento: input\.sectionId,[\s\S]*SClave: safeKey/);
  assert.match(workflow, /sourceKey && sourceKey !== safeKey && sourceKey\.length <= DOCUMENT_NODE_KEY_MAX_LENGTH/);
  assert.match(workflow, /where: \{\s*IdNodoDocumento_IdVersionAvaluo:/);
  assert.match(workflow, /where: \{\s*IdNodoDocumento_IOrden:/);
  assert.match(workflow, /where: \{\s*IdFilaTablaDocumento_IdColumnaTablaDocumento:/);
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
