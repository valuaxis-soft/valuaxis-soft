/**
 * The master comparables workbook as a file: INICIO (destination, summary,
 * three steps, a quick view of the first rows and the two uses of one
 * capture), COMPARABLES (the grouped columns, dropdowns and the two helper
 * formulas), DICCIONARIO (each column with its stable key and rule, and the
 * import rules) and CATALOGOS (the lists). Empty, it is the template to
 * download; with rows, the export that imports back the same way. It holds
 * no example data.
 */
import ExcelJS from "exceljs";

import { MAX_IMPORT_ROWS } from "./comparable-import";
import {
  IMPORT_DESTINATIONS,
  IMPORT_DESTINATION_LABELS,
  MASTER_CATALOGS,
  MASTER_COLUMNS,
  MASTER_GROUPS,
  MASTER_HEADER_ROW,
  MASTER_SHEET,
  MASTER_TEMPLATE_VERSION,
  START_SHEET,
  columnLetter,
  controlFormula,
  masterLetter,
  unitPriceFormula,
  type ImportDestination,
  type MasterCatalog,
  type MasterRowValue,
} from "./comparable-master";

const NAVY = "FF0F3D6E";
const LIGHT = "FFEAF2FB";
const FORMULA = "FFFFF6D5";
const WHITE = "FFFFFFFF";
const GROUP_COLORS = ["FF0F3D6E", "FF1F6F8B", "FF3C7A3E", "FF8A5A14", "FF7A2E58", "FF4B4F9C", "FF5B6770"];
const CATALOG_SHEET = "CATALOGOS";
const DICTIONARY_SHEET = "DICCIONARIO";
/** Rows with formulas and dropdowns in an empty template: as many as one import takes. */
const TEMPLATE_ROWS = MAX_IMPORT_ROWS;

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Each catalog's column in CATALOGOS, as the dropdowns reference it. */
function catalogRanges() {
  const ranges = new Map<MasterCatalog | "destination", string>();
  const names = ["destination", ...Object.keys(MASTER_CATALOGS)] as Array<MasterCatalog | "destination">;
  names.forEach((name, index) => {
    const size = name === "destination" ? IMPORT_DESTINATIONS.length : MASTER_CATALOGS[name as MasterCatalog].options.length;
    const letter = columnLetter(index);
    ranges.set(name, `${CATALOG_SHEET}!$${letter}$2:$${letter}$${size + 1}`);
  });
  return ranges;
}

