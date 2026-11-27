/**
 * Turns the market calculation into the dictamen: one block per comparable
 * type, laid out as the appraiser's own format (comparables data, homologation
 * with its factors, and the boxes that lead to the value), and the comparables'
 * photos in the annex. Generated blocks carry the GENERATED_BLOCK_PREFIX and
 * are rewritten on every calculation; the appraiser edits the data in the
 * calculation panel.
 */
import { printableAdvertiser } from "../services/advertiser-data";
import type { MarketApproachResult } from "../engine/market";
import type { AppSection, Block, TableContent } from "../model";
import { ensureTableV2, type GeneratedTableLayout, type TableNote, type TableSummaryBox, type TableSummaryRow } from "../services/table";
import { factorDecimals } from "./calculation-precision";
import { exchangeNote } from "./comparable-currency";
import { parseDecimal } from "./free-formula";
import {
  EMPTY,
  figure,
  figureColumn,
  resultantColumn,
  generatedApartado,
  generatedBlock,
  generatedColumnId,
  generatedRowIds,
  generatedTable,
  money,
  moneyColumn,
  offerOptionsTable,
  printedTable,
  squareMetres,
  textColumn,
} from "./generated-content";
import { layoutOf, sourceOf, withTableLayouts } from "./generated-table-layout";
import {
  COMPARABLE_TYPE_LABELS,
  FACTOR_TYPE_LABELS,
  MARKET_LABELS,
  characteristicFieldsOf,
  factorValue,
  findFactor,
  homologationBasisOf,
  homologatesAgainstLotOrSubject,
  isBuiltinCharacteristic,
  isLandComparableType,
  offerLabelsOf,
  offerMarkOf,
  printedCharacteristicFields,
  printsAdditionalAmount,
  printsHomologationTable,
  homologatesOf,
  shownStatistics,
  STATISTICS_BESIDE_ADOPTED,
  type CharacteristicField,
  type ComparableDto,
  type ComparableType,
  type FactorSlotConfig,
  type FactorType,
  type MarketCalculationDto,
  type MarketSettingsDto,
  type MarketStatistic,
  type StatisticKey,
  printedStatisticsOf,
} from "./market-types";
import { GENERATED_ID_PREFIX, withAppraiserLayout } from "./generated-block-layout";
import { formatComparableId } from "./comparable-card";
import { extraStatisticText } from "./market-statistics";
import {
  MARKET_LINK_TABLES,
  cardFieldLabel,
  linkedCellText,
  linkedColumnId,
  linkedColumnsOf,
  specLabel,
  type MarketLinkTable,
} from "./market-table-columns";

export const GENERATED_BLOCK_PREFIX = GENERATED_ID_PREFIX;

/** Template blocks of the market sections that the generated blocks stand in for. */
export const MARKET_TEMPLATE_BLOCK_IDS = [
  "mercadoVenta-block-1-comparables-de-mercado-en-venta",
  "mercadoVenta-block-2-homologacion-de-comparables-en-venta",
  "mercadoVenta-block-3-resumen-del-enfoque-de-mercado-en-venta",
];
export const RENT_TEMPLATE_BLOCK_IDS = [
  "mercadoRentas-block-1-comparables-de-mercado-de-rentas",
  "mercadoRentas-block-2-homologacion-de-rentas",
  "mercadoRentas-block-3-renta-estimada",
];

const SUBJECT_LAND_AREA_LABELS = ["superficie total de terreno", "superficie total terreno", "superficie de terreno"];
const SUBJECT_BUILT_AREA_LABELS = [
  "superficie total de construccion", "superficie total construida", "superficie de construccion", "superficie construida", "superficie total de construcciones",
];

/** The first area captured under one of the labels in the document ("169.78 m²"), as a number. */
function findSubjectArea(sections: AppSection[], labels: readonly string[]): number | null {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/gi, "").trim().toLowerCase();
  for (const section of sections) {
    for (const concept of section.blocks.flatMap((item) => [...item.concepts, ...item.apartados.flatMap((apartado) => apartado.concepts)])) {
      if (!labels.includes(normalize(concept.label))) continue;
      const match = concept.value.replace(/,/g, "").match(/\d+(\.\d+)?/);
      const area = match ? Number(match[0]) : NaN;
      if (area > 0) return area;
    }
  }
  return null;
}

/** Land area captured in the terreno, datos or carátula sections ("169.78 m²"), to suggest as the subject area. */
export function findSubjectLandArea(sections: AppSection[]): number | null {
  return findSubjectArea(sections, SUBJECT_LAND_AREA_LABELS);
}

/** Built area captured in the document (the carátula's "Superficie total de construcción"), for the markets of buildings. */
export function findSubjectBuiltArea(sections: AppSection[]): number | null {
  return findSubjectArea(sections, SUBJECT_BUILT_AREA_LABELS);
}

/**
 * The subject's area a market starts from: the land area for the markets of
 * land, the built area for the markets of buildings (video 6.3: the land's 360
 * showed as a hint in the buildings' field).
 */
export function suggestedSubjectAreaFor(type: ComparableType, areas: { land: number | null; built: number | null }): number | null {
  return isLandComparableType(type) ? areas.land : areas.built;
}

export function isGeneratedBlock(block: Pick<Block, "id">) {
  return block.id.startsWith(GENERATED_BLOCK_PREFIX);
}

const prefixFor = (type: ComparableType) => `${GENERATED_BLOCK_PREFIX}mercado-${type.toLowerCase()}`;

