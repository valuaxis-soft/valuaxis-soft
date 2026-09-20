import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalValuationSections } from "../src/features/valuations/repositories/valuation.repository";
import { valuationSectionRegistry } from "../src/features/valuations/sections/section-registry";

test("workspace sections merge persisted aliases into one canonical section", () => {
  const sections = buildCanonicalValuationSections([
    dbSection(1, "datosGenerales", "Datos generales", 1, 1),
    dbSection(2, "datosgenerales", "Datos generales", 1, 0),
    dbSection(3, "mercadoVenta", "Mercado venta", 7, 0),
    dbSection(4, "mercadoventa", "Mercado venta", 7, 0),
    dbSection(5, "mapaComparables", "Indicadores", 15, 0),
    dbSection(6, "INDICADORES", "Indicadores", 15, 0),
  ] as never);

  const ids = sections.map((section) => section.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(sections.length, valuationSectionRegistry.length);
  assert.equal(sections.find((section) => section.id === "datosGenerales")?._count?.blocks, 1);
  assert.equal(sections.at(-1)?.id, "mapaComparables");
});

test("workspace sections rebuild persisted table columns rows and cells", () => {
  const sections = buildCanonicalValuationSections([
    dbSection(1, "datosGenerales", "Datos generales", 1, 0, [
      dbTable(1, "TABLA_PERSISTENCIA_001", ["COLUMNA_PERSISTENCIA_001"], [["123.45"]]),
    ]),
  ] as never);

  const datos = sections.find((section) => section.id === "datosGenerales");
  const table = datos?.blocks[0]?.tables[0];
  assert.equal(table?.title, "TABLA_PERSISTENCIA_001");
  assert.deepEqual(JSON.parse(table?.columns ?? "[]"), ["COLUMNA_PERSISTENCIA_001"]);
  assert.deepEqual(JSON.parse(table?.rows ?? "[]"), [["123.45"]]);
});

test("workspace replaces only an empty construction placeholder with the base structure", () => {
  const sections = buildCanonicalValuationSections([
    dbSection(7, "construccion", "CONSTRUCCION", 3, 0),
  ] as never);
  const construction = sections.find((section) => section.id === "construccion");

  assert.deepEqual(construction?.blocks.map((block) => block.title), [
    "DESCRIPCIÓN GENERAL DE LAS CONSTRUCCIONES",
    "ELEMENTOS DE CONSTRUCCIÓN",
    "INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS",
  ]);
  assert.equal(construction?.blocks[1].apartados[0].title, "OBRA GRUESA O NEGRA");
  assert.equal(
    construction?.blocks[0].apartados[0].tables[0].title,
    "TIPOS DE CONSTRUCCIONES, CALIDADES Y CLASIFICACIONES",
  );
});

test("workspace supplies the construction base when the persisted section is missing", () => {
  const sections = buildCanonicalValuationSections([] as never);
  const construction = sections.find((section) => section.id === "construccion");

  assert.equal(construction?.blocks.length, 3);
  assert.equal(construction?.blocks[1].apartados[0].title, "OBRA GRUESA O NEGRA");
});

test("workspace preserves meaningful persisted construction content", () => {
  const sections = buildCanonicalValuationSections([
    dbSection(8, "construccion", "CONSTRUCCION PERSONALIZADA", 3, 1),
  ] as never);
  const construction = sections.find((section) => section.id === "construccion");

  assert.equal(construction?.blocks.length, 1);
  assert.equal(construction?.blocks[0].title, "CONSTRUCCION PERSONALIZADA");
});

test("workspace upgrades empty registered placeholders with their matching templates", () => {
  const sections = buildCanonicalValuationSections([
    dbSection(20, "consideraciones", "CONSIDERACIONES", 4, 0),
    dbSection(21, "costos", "COSTOS", 5, 0),
    dbSection(22, "mercadoVenta", "MERCADO VENTA", 6, 0),
  ] as never);

  assert.equal(sections.find((section) => section.id === "consideraciones")?.blocks[0].title, "CONSIDERACIONES PREVIAS AL AVALÚO");
  const costs = sections.find((section) => section.id === "costos");
  assert.equal(costs?.blocks.length, 4);
  assert.deepEqual(JSON.parse(costs?.blocks[1].tables[0].columnKeys ?? "[]"), [
    "tipo",
    "descripcion",
    "superficie_m2",
    "valor_unitario",
    "edad",
    "vida_util",
    "factor_conservacion",
    "valor_neto",
  ]);
  assert.equal(sections.find((section) => section.id === "mercadoVenta")?.blocks.length, 3);
});

function dbSection(
  id: number,
  key: string,
  name: string,
  order: number,
  valueCount: number,
  tables = [] as unknown[],
) {
  return {
    IdSeccionDocumento: id,
    SClave: key,
    SNombre: name,
    IOrden: order,
    BVisible: true,
    BObligatoria: false,
    nodos: [
      {
        IdNodoDocumento: id * 10,
        IdNodoPadre: null,
        DFechaEliminacion: null,
        IOrden: 0,
        STitulo: name,
        BVisible: true,
        BObligatorio: false,
        valores: Array.from({ length: valueCount }, (_, index) => ({
          IdValorNodoDocumento: id * 100 + index,
          SValorTexto: `valor-${index}`,
          NValorNumerico: null,
          BValorBooleano: null,
          DValorFecha: null,
          JValorComplejo: null,
        })),
        tablasDocumentos: tables,
        nodosHijos: [],
      },
    ],
  };
}

function dbTable(id: number, title: string, columns: string[], rows: string[][]) {
  const mappedColumns = columns.map((name, index) => ({
    IdColumnaTablaDocumento: id * 100 + index,
    SNombre: name,
    IOrden: index,
    DFechaEliminacion: null,
  }));
  return {
    IdTablaDocumento: id,
    SNombre: title,
    IOrden: 0,
    JConfiguracion: { clientId: "tabla-persistencia-001" },
    columnas: mappedColumns,
    filas: rows.map((row, rowIndex) => ({
      IdFilaTablaDocumento: BigInt(id * 1000 + rowIndex),
      IOrden: rowIndex,
      BActivo: true,
      celdas: row.map((cell, cellIndex) => ({
        IdCeldaTablaDocumento: BigInt(id * 10000 + rowIndex * 10 + cellIndex),
        IdColumnaTablaDocumento: mappedColumns[cellIndex].IdColumnaTablaDocumento,
        SValorTexto: cell,
        NValorNumerico: null,
        BValorBooleano: null,
        DValorFecha: null,
        JValorComplejo: null,
      })),
    })),
  };
}