function addCatalogs(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet(CATALOG_SHEET);
  const lists: Array<[string, string[]]> = [
    ["Destino", IMPORT_DESTINATIONS.map((item) => IMPORT_DESTINATION_LABELS[item])],
    ...Object.values(MASTER_CATALOGS).map((catalog): [string, string[]] => [catalog.title, catalog.options]),
  ];
  lists.forEach(([title, options], index) => {
    const column = sheet.getColumn(index + 1);
    column.width = Math.max(14, ...options.map((option) => option.length + 2));
    sheet.getCell(1, index + 1).value = title;
    options.forEach((option, row) => { sheet.getCell(row + 2, index + 1).value = option; });
  });
  sheet.getRow(1).font = { bold: true, color: { argb: WHITE } };
  sheet.getRow(1).fill = fill(NAVY);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addComparables(workbook: ExcelJS.Workbook, rows: Array<Record<string, MasterRowValue>>, ranges: ReturnType<typeof catalogRanges>) {
  const sheet = workbook.addWorksheet(MASTER_SHEET, { views: [{ state: "frozen", ySplit: MASTER_HEADER_ROW, xSplit: 1 }] });
  const lastColumn = MASTER_COLUMNS.length;
  sheet.getCell("A1").value = "VALUAXIS SOFT  /  CAPTURA MAESTRA DE COMPARABLES";
  sheet.getCell("A1").font = { bold: true, size: 14, color: { argb: NAVY } };
  sheet.getCell("A3").value = "Una fila = una oferta comparable • celdas azul claro: captura • celdas amarillas: cálculo de ayuda • no renombres los encabezados.";
  sheet.getCell("A3").font = { italic: true, color: { argb: "FF555555" } };
  sheet.getCell(`${columnLetter(18)}3`).value = "Datos observados ≠ valor homologado: los factores se capturan en el avalúo.";
  sheet.getCell(`${columnLetter(18)}3`).font = { italic: true, color: { argb: "FF555555" } };

  MASTER_COLUMNS.forEach((item, index) => { sheet.getColumn(index + 1).width = item.width; });
  // Group row: one merged band per group.
  MASTER_GROUPS.forEach((group, groupIndex) => {
    const first = MASTER_COLUMNS.findIndex((item) => item.group === groupIndex) + 1;
    const last = MASTER_COLUMNS.length - [...MASTER_COLUMNS].reverse().findIndex((item) => item.group === groupIndex);
    sheet.mergeCells(MASTER_HEADER_ROW - 1, first, MASTER_HEADER_ROW - 1, last);
    const cell = sheet.getCell(MASTER_HEADER_ROW - 1, first);
    cell.value = `${String(groupIndex + 1).padStart(2, "0")}  ${group.toUpperCase()}`;
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = fill(GROUP_COLORS[groupIndex]);
    cell.alignment = { vertical: "middle" };
  });
  const header = sheet.getRow(MASTER_HEADER_ROW);
  header.height = 34;
  MASTER_COLUMNS.forEach((item, index) => {
    const cell = header.getCell(index + 1);
    cell.value = item.header;
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = fill(GROUP_COLORS[item.group]);
    cell.alignment = { vertical: "middle", wrapText: true };
    if (item.rule) cell.note = item.rule;
  });

  const firstRow = MASTER_HEADER_ROW + 1;
  const lastRow = MASTER_HEADER_ROW + Math.max(TEMPLATE_ROWS, rows.length);
  for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber += 1) {
    const values = rows[rowNumber - firstRow];
    MASTER_COLUMNS.forEach((item, index) => {
      const cell = sheet.getCell(rowNumber, index + 1);
      if (item.kind === "formula") {
        cell.value = { formula: item.key === "unitPrice" ? unitPriceFormula(rowNumber) : controlFormula(rowNumber) };
        cell.fill = fill(FORMULA);
        if (item.key === "unitPrice") cell.numFmt = "#,##0.00";
        return;
      }
      cell.fill = fill(LIGHT);
      const value = values?.[item.key];
      if (value !== null && value !== undefined && value !== "") {
        cell.value = item.kind === "date" && typeof value === "string" && DAY.test(value) ? new Date(`${value}T12:00:00Z`) : value;
      }
      if (item.kind === "date") cell.numFmt = "dd/mm/yyyy";
      else if (item.kind === "integer") cell.numFmt = "0";
      else if (item.kind === "number") cell.numFmt = item.key === "latitude" || item.key === "longitude" ? "0.000000" : "#,##0.00";
      else if (item.key === "postalCode" || item.key === "publicationId" || item.key === "contactPhone") cell.numFmt = "@";
    });
  }
  // One validation per column range: ExcelJS squeezes per-cell ones into overlapping ranges, which Excel repairs.
  const validations = (sheet as unknown as { dataValidations: { add(address: string, validation: ExcelJS.DataValidation): void } }).dataValidations;
  MASTER_COLUMNS.forEach((item, index) => {
    if (!item.catalog) return;
    const letter = columnLetter(index);
    validations.add(`${letter}${firstRow}:${letter}${lastRow}`, {
      type: "list",
      allowBlank: true,
      formulae: [ranges.get(item.catalog) ?? ""],
      // A list of Valuaxis maps 1:1 and only takes its options; the appraiser's lists accept other words.
      showErrorMessage: MASTER_CATALOGS[item.catalog].strict,
      errorStyle: "stop",
      errorTitle: item.header,
      error: "Elige una opción de la lista.",
    });
  });
  sheet.autoFilter = { from: { row: MASTER_HEADER_ROW, column: 1 }, to: { row: MASTER_HEADER_ROW, column: lastColumn } };
  return lastRow;
}