/** Wording of the page for each comparable type, as the appraiser's books title it. */
const PAGE: Record<ComparableType, {
  title: string;
  /** "(TERRENOS)" after the titles of the apartados. */
  scope: string;
  /** The apartado of the offer level, and the sentence under its title. */
  offerTitle: string;
  offerIntro: string;
  intro: string;
  area: string;
  shortArea: string;
  price: string;
  unit: string;
  /** Title of the homologation apartado. */
  homologation: string;
  homologated: string;
  mean: string;
  median: string;
  adopted: string;
  baseArea: string;
  subject: string;
  value: string;
}> = {
  TERRENO_VENTA: {
    title: "ENFOQUE COMPARATIVO DE MERCADO (TERRENOS)", scope: "(TERRENOS)",
    offerTitle: "TERRENOS SIMILARES EN VENTA",
    offerIntro: "Nivel de oferta observada durante la investigación de mercado de terrenos.",
    intro: "Comparables de terrenos en venta semejantes en uso al sujeto que se valúa.",
    area: "SUPERFICIE DE TERRENO (m²)", shortArea: "SUP. TERRENO (m²)",
    price: "OFERTA $ (TERRENO)", unit: "$/m²", homologation: "HOMOLOGACIÓN (TERRENOS)",
    homologated: "Valor Unitario Homologado", mean: "Valor Prom. Homologado", median: "Valor Mediana Homologado", adopted: "Valor homologado a utilizar",
    baseArea: "Lote Tipo", subject: "Lote Sujeto", value: "VALOR COMPARATIVO DE MERCADO (TERRENOS)",
  },
  INMUEBLE_VENTA: {
    title: "ENFOQUE COMPARATIVO DE MERCADO (INMUEBLES)", scope: "(INMUEBLES)",
    offerTitle: "INMUEBLES SIMILARES EN VENTA",
    offerIntro: "Nivel de oferta observada durante la investigación de mercado de inmuebles.",
    intro: "Comparables de inmuebles en venta semejantes en uso al sujeto que se valúa.",
    area: "SUP. CONSTRUIDA (m²)", shortArea: "SUP. CONSTR. (m²)",
    price: "OFERTA $ (INMUEBLE)", unit: "$/m²", homologation: "HOMOLOGACIÓN (INMUEBLES)",
    homologated: "Valor Unitario Homologado", mean: "Valor Prom. Homologado", median: "Valor Mediana Homologado", adopted: "Valor homologado a utilizar",
    baseArea: "Superficie Tipo", subject: "Superficie del Sujeto", value: "VALOR COMPARATIVO DE MERCADO (INMUEBLES)",
  },
  INMUEBLE_RENTA: {
    title: "MERCADO DE RENTAS", scope: "(INMUEBLES EN RENTA)",
    offerTitle: "INMUEBLES SIMILARES EN RENTA",
    offerIntro: "Nivel de oferta observada durante la investigación de mercado de rentas de inmuebles.",
    intro: "Comparables de inmuebles en renta semejantes en uso al sujeto que se valúa.",
    area: "SUP. RENTABLE (m²)", shortArea: "SUP. RENTABLE (m²)",
    price: "RENTA MENSUAL $", unit: "$/m²/mes", homologation: "HOMOLOGACIÓN (RENTAS)",
    homologated: "Renta Unitaria Homologada", mean: "Renta Prom. Homologada", median: "Renta Mediana Homologada", adopted: "Renta homologada a utilizar",
    baseArea: "Superficie Tipo", subject: "Superficie del Sujeto", value: "RENTA MENSUAL ESTIMADA DEL SUJETO",
  },
  TERRENO_RENTA: {
    title: "MERCADO DE RENTAS (TERRENOS)", scope: "(TERRENOS EN RENTA)",
    offerTitle: "TERRENOS SIMILARES EN RENTA",
    offerIntro: "Nivel de oferta observada durante la investigación de mercado de rentas de terrenos.",
    intro: "Comparables de terrenos en renta semejantes en uso al sujeto que se valúa.",
    area: "SUPERFICIE DE TERRENO (m²)", shortArea: "SUP. TERRENO (m²)",
    price: "RENTA MENSUAL $", unit: "$/m²/mes", homologation: "HOMOLOGACIÓN (RENTAS DE TERRENOS)",
    homologated: "Renta Unitaria Homologada", mean: "Renta Prom. Homologada", median: "Renta Mediana Homologada", adopted: "Renta homologada a utilizar",
    baseArea: "Lote Tipo", subject: "Lote Sujeto", value: "RENTA MENSUAL ESTIMADA DEL TERRENO",
  },
};

/** Above the homologation of the land rent market: its factors are those of the land sale market. */
export const SAME_FACTORS_AS_LAND_SALE =
  "Los factores de homologación considerados son los mismos que fueron empleados en el enfoque de mercado de venta de terrenos.";

/** The sentence above the offer level grid, unless the appraiser writes another. */
export const defaultOfferIntro = (type: ComparableType) => PAGE[type].offerIntro;

/**
 * Under the homologation table, as the appraiser's format reads the factors:
 * "bien" for any kind of good, a lot, a house or a machine (20 Oct 2026).
 */
export const DEFAULT_HOMOLOGATION_NOTE =
  "Cuando el factor de homologación es menor a la unidad denota que la oferta es mejor que el bien valuado.";

/** The note the market prints under its homologation: the appraiser's text or the format's; none when turned off. */
export function homologationNoteOf(settings: Pick<MarketCalculationDto["settings"], "showHomologationNote" | "homologationNote">) {
  if (settings.showHomologationNote === false) return null;
  return settings.homologationNote?.trim() || DEFAULT_HOMOLOGATION_NOTE;
}

/** Column titles of the factors as the books abbreviate them. */
const FACTOR_SHORT_LABELS: Record<FactorType, string> = {
  NEGOCIACION: "Neg.", UBICACION: "Ubic.", SUPERFICIE: "Sup.", ZONA: "Zona", FRENTE: "Frente", USO_SUELO: "Uso",
  SERVICIOS: "Serv.", CLASIFICACION: "Clas.", TOPOGRAFIA: "Top.", CALIDAD: "Cal.", CONSERVACION: "Cons.", EDAD: "Edad",
  FORMA: "Forma", PROYECTO: "Proy.", OTRO: "Otro",
};

/** A factor the appraiser renamed keeps the name given; the rest print abbreviated. */
const factorTitle = (slot: FactorSlotConfig) => (slot.label === FACTOR_TYPE_LABELS[slot.type] ? FACTOR_SHORT_LABELS[slot.type] : slot.label);

/** "2026-05-04" as 04/05/2026. */
const shortDate = (value: string | null) => value?.replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, "$3/$2/$1") ?? EMPTY;

const metres = (value: number | null | undefined) => (value ? `${figure(value)} m` : null);