function fillStart(sheet: ExcelJS.Worksheet, input: { destination: ImportDestination; valuationFolio: string | null; lastRow: number }, ranges: ReturnType<typeof catalogRanges>) {
  sheet.columns = Array.from({ length: 12 }, () => ({ width: 14 }));
  const section = (cell: string, text: string) => {
    sheet.getCell(cell).value = text;
    sheet.getCell(cell).font = { bold: true, color: { argb: WHITE } };
    sheet.mergeCells(`${cell}:L${cell.slice(1)}`);
    sheet.getCell(cell).fill = fill(NAVY);
  };
  const range = (key: string) => `${MASTER_SHEET}!$${masterLetter(key)}$${MASTER_HEADER_ROW + 1}:$${masterLetter(key)}$${input.lastRow}`;
  const at = (key: string, row: number) => `${MASTER_SHEET}!${masterLetter(key)}${row}`;

  sheet.getCell("A1").value = "VALUAXIS SOFT  |  PLANTILLA MAESTRA DE COMPARABLES";
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: NAVY } };
  sheet.getCell("A3").value = `Importar a un avalúo  +  conservar en la base general  |  Versión ${MASTER_TEMPLATE_VERSION}`;
  sheet.getCell("A3").font = { color: { argb: "FF555555" } };

  section("A5", "01  |  DESTINO DE LOS COMPARABLES");
  sheet.getCell("A7").value = "¿Dónde se usarán estos registros?";
  sheet.getCell("A7").font = { bold: true };
  const destination = sheet.getCell("D7");
  destination.value = IMPORT_DESTINATION_LABELS[input.destination];
  destination.fill = fill(LIGHT);
  destination.font = { bold: true };
  destination.dataValidation = {
    type: "list", allowBlank: false, formulae: [ranges.get("destination") ?? ""], showErrorMessage: true, errorStyle: "stop", error: "Elige una opción de la lista.",
  };
  sheet.getCell("G7").value = "Folio del avalúo";
  sheet.getCell("G7").font = { bold: true };
  const folio = sheet.getCell("J7");
  folio.value = input.valuationFolio ?? null;
  folio.fill = fill(LIGHT);
  folio.numFmt = "@";
  sheet.getCell("A9").value = {
    formula: `IF(D7="Solo base general","BASE GENERAL: cada publicación queda como una ficha del despacho, sin avalúo, lista para usarse después.",`
      + `IF(J7="","AVALÚO: anota el folio del avalúo en la columna «Folio avalúo» de cada comparable que vaya a él.",`
      + `"AVALÚO ${"+"} BASE: verifica que cada comparable del avalúo tenga su folio en la columna «Folio avalúo»."))`,
  };
  sheet.getCell("A9").font = { italic: true };
  sheet.getCell("A10").value = "Valuaxis toma este destino como el inicial al importar; lo confirmas en el sistema.";
  sheet.getCell("A10").font = { italic: true, color: { argb: "FF555555" } };

  section("A12", "02  |  RESUMEN AUTOMÁTICO DE CAPTURA");
  const summary: Array<[string, string, string]> = [
    ["A", "CAPTURADOS", `COUNTIF(${range("control")},"?*")`],
    ["D", "ACEPTADOS", `COUNTIF(${range("useStatus")},"Aceptado")`],
    ["G", "PENDIENTES", `A14-D14-COUNTIF(${range("useStatus")},"Descartado")`],
    ["J", "CON DATOS FALTANTES O ALERTAS", `COUNTIF(${range("control")},"FALTA*")+COUNTIF(${range("control")},"REVISAR*")`],
  ];
  for (const [column, label, formula] of summary) {
    sheet.getCell(`${column}13`).value = label;
    sheet.getCell(`${column}13`).font = { bold: true, size: 9 };
    sheet.getCell(`${column}14`).value = { formula };
    sheet.getCell(`${column}14`).font = { bold: true, size: 16, color: { argb: NAVY } };
    sheet.getCell(`${column}14`).fill = fill(FORMULA);
  }

  section("A17", "03  |  CÓMO UTILIZAR EL ARCHIVO (3 PASOS)");
  const steps: Array<[string, string]> = [
    ["1   DEFINIR DESTINO", "Elige «Ambos», «Solo avalúo» o «Solo base general». Para vincular comparables a un avalúo, anota su folio en la columna «Folio avalúo» de COMPARABLES."],
    ["2   CAPTURAR Y REVISAR", "Una fila por publicación en COMPARABLES. Marca «Aceptado» solo lo que verificaste; «Descartado» no se importa."],
    ["3   IMPORTAR A VALUAXIS", "Sube el archivo en Comparables o en el enfoque de mercado del avalúo, revisa errores, avisos y posibles duplicados, y confirma el destino."],
  ];
  steps.forEach(([title, text], index) => {
    const row = 19 + index * 2;
    sheet.getCell(`A${row}`).value = title;
    sheet.getCell(`A${row}`).font = { bold: true, color: { argb: NAVY } };
    sheet.mergeCells(`D${row}:L${row}`);
    sheet.getCell(`D${row}`).value = text;
    sheet.getCell(`D${row}`).alignment = { wrapText: true, vertical: "top" };
    sheet.getRow(row).height = 30;
  });

  section("A28", "04  |  VISTA RÁPIDA  —  PRIMERAS CINCO FILAS DE COMPARABLES");
  const quick: Array<[string, string, string]> = [
    ["A", "REFERENCIA", "ref"], ["C", "TIPO DE INMUEBLE", "propertyType"], ["E", "OPERACIÓN", "operation"],
    ["G", "MUNICIPIO", "municipality"], ["I", "OFERTA", "price"], ["K", "REVISIÓN", "useStatus"],
  ];
  for (const [column, label] of quick) {
    sheet.getCell(`${column}30`).value = label;
    sheet.getCell(`${column}30`).font = { bold: true, size: 9 };
  }
  for (let index = 0; index < 5; index += 1) {
    const source = MASTER_HEADER_ROW + 1 + index;
    for (const [column, , key] of quick) {
      const cell = sheet.getCell(`${column}${31 + index}`);
      cell.value = { formula: `IF(${at("control", source)}="","",${at(key, source)})` };
      if (key === "price") cell.numFmt = "#,##0.00";
    }
  }
  sheet.getCell("A37").value = "La vista lee las filas 7 a 11 de COMPARABLES; el archivo no trae publicaciones de ejemplo.";
  sheet.getCell("A37").font = { italic: true, color: { argb: "FF555555" } };

  section("A39", "05  |  DOS USOS PARA UNA MISMA CAPTURA");
  sheet.getCell("A41").value = "A   ENVIAR COMPARABLES A UN AVALÚO";
  sheet.getCell("G41").value = "B   CONSTRUIR LA BASE GENERAL";
  sheet.getCell("A41").font = { bold: true, color: { argb: NAVY } };
  sheet.getCell("G41").font = { bold: true, color: { argb: NAVY } };
  sheet.mergeCells("A42:F44");
  sheet.mergeCells("G42:L44");
  sheet.getCell("A42").value = "• Anota el folio en la columna «Folio avalúo».\n• Cada comparable se relaciona con el inmueble sujeto de ese avalúo.\n• La homologación y los factores pertenecen al avalúo, no al anuncio.";
  sheet.getCell("G42").value = "• Una sola ficha original por publicación (su número C-00000).\n• Se reutiliza en distintos avalúos.\n• Conserva la fuente, la fecha, el historial y la validación del valuador.";
  sheet.getCell("A42").alignment = { wrapText: true, vertical: "top" };
  sheet.getCell("G42").alignment = { wrapText: true, vertical: "top" };
  sheet.getCell("A46").value = `Las reglas de la importación están en la hoja ${DICTIONARY_SHEET}.`;
  sheet.getCell("A46").font = { italic: true, color: { argb: "FF555555" } };
}

/** The import rules, for whoever fills or programs against the workbook. */
const IMPORT_RULES = [
  "Se importa la hoja COMPARABLES, desde el renglón 7; cada fila es una ficha de oferta. Los encabezados se reconocen sin acentos ni mayúsculas.",
  `Hasta ${MAX_IMPORT_ROWS} comparables por archivo y 2 MB.`,
  "Errores (el renglón no se importa): sin ubicación ni calle, sin tipo de inmueble u operación cuando no se importa desde un mercado, un número o fecha ilegible, una opción que no es de la lista en Operación, Estado de uso, Moneda, Periodo, Base, Proximidad o Datos verificados, latitud sin longitud.",
  "Avisos (el renglón se importa): sin precio o sin la superficie de su base, base del unitario que no es la del mercado, precio en USD, renta anual (se guarda mensual, entre 12), origen portal sin URL, sin municipio, la misma publicación dos veces en el archivo.",
  "El precio unitario se vuelve a calcular en Valuaxis; las columnas «Precio unitario (auto)» y «Control automático» solo ayudan a capturar.",
  "La moneda se guarda como está; Valuaxis no convierte divisas.",
  "Duplicados: el mismo número de comparable (REF / ID), el mismo portal con el mismo ID de publicación, o la misma URL (sin parámetros ni fragmento) son el mismo comparable; también se buscan la misma dirección, el mismo teléfono con el mismo precio y la misma colonia con superficie y precio. Para cada uno eliges «Es el mismo», «Usar el existente» o «Son diferentes».",
  "Estado de uso: «Descartado» no se importa; «Pendiente» entra por revisar; «Aceptado» con «Datos verificados» = Sí entra verificado si tu usuario puede revisar comparables, si no, por revisar.",
  "Destino: «Solo base general» guarda cada fila en la base del despacho, sin avalúo. «Solo avalúo» y «Ambos» agregan cada fila al avalúo de su «Folio avalúo» (importando desde Comparables) o al avalúo abierto (importando desde su mercado); un comparable de un avalúo ya es parte de la base. Un folio que no existe o un avalúo concluido es un aviso: con «Ambos» la fila queda en la base.",
  "Contacto y teléfono son datos sensibles: se exportan solo a quien puede editar comparables y no entran a estadísticas.",
  "Los factores de homologación no se importan: dependen del avalúo y del sujeto, y se capturan en el avalúo.",
];