/**
 * The land use column: the zoning key and its description, "AU-I/CS-D (Área
 * Urbana…)". A comparable captured before the key had its own field keeps both
 * in the description, and prints as it is.
 */
function landUseCell({ landUseKey, landUse }: ComparableDto) {
  if (!landUseKey) return landUse ?? EMPTY;
  return !landUse || landUse.startsWith(landUseKey) ? landUse ?? landUseKey : `${landUseKey} (${landUse})`;
}

/** A characteristic as the line prints it: figures with their units, texts as written. */
function printedCharacteristic(comparable: ComparableDto, field: CharacteristicField): string | null | undefined {
  const { key } = field;
  if (!isBuiltinCharacteristic(key)) return addedCharacteristicText(comparable.extra?.[key], field.kind);
  switch (key) {
    case "frontCount": return comparable.frontCount ? String(comparable.frontCount) : null;
    // The zoning key, without the description the land use column already gives.
    case "landUseKey": return comparable.landUseKey || comparable.landUse?.split(" (")[0];
    case "frontage": return metres(comparable.frontage);
    case "depth": return metres(comparable.depth);
    case "area": return comparable.area ? squareMetres(comparable.area) : null;
    // Without the space after the sign, so the amount is not cut at the end of a line.
    case "price": return comparable.price ? money(comparable.price).replace("$ ", "$") : null;
    default: return comparable[key];
  }
}

/** An added figure as the line prints it (V7.2-18): "12 m²" for an area, "2" for a number; what does not read as one, as written. */
export function addedCharacteristicText(text: string | undefined, kind: CharacteristicField["kind"]): string | undefined {
  if (!text || !kind) return text;
  const value = parseDecimal(text);
  if (value === null) return text;
  return kind === "area" ? squareMetres(value) : figure(value, Number.isInteger(value) ? 0 : 2);
}

/**
 * One line with what was captured of the comparable, in the order and with
 * the tags of the list of characteristics; or the appraiser's own text.
 */
export function characteristicsLine(comparable: ComparableDto, fields: CharacteristicField[]) {
  if (comparable.characteristicsText?.trim()) return comparable.characteristicsText.trim();
  return printedCharacteristicFields(fields)
    .map((field): [string, string | null | undefined] => [field.label, printedCharacteristic(comparable, field)])
    .filter(([, value]) => value)
    .map(([tag, value]) => `${tag}: ${value}`)
    .join(" ; ") || EMPTY;
}

/** What a comparable's row of the market's tables is keyed by: its id, so what the appraiser wrote in it moves with it. */
export const comparableRowKey = (id: string) => `cmp-${id}`;

/** A row keyed by a comparable's reference, as the tables were written before they followed the comparable's id. */
const REFERENCE_ROW = /^(r-.+-k-)(\d+)$/;

/** The table's layout with each of its row ids renamed: hidden rows, the appraiser's columns and rows, and the formats and styles of cells. */
function withRowsRenamed(layout: GeneratedTableLayout, rename: (rowId: string) => string): GeneratedTableLayout {
  const byKey = <T,>(record: Record<string, T> | undefined) => record && Object.fromEntries(Object.entries(record).map(([key, value]) => [rename(key), value]));
  // "rowId:columnId" keys of cell formats and styles; headers ("header:…") and the title stay.
  const byCell = <T,>(record: Record<string, T> | undefined) => record && Object.fromEntries(Object.entries(record).map(([key, value]) => {
    const at = key.lastIndexOf(":");
    return [at > 0 ? `${rename(key.slice(0, at))}${key.slice(at)}` : key, value];
  }));
  return {
    ...layout,
    ...(layout.hiddenRows ? { hiddenRows: layout.hiddenRows.map(rename) } : {}),
    ...(layout.extraColumns ? {
      extraColumns: layout.extraColumns.map((column) => ({ ...column, values: byKey(column.values) ?? {}, ...(column.cells ? { cells: byKey(column.cells) } : {}) })),
    } : {}),
    ...(layout.extraRows ? { extraRows: layout.extraRows.map((row) => ({ ...row, after: row.after === null ? null : rename(row.after) })) } : {}),
    ...(layout.cellFormats ? { cellFormats: byCell(layout.cellFormats) } : {}),
    ...(layout.cellStyles ? { cellStyles: byCell(layout.cellStyles) } : {}),
  };
}

/**
 * The market's pages as they are in the document, with the rows the tables
 * used to key by the comparable's reference keyed by its id: what the
 * appraiser wrote in each row (his own columns, hidden rows, formats) stays
 * with the comparable that is in that row now, and from then on follows it
 * when the comparables are reordered or one is deleted.
 */
export function withComparableRowIds(blocks: Block[], comparables: ReadonlyArray<Pick<ComparableDto, "id" | "reference">>): Block[] {
  const byReference = new Map(comparables.map((comparable) => [String(comparable.reference), comparable.id]));
  const rename = (rowId: string) => {
    const match = REFERENCE_ROW.exec(rowId);
    const id = match ? byReference.get(match[2]) : undefined;
    return match && id ? `${match[1]}${comparableRowKey(id).toLowerCase()}` : rowId;
  };
  const migrate = (tables: TableContent[]) => tables.map((table) => {
    const normalized = ensureTableV2(table);
    const generated = normalized.schema?.generated;
    if (!generated?.layout || !/-k-\d+[":]/.test(JSON.stringify(generated.layout))) return table;
    return { ...normalized, schema: { ...normalized.schema!, generated: { ...generated, layout: withRowsRenamed(generated.layout, rename) } } } as unknown as TableContent;
  });
  // Unchanged when nothing was keyed by reference: the same blocks, so the document is not touched.
  return blocks.map((block) => {
    const tables = migrate(block.tables);
    const apartados = block.apartados.map((apartado) => {
      const own = migrate(apartado.tables);
      return own.every((table, index) => table === apartado.tables[index]) ? apartado : { ...apartado, tables: own };
    });
    const same = tables.every((table, index) => table === block.tables[index]) && apartados.every((apartado, index) => apartado === block.apartados[index]);
    return same ? block : { ...block, tables, apartados };
  });
}

/** The block of the market section. None while there is nothing to show. */
export function marketDocumentBlocks(
  calculation: MarketCalculationDto,
  result: MarketApproachResult | null,
  /**
   * `capture`: the page as the editor captures in it, with the homologation table though the dictamen leaves it out; never saved.
   * `advertiserData`: the offers print the advertiser's name and phone (the carátula's «Incluir datos del anunciante…»; off by default).
   */
  options: { capture?: boolean; advertiserData?: boolean } = {},
): Block[] {
  const { settings } = calculation;
  // The editor sees the advertiser's name and phone it captured (video 8.9, 00:01); the dictamen prints them only when the carátula says so.
  const comparables = calculation.comparables.map((comparable) => printableAdvertiser(comparable, options.capture === true || options.advertiserData === true));
  // The structure of the calculation shows while it is empty (video 8.7: «que sí se vea la estructura siempre, para que no se pierdan»).
  if (!comparables.length && !options.capture) return [];
  const prefix = `${prefixFor(settings.comparableType)}-enfoque`;
  const page = PAGE[settings.comparableType];
  const words = MARKET_LABELS[settings.comparableType];
  const byReference = new Map(result?.homologation.comparables.map((row) => [row.id, row]) ?? []);
  const reference = (comparable: ComparableDto) => String(comparable.reference);
  const fields = characteristicFieldsOf(settings);
  // The appraiser's added columns follow each comparable by its id, also when the comparables are reordered (V7.2-14).
  const rowKeys = comparables.map((comparable) => comparableRowKey(comparable.id));
  const linked = (table: MarketLinkTable) => linkedColumnsOf(settings, table);
  const linkedColumns = (table: MarketLinkTable) => linked(table).map((field) => ({
    ...(field.figure ? figureColumn(columnTitle(field.label)) : textColumn(columnTitle(field.label))),
    id: linkedColumnId(field.key),
  }));
  const linkedCells = (table: MarketLinkTable, comparable: ComparableDto) => linked(table).map((field) => linkedCellText(field, comparable));
  const columns = marketTableColumns(settings);

  // The offer level of the market research: the options of the books (or the appraiser's), with an X on the one observed.
  // The editor always has its place, where it is chosen; the dictamen prints it once one is marked.
  const offerMark = offerMarkOf(settings);
  const offer = offerMark !== null || options.capture
    ? [generatedApartado(`${prefix}-oferta`, page.offerTitle, {
        tables: [offerOptionsTable(`${prefix}-tabla-oferta`, settings.offerIntro?.trim() || page.offerIntro, offerLabelsOf(settings), offerMark ?? -1)],
      })]
    : [];

  // An offer in dollars prints its dollars, the rate and its source under the offers; the table shows the pesos (24 Nov 2026).
  const exchangeNotes: TableNote[] = comparables.flatMap((comparable) => {
    const note = exchangeNote(comparable);
    return note ? [{ position: "bottom" as const, small: true, text: `Ref. ${reference(comparable)}: ${note}.` }] : [];
  });
  // The appraiser may leave the homologation table out of the dictamen: the offers then carry the statistics and the value.
  const homologationShown = options.capture ? homologatesOf(settings) : printsHomologationTable(settings);
  // In the editor, the advertiser's data are seen and said not to print, unless the carátula says so (matrix 1.5 bis).
  const advertiserNote: TableNote[] = options.capture && !options.advertiserData && comparables.some((comparable) => comparable.contactName || comparable.contactPhone)
    ? [{ position: "bottom", small: true, text: ADVERTISER_CAPTURE_NOTE }]
    : [];
  // As the appraiser's Excel: the comparables (ref., ID, location, land use, characteristics), then their offers and contact (video 8.10, 07:54).
  const data = generatedApartado(`${prefix}-datos`, `DATOS DE COMPARABLES ${page.scope}`, {
    tables: [
      generatedTable(`${prefix}-tabla-caracteristicas`, "Comparables",
        [
          figureColumn("REF."), { ...figureColumn("ID"), id: COMPARABLE_ID_COLUMN }, textColumn("UBICACIÓN"), textColumn("USO DE SUELO", "center"),
          textColumn("CARACTERÍSTICAS"), ...linkedColumns("caracteristicas"),
        ],
        comparables.map((comparable) => [
          reference(comparable),
          formatComparableId(comparable.folio) ?? EMPTY,
          comparable.location,
          landUseCell(comparable),
          characteristicsLine(comparable, fields),
          ...linkedCells("caracteristicas", comparable),
        ]),
        { notes: [{ position: "top", label: "Obtención del valor unitario.", text: page.intro }], rowKeys }),
      generatedTable(`${prefix}-tabla-ofertas`, "Datos de la oferta",
        [
          // Every column with its id: the contact came in after the others and keeps their place ids (col-1…col-7).
          { ...figureColumn("REF."), id: generatedColumnId(0) },
          ...columns.ofertas.map(({ id, field }) => {
            const title = columnTitle(cardFieldLabel(settings, field));
            return { ...(field === "sourceName" || field === "contactName" ? textColumn(title) : figureColumn(title)), id };
          }),
          { ...figureColumn(page.area), id: generatedColumnId(4) },
          { ...moneyColumn(page.price), id: generatedColumnId(5) },
          { ...moneyColumn(page.unit), id: generatedColumnId(6) },
          ...linkedColumns("ofertas"),
        ],
        comparables.map((comparable) => [
          reference(comparable),
          ...columns.ofertas.map(({ field }) => offerCell(comparable, field)),
          figure(comparable.area),
          comparable.price ? money(comparable.price) : EMPTY,
          comparable.area && comparable.price ? money(comparable.price / comparable.area) : EMPTY,
          ...linkedCells("ofertas", comparable),
        ]),
        homologationShown
          ? { rowKeys, ...(exchangeNotes.length || advertiserNote.length ? { notes: [...exchangeNotes, ...advertiserNote] } : {}) }
          : {
              rowKeys,
              summaryBoxes: homologationBoxes(calculation, result).filter((box) => box.position === "bottom"),
              notes: [...exchangeNotes, ...advertiserNote, ...justificationNotes(calculation)],
            }),
    ],
  });
  if (!homologationShown) return [generatedBlock(prefix, page.title, { apartados: [...offer, data] })];

  const slots = settings.factorSlots;
  const factors = "FACTORES DE HOMOLOGACIÓN";
  const decimals = factorDecimals(calculation.precision);
  const homologationNote = homologationNoteOf(settings);
  const homologation = generatedApartado(`${prefix}-homologacion`, page.homologation, {
    tables: [generatedTable(`${prefix}-tabla-homologacion`, "Homologación",
      [
        figureColumn("REF"), moneyColumn(page.price), figureColumn(page.shortArea), moneyColumn(`${words.unitValue} ${page.unit}`),
        ...slots.map((slot) => figureColumn(factorTitle(slot), { group: factors })),
        resultantColumn("FRe", factors),
        moneyColumn(`${page.homologated} ${page.unit}`),
        ...linkedColumns("homologacion"),
      ],
      comparables.map((comparable) => {
        const row = byReference.get(reference(comparable));
        return [
          reference(comparable),
          comparable.price ? money(comparable.price) : EMPTY,
          figure(comparable.area),
          row ? money(row.unitValue) : EMPTY,
          ...slots.map((slot) => {
            if (!row) return EMPTY;
            if (slot.type === "SUPERFICIE") return figure(row.surfaceFactor, decimals);
            return figure(factorValue(findFactor(comparable, slot)), decimals);
          }),
          row ? figure(row.resultantFactor, decimals) : EMPTY,
          row ? money(row.homologatedUnitValue) : EMPTY,
          ...linkedCells("homologacion", comparable),
        ];
      }),
      {
        rowKeys,
        summaryBoxes: homologationBoxes(calculation, result),
        notes: [
          ...(settings.comparableType === "TERRENO_RENTA" ? [{ position: "top" as const, text: SAME_FACTORS_AS_LAND_SALE }] : []),
          // Right under the table, before the values (video 5.3, 13:50), and the justification after it (video 8.13, 02:02).
          ...(homologationNote ? [{ position: "table" as const, text: homologationNote }] : []),
          ...justificationNotes(calculation),
        ],
      })],
  });

  return [
    generatedBlock(prefix, page.title, { apartados: [...offer, data, homologation] }),
  ];
}

/** A datum of the card as the header of its column: in capitals, as the headers of the books. */
const columnTitle = (label: string) => label.toLocaleUpperCase("es-MX");

/** The comparable's number in the firm's base (C-00091), beside its reference; its own id keeps the place ids of the others. */
const COMPARABLE_ID_COLUMN = "col-folio";

/** Under the offers, in the editor only: the advertiser's data are seen while capturing and print only when chosen. */
export const ADVERTISER_CAPTURE_NOTE =
  "El contacto y el teléfono del anunciante se ven aquí para verificar los comparables; el dictamen los imprime solo si activas «Incluir datos del anunciante en la memoria» en Carátula › Configuración del avalúo.";

/** What the column of a datum of the card in the offers prints for a comparable. */
function offerCell(comparable: ComparableDto, field: string): string {
  switch (field) {
    case "sourceName": return comparable.sourceName ?? EMPTY;
    case "contactName": return comparable.contactName ?? EMPTY;
    case "contactPhone": return comparable.contactPhone ?? EMPTY;
    case "offerDate": return shortDate(comparable.offerDate);
    default: return comparable.conservation ?? EMPTY;
  }
}

/**
 * The columns of the market's tables that are data of the card, by table:
 * their id and the datum (video 8.9: the columns and the cards read the same
 * name). The offers: source, phone, contact and, for land, the offer date
 * (the conservation for buildings, as the books); the columns the
 * appraiser linked follow in each table.
 */
export function marketTableColumns(settings: Pick<MarketSettingsDto, "comparableType" | "linkedColumns" | "characteristicFields" | "fieldLabels">) {
  const offersOfLand = isLandComparableType(settings.comparableType);
  const linked = (table: MarketLinkTable) => linkedColumnsOf(settings, table).map((field) => ({ id: linkedColumnId(field.key), field: field.key }));
  return {
    caracteristicas: linked("caracteristicas"),
    ofertas: [
      { id: generatedColumnId(1), field: "sourceName" },
      { id: generatedColumnId(2), field: "contactPhone" },
      { id: "col-contacto", field: "contactName" },
      { id: generatedColumnId(3), field: offersOfLand ? "offerDate" : "conservation" },
    ],
    ofertasLinked: linked("ofertas"),
    homologacion: linked("homologacion"),
  };
}

/** The datum of the card a column of a market's table shows, by the table's id and the column's; null when it is the calculation's. */
export function marketColumnField(settings: Pick<MarketSettingsDto, "comparableType" | "linkedColumns" | "characteristicFields" | "fieldLabels">, tableId: string, columnId: string): string | null {
  const columns = marketTableColumns(settings);
  const table = tableId.toLowerCase();
  const id = columnId.toLowerCase();
  const among = (list: Array<{ id: string; field: string }>) => list.find((column) => column.id === id)?.field ?? null;
  if (table.endsWith("-tabla-ofertas")) return among([...columns.ofertas, ...columns.ofertasLinked]);
  if (table.endsWith("-tabla-caracteristicas")) return among(columns.caracteristicas);
  if (table.endsWith("-tabla-homologacion")) return among(columns.homologacion);
  return null;
}

/** The table of a market's page a datum of the card is linked in, by the table's id. */
export function marketLinkTableOf(tableId: string): MarketLinkTable | null {
  const table = tableId.toLowerCase();
  return MARKET_LINK_TABLES.find((name) => table.endsWith(`-tabla-${name}`)) ?? null;
}

/** The homologation table of a market's page, and the column of each of its factors, in the order they multiply. */
export const marketHomologationTableId = (type: ComparableType) => `${prefixFor(type)}-enfoque-tabla-homologacion`;
/** The tables of a market's page, by name: where the editor puts what is captured above each one. */
export const marketTableId = (type: ComparableType, name: "oferta" | MarketLinkTable) => `${prefixFor(type)}-enfoque-tabla-${name}`;
export const marketFactorColumnId = (slotIndex: number) => generatedColumnId(4 + slotIndex);

/**
 * Where each datum the market captures sits in the tables of its page (the
 * table, the row of each comparable and the column), so the editor captures
 * it there. Kept beside the columns above: they are the same ones.
 */
export function marketCaptureColumns({ settings, comparables }: Pick<MarketCalculationDto, "settings" | "comparables">) {
  const prefix = `${prefixFor(settings.comparableType)}-enfoque`;
  const keys = comparables.map((comparable) => comparableRowKey(comparable.id));
  const table = (name: string) => `${prefix}-tabla-${name}`;
  const rows = (name: string) => generatedRowIds(table(name), keys.length, keys);
  return {
    characteristics: { table: table("caracteristicas"), rows: rows("caracteristicas"), location: generatedColumnId(1), landUse: generatedColumnId(2), text: generatedColumnId(3) },
    offers: { table: table("ofertas"), rows: rows("ofertas"), phone: generatedColumnId(2), area: generatedColumnId(4), price: generatedColumnId(5) },
    homologation: { table: table("homologacion"), rows: rows("homologacion"), factor: marketFactorColumnId },
    /** Under the homologation; under the offers when the market does not homologate. */
    adopted: { table: table(homologatesOf(settings) ? "homologacion" : "ofertas"), box: "valores.adoptado" },
  };
}

export const FACTOR_JUSTIFICATION_TITLE = "Justificación de los factores utilizados";

/** The general text without a title the appraiser typed at its start, so the title never prints twice. */
function withoutJustificationTitle(text: string) {
  const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const title = plain(FACTOR_JUSTIFICATION_TITLE);
  return plain(text).startsWith(title) ? text.slice(title.length).replace(/^[\s:.\-–]+/, "").trim() : text;
}

/**
 * "Justificación de los factores utilizados", right under the homologation
 * table, before its values and the market's value (video 8.13, 02:02: «va
 * debajo de esta tabla, antes de la conclusión»): its title, always on a line
 * of its own when there is any text (video 5.3, 12:42), then the general text
 * and each comparable's with its number, in the tones of the document's
 * palette (video 8.14, 36:29). The appraiser may leave it out of the dictamen.
 */
function justificationNotes({ settings, comparables }: MarketCalculationDto): TableNote[] {
  if (settings.showFactorJustification === false) return [];
  const general = withoutJustificationTitle(settings.justification?.trim() ?? "");
  const notes: TableNote[] = [
    ...(general ? [{ position: "table" as const, justification: true, text: general }] : []),
    ...comparables.flatMap((comparable) => {
      const text = comparable.factorJustification?.trim();
      return text ? [{ position: "table" as const, justification: true, label: `Comparable ${comparable.reference}:`, text }] : [];
    }),
  ];
  return notes.length ? [{ position: "table", justification: true, heading: true, text: FACTOR_JUSTIFICATION_TITLE }, ...notes] : [];
}

/** Above the homologation, what it is made against; below, the steps from the homologated values to the value. */
function homologationBoxes({ settings }: MarketCalculationDto, result: MarketApproachResult | null): TableSummaryBox[] {
  const subjectArea = settings.subjectArea;
  const page = PAGE[settings.comparableType];
  const againstBase = homologationBasisOf(settings) === "LOTE_TIPO";
  // Frente and fondo of what the homologation is made against: the typical lot of the zone, or the subject; only what was captured.
  // With the names the appraiser gave them in the specifications (video 8.10, 09:22: «fondo del sujeto o fondo del bien valuado»).
  const [frontLabel, depthLabel] = againstBase
    ? [`${specLabel(settings, "frontage", "Frente tipo en la zona")}:`, `${specLabel(settings, "depth", "Fondo tipo en la zona")}:`]
    : [`${specLabel(settings, "frontage", "Frente del sujeto")}:`, `${specLabel(settings, "depth", "Fondo del sujeto")}:`];
  const zone: TableSummaryBox = {
    id: "zona",
    position: "top",
    align: "end",
    rows: [
      ...(settings.typicalFrontage ? [{ id: "frente", label: frontLabel, value: metres(settings.typicalFrontage) as string }] : []),
      ...(settings.typicalDepth ? [{ id: "fondo", label: depthLabel, value: metres(settings.typicalDepth) as string }] : []),
    ],
  };
  const boxes: TableSummaryBox[] = [
    // As the format: both options, with an x on the one the homologation is made against; only land markets choose.
    ...(subjectArea && homologatesAgainstLotOrSubject(settings.comparableType) ? [{
      id: "base",
      position: "top" as const,
      align: "start" as const,
      caption: "Homologación de acuerdo a:",
      rows: [
        { label: `${specLabel(settings, "baseArea", page.baseArea)}:`, value: settings.baseArea ? squareMetres(settings.baseArea) : EMPTY, mark: againstBase },
        { label: `${specLabel(settings, "subjectArea", page.subject)}:`, value: squareMetres(subjectArea), mark: !againstBase },
      ],
    }] : []),
    ...(zone.rows.length ? [zone] : []),
  ];
  if (!result || !subjectArea) return boxes;

  const subjectLabel = specLabel(settings, "subjectArea", MARKET_LABELS[settings.comparableType].subjectArea.replace(" (m²)", ""));
  // The engine's own subtotal: area × adopted value, as the books, with or without a lote tipo.
  const subtotal = subjectArea * result.adoptedUnitValue;
  const stats = result.homologation.stats;
  const homologated = result.homologation.comparables.map((row) => row.homologatedUnitValue);
  // The statistics the appraiser marked, in the order chosen; each row carries its key, so its name follows it.
  const choice = printedStatisticsOf(settings);
  const statisticRow = (key: StatisticKey): TableSummaryRow => {
    const rows: Record<MarketStatistic, Omit<TableSummaryRow, "id">> = {
      offerMin: { label: `Mínimo de oferta (${page.unit}):`, value: money(stats.offerMin) },
      offerMax: { label: `Máximo de oferta (${page.unit}):`, value: money(stats.offerMax) },
      initialDispersion: { label: "Dispersión inicial:", value: figure(stats.initialDispersion, 2) },
      min: { label: `Mínimo homologado (${page.unit}):`, value: money(stats.min) },
      max: { label: `Máximo homologado (${page.unit}):`, value: money(stats.max) },
      dispersion: { label: "Dispersión final:", value: figure(stats.dispersion, 2) },
      mean: { label: `${page.mean} (${page.unit}):`, value: money(stats.mean) },
      median: { label: `${page.median} (${page.unit}):`, value: money(stats.median) },
    };
    const own = choice.labels?.[key]?.trim();
    const extra = choice.extra?.find((item) => item.id === key);
    const row: Omit<TableSummaryRow, "id"> = extra
      ? { label: `${own || extra.label}:`, value: extraStatisticText(extra, stats, homologated) ?? EMPTY }
      : { ...rows[key as MarketStatistic], ...(own ? { label: `${own}:` } : {}) };
    return { id: key, ...row };
  };
  const shown = shownStatistics(settings);
  boxes.push(
    { id: "sujeto", position: "bottom", align: "start", rows: [{ label: `${subjectLabel} (m²):`, value: squareMetres(subjectArea) }] },
    // Before and after homologating: the lowest and highest unit values and their dispersion (max / min).
    { id: "dispersion", position: "bottom", align: "start", rows: shown.filter((key) => !STATISTICS_BESIDE_ADOPTED.has(key)).map(statisticRow) },
    {
      id: "valores",
      position: "bottom",
      align: "end",
      rows: [
        ...shown.filter((key) => STATISTICS_BESIDE_ADOPTED.has(key)).map(statisticRow),
        { id: "adoptado", label: `${page.adopted} (${page.unit}):`, value: money(result.adoptedUnitValue), emphasis: "strong" },
      ],
    },
    {
      id: "valor",
      position: "bottom",
      align: "end",
      rows: [
        { id: "superficie", label: `${subjectLabel}:`, value: squareMetres(subjectArea) },
        { id: "subtotal", label: "Subtotal:", value: money(subtotal) },
        // Only when its box is marked (and it is in the calculation).
        ...(printsAdditionalAmount(settings) ? [{ id: "adicional", label: "Monto adicional a considerar:", value: settings.additionalAmount ? money(settings.additionalAmount) : "$ -" }] : []),
        { id: "valor", label: `${page.value}:`, value: money(result.value), emphasis: "total" },
      ],
    },
  );
  return boxes;
}

/**
 * The data a comparable's ficha prints under its photo: price, surface and
 * observations, each only when captured.
 */
function fichaData(comparable: MarketCalculationDto["comparables"][number]) {
  return [
    comparable.price ? `Precio: ${money(comparable.price)}` : null,
    comparable.area ? `Superficie: ${squareMetres(comparable.area)}` : null,
    comparable.notes?.trim() ? `Observaciones: ${comparable.notes.trim()}` : null,
  ].filter((part): part is string => part !== null);
}

/**
 * The comparables for the annex «Croquis y fotografías de comparables», as
 * fichas (video 8.14, 27 nov 2026: «con una foto de un comparable basta y
 * sus datos… como una mini ficha»): one per comparable, its main photo (the
 * first of its gallery) with its number and location above and its price,
 * surface and observations below, laid two per row. Until then every photo
 * of every comparable printed loose, without its data. A comparable without
 * photos has no ficha.
 */
export function marketPhotoBlocks(calculation: MarketCalculationDto): Block[] {
  const images = calculation.comparables.flatMap((comparable) => {
    const photo = comparable.photos[0];
    if (!photo) return [];
    const data = fichaData(comparable);
    return [
      {
        id: `${GENERATED_BLOCK_PREFIX}foto-${photo.id}`,
        title: `Comparable ${comparable.reference}: ${comparable.location}`,
        src: photo.url,
        // «Encuadre» and «Zoom» set on the comparable's photo (video 5.5).
        ...(photo.framing ? { framing: photo.framing } : {}),
        captions: [
          { id: "ficha-titulo", text: `C-${comparable.reference} · ${comparable.location}`, position: "top" as const, align: "center" as const },
          ...(data.length ? [{ id: "ficha-datos", text: data.join(" · "), position: "bottom" as const, align: "center" as const }] : []),
        ],
        enabled: true,
      },
    ];
  });
  if (!images.length) return [];
  const prefix = prefixFor(calculation.settings.comparableType);
  return [generatedBlock(`${prefix}-fotos`, `FOTOGRAFÍAS DE COMPARABLES: ${COMPARABLE_TYPE_LABELS[calculation.settings.comparableType].toUpperCase()}`, { images })];
}

/** The page of a market's approach: its name is the appraiser's once he renames it (video 8.7: «que sea modificable el nombre»). */
export const isRenamableGeneratedTitle = (blockId: string) => /^motor-(mercado-[a-z_]+-enfoque|maquinaria-mercado)$/i.test(blockId);

/** The block with the name the appraiser gave it, when it is one of those he names; the calculation writes the rest. */
function withAppraiserTitle(block: Block, previous: Block | undefined): Block {
  if (!previous || !isRenamableGeneratedTitle(block.id)) return block;
  const own = previous.title.trim();
  return own && own.toLocaleUpperCase("es-MX") !== block.title.trim().toLocaleUpperCase("es-MX") ? { ...block, title: own } : block;
}

/**
 * A block the calculation writes again, with what the appraiser chose for it
 * in its toolbar: hidden, its page break (`pageBreak`, or the older
 * `startOnNewPage`), its pages lying on their side and how its concepts read.
 * The calculation writes none of them.
 */
function withBlockPresentation(block: Block, previous: Block | undefined): Block {
  if (!previous) return block;
  return {
    ...block,
    ...(previous.enabled === false ? { enabled: false } : {}),
    ...(previous.titleHidden ? { titleHidden: true } : {}),
    ...(previous.pageBreak ? { pageBreak: previous.pageBreak } : {}),
    ...(previous.startOnNewPage !== undefined ? { startOnNewPage: previous.startOnNewPage } : {}),
    ...(previous.pageOrientation ? { pageOrientation: previous.pageOrientation } : {}),
    ...(previous.conceptPresentation ? { conceptPresentation: previous.conceptPresentation } : {}),
    ...(previous.removedApartados?.length ? { removedApartados: previous.removedApartados } : {}),
  };
}

/**
 * A block the calculation writes without the subbloques the appraiser
 * deleted from it (video 8.14, 01:47): they are not written again.
 */
export function withoutRemovedApartados(block: Block, removed: ReadonlyArray<string> | undefined): Block {
  if (!removed?.length) return block;
  const gone = new Set(removed.map((id) => id.toLowerCase()));
  const apartados = block.apartados.filter((apartado) => !gone.has(apartado.id.toLowerCase()));
  return apartados.length === block.apartados.length ? block : { ...block, apartados };
}

/**
 * Replaces the generated blocks a calculation owns in a section, where they
 * were or at `position`. Template placeholders they stand in for are dropped
 * once there is generated content. Returns the same section when nothing changes.
 */
export function replaceGeneratedBlocks(
  section: AppSection,
  owns: (block: Block) => boolean,
  blocks: Block[],
  options: {
    placeholderIds?: string[];
    position?: "start" | "end";
    /** Where new blocks go among the kept ones, before `position`; null leaves it to `position`. */
    placeAmong?: (kept: Block[]) => number | null;
  } = {},
): AppSection {
  // Saved block ids come back in lower case.
  const placeholders = new Set((blocks.length ? options.placeholderIds ?? [] : []).map((id) => id.toLowerCase()));
  const isPlaceholder = (item: Block) => placeholders.has(item.id.toLowerCase());
  const current = section.blocks.filter(owns);
  const previous = new Map(current.map((item) => [item.id.toLowerCase(), item]));
  // The columns the appraiser hid, renamed or added stay on the tables the calculation writes again,
  // and so do his own tables in the block and how its tables are laid out (side by side, their order).
  const laidOut = withTableLayouts(blocks, current).map((item) => {
    const before = previous.get(item.id.toLowerCase());
    return withAppraiserTitle(withAppraiserLayout(withoutRemovedApartados(item, before?.removedApartados), before), before);
  });
  if (sameContent(current, laidOut) && !section.blocks.some(isPlaceholder)) return section;
  // What the appraiser chose for a block stays when the calculation writes it again: hidden, its page break and orientation.
  const written = laidOut.map((item) => withBlockPresentation(item, previous.get(item.id.toLowerCase())));
  const firstIndex = section.blocks.findIndex((item) => owns(item) || isPlaceholder(item));
  const kept = section.blocks.filter((item) => !owns(item) && !isPlaceholder(item));
  const insertAt = firstIndex !== -1
    ? section.blocks.slice(0, firstIndex).filter((item) => kept.includes(item)).length
    : options.placeAmong?.(kept) ?? (options.position === "end" ? kept.length : 0);
  return { ...section, blocks: [...kept.slice(0, insertAt), ...written, ...kept.slice(insertAt)] };
}

/** The order the markets print in, as the appraiser's books: land before buildings for sale, buildings before land for rent. */
const PRINT_ORDER: ComparableType[] = ["TERRENO_VENTA", "INMUEBLE_VENTA", "INMUEBLE_RENTA", "TERRENO_RENTA"];

/**
 * A market's first pages go after the markets printed before it, or before
 * the ones printed after it, so land and buildings keep the books' order
 * whichever is captured first.
 */
function placeAmongMarkets(type: ComparableType, kind: "calculo" | "fotos") {
  const suffix = kind === "fotos" ? "-fotos" : "-enfoque";
  const rank = (block: Block) => PRINT_ORDER.findIndex((item) => block.id.startsWith(`${prefixFor(item)}${suffix}`));
  const own = PRINT_ORDER.indexOf(type);
  return (kept: Block[]) => {
    const ranks = kept.map(rank);
    const before = ranks.findLastIndex((value) => value !== -1 && value < own);
    if (before !== -1) return before + 1;
    const after = ranks.findIndex((value) => value > own);
    return after === -1 ? null : after;
  };
}

/** The market blocks of one comparable type, or its photo block (`kind: "fotos"`). */
export function withGeneratedBlocks(
  section: AppSection,
  type: ComparableType,
  blocks: Block[],
  options: { placeholderIds?: string[]; position?: "start" | "end"; kind?: "calculo" | "fotos"; comparables?: ReadonlyArray<Pick<ComparableDto, "id" | "reference">> } = {},
): AppSection {
  const photos = `${prefixFor(type)}-fotos`;
  const owns = options.kind === "fotos"
    ? (item: Block) => item.id.startsWith(photos)
    : (item: Block) => item.id.startsWith(prefixFor(type)) && !item.id.startsWith(photos);
  const { comparables, ...rest } = options;
  // Pages written before the rows followed the comparable's id take it now, by the comparable in each row.
  const renamed = comparables ? section.blocks.map((item) => (owns(item) ? withComparableRowIds([item], comparables)[0] : item)) : section.blocks;
  const migrated = renamed.some((item, index) => item !== section.blocks[index]) ? { ...section, blocks: renamed } : section;
  const next = replaceGeneratedBlocks(migrated, owns, blocks, { ...rest, placeAmong: placeAmongMarkets(type, options.kind ?? "calculo") });
  return next;
}

/** Compares what the dictamen shows, ignoring labels the editor renumbers and photo URLs that expire. */
function sameContent(left: Block[], right: Block[]) {
  const content = (item: Pick<Block, "concepts" | "tables" | "images">) => ({
    concepts: item.concepts.map((concept) => [concept.label, concept.value, concept.generatedLabel ?? null]),
    // What prints, and what the calculation wrote under the appraiser's columns (a hidden column may be shown again).
    tables: item.tables.map((table) => [printedTable(table), printedTable(sourceOf(table) as unknown as TableContent), layoutOf(table)]),
    images: item.images.map((image) => [image.id, image.title, image.framing ?? null]),
  });
  const shape = (blocks: Block[]) => JSON.stringify(blocks.map((item) => ({
    id: item.id,
    title: item.title,
    ...content(item),
    apartados: item.apartados.map((apartado) => ({ title: apartado.title, ...content(apartado) })),
  })));
  return shape(left) === shape(right);
}