function addDictionary(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet(DICTIONARY_SHEET);
  sheet.columns = [{ width: 9 }, { width: 22 }, { width: 26 }, { width: 26 }, { width: 11 }, { width: 11 }, { width: 80 }];
  sheet.getCell("A1").value = `DICCIONARIO DE DATOS · PLANTILLA MAESTRA ${MASTER_TEMPLATE_VERSION}`;
  sheet.getCell("A1").font = { bold: true, size: 13, color: { argb: NAVY } };
  sheet.getCell("A2").value = "Cada encabezado de COMPARABLES con su clave estable, su tipo y su regla.";
  const header = sheet.getRow(4);
  header.values = ["Columna", "Sección", "Encabezado", "Clave estable", "Tipo", "Obligatorio", "Regla"];
  header.font = { bold: true, color: { argb: WHITE } };
  header.fill = fill(NAVY);
  const kinds: Record<string, string> = {
    text: "texto", number: "decimal", integer: "entero", date: "fecha", url: "url", catalog: "catálogo", formula: "fórmula",
  };
  MASTER_COLUMNS.forEach((item, index) => {
    const row = sheet.addRow([columnLetter(index), MASTER_GROUPS[item.group], item.header, item.apiKey, kinds[item.kind], item.required, item.rule]);
    row.getCell(7).alignment = { wrapText: true, vertical: "top" };
  });
  sheet.addRow([]);
  const title = sheet.addRow(["", "REGLAS DE LA IMPORTACIÓN"]);
  title.font = { bold: true, color: { argb: NAVY } };
  IMPORT_RULES.forEach((rule, index) => {
    const row = sheet.addRow([String(index + 1).padStart(2, "0"), rule]);
    sheet.mergeCells(row.number, 2, row.number, 7);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.height = 32;
  });
  sheet.views = [{ state: "frozen", ySplit: 4 }];
}

/**
 * The master workbook: empty (the template) or with the rows of an export.
 * `destination` and `valuationFolio` fill the INICIO sheet.
 */
export async function buildMasterWorkbook(input: {
  rows?: Array<Record<string, MasterRowValue>>;
  destination?: ImportDestination;
  valuationFolio?: string | null;
} = {}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Valuaxis";
  const ranges = catalogRanges();
  // INICIO goes first, but its formulas need the last row of COMPARABLES: it is filled after.
  const start = workbook.addWorksheet(START_SHEET);
  const lastRow = addComparables(workbook, input.rows ?? [], ranges);
  addDictionary(workbook);
  addCatalogs(workbook);
  fillStart(start, { destination: input.destination ?? "AMBOS", valuationFolio: input.valuationFolio ?? null, lastRow }, ranges);
  workbook.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
