/**
 * Turns the machinery and equipment calculation into the dictamen: one
 * generated block in the cost section and one in the market section, laid out
 * as the sheets «IV. ENF. COSTOS» and «V. ENF. MERCADO» of the firm's MEH book
 * print them. A vehicle (an automobile, a truck…) prints as the automobile
 * book does: the same tables, with its use in km where a machine's is in
 * hours.
 */
import { printableMachineryContact } from "../services/advertiser-data";
import { amountInWords } from "../engine/amount-in-words";
import type { MachineryCostResult, MachineryMarketResult } from "../engine/machinery";
import { describe, type HomologationStats } from "../engine/market";
import type { Apartado, Block } from "../model";
import type { TableNote, TableSummaryBox, TableSummaryRow } from "../services/table";
import { formatComparableId } from "./comparable-card";
import { withSummaryBox } from "./cost-document";
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
  percent,
  textColumn,
  whole,
} from "./generated-content";
import {
  MACHINERY_EXPENSES,
  MACHINERY_FACTORS,
  QUOTATION_KINDS,
  isAttachmentComplete,
  isOfferComplete,
  machineryFactorColumns,
  machineryOfferFactor,
  machineryStatisticsOf,
  type MachineryCostDto,
  type MachineryFactorColumn,
  type MachineryLinkTable,
  type MachineryMarketDto,
  type MachineryOfferDto,
} from "./machinery-types";
import { machineryFieldLabel, machineryLinkedFields, machineryOwnFieldLabel } from "./machinery-market-columns";
import { FACTOR_JUSTIFICATION_TITLE, GENERATED_BLOCK_PREFIX } from "./market-document";
import { extraStatisticText, statisticLabel } from "./market-statistics";
import { linkedColumnId } from "./market-table-columns";
import { offerLabelsOf, offerMarkOf, type PrintedStatistics, type StatisticKey } from "./market-types";

/** Prefix of every block the machinery calculation writes. */
export const MACHINERY_BLOCK_PREFIX = `${GENERATED_BLOCK_PREFIX}maquinaria`;
const COST_PREFIX = `${MACHINERY_BLOCK_PREFIX}-costos`;
const MARKET_PREFIX = `${MACHINERY_BLOCK_PREFIX}-mercado`;

export const isMachineryCostBlock = (block: Pick<Block, "id">) => block.id.startsWith(COST_PREFIX);
export const isMachineryMarketBlock = (block: Pick<Block, "id">) => block.id.startsWith(MARKET_PREFIX);

const DEPRECIATION = "Factores de Depreciación";
const HOMOLOGATION = "Factores de Homologación";
const cell = (value: string) => value.trim() || EMPTY;
const mark = (marked: boolean) => (marked ? "( X )" : "(   )");
/** An expense rate: "9%" as the book prints it, with decimals only when it has them. */
const rate = (value: number) => percent(value, Number.isInteger(Math.round(value * 1e6) / 1e4) ? 0 : 2);

/** The value that closes a page, with its amount in words under it, as the book prints it. */
const closingBox = (label: string, value: number): TableSummaryBox => ({
  id: "valor",
  position: "bottom",
  align: "end",
  rows: [{ label, value: money(value), emphasis: "total" }, { label: "Cifra en letras:", value: amountInWords(value) }],
});

/** Whether the valuation is of a vehicle (appraisal-subject.ts, `isVehicleEssence`): its use is read in km. */
export type MachineryDocumentOptions = {
  vehicle?: boolean;
  /** The contact table prints the advertiser's name, phone and email (the carátula's «Incluir datos del anunciante…»; off by default). */
  advertiserData?: boolean;
};

/** The book's names of the use of the good: hours of a machine; km of a vehicle (automobile book, H18, U22 and B63). */
export function machineryUseLabels(options: MachineryDocumentOptions = {}) {
  return options.vehicle
    ? { cost: "Kilometraje", summary: "Kms", characteristic: "Kilómetros" }
    : { cost: "Horas", summary: "Horas", characteristic: "Horas" };
}

/** The block of the cost section. None while the item cannot be computed. */
export function machineryCostBlocks(cost: MachineryCostDto, result: MachineryCostResult | null, options: MachineryDocumentOptions = {}): Block[] {
  if (!result) return [];
  const { item } = cost;
  // With the conservation applied once, the FCo of the item is not part of its resulting factor.
  const itemFactors = MACHINERY_FACTORS.filter((factor) => cost.conservationTwice || factor.key !== "conservation");
  const quotation = QUOTATION_KINDS.some((kind) => kind === item.quotationKind)
    ? [generatedTable(`${COST_PREFIX}-tabla-cotizacion`, "Cotización",
        QUOTATION_KINDS.map((kind) => figureColumn(kind)),
        [QUOTATION_KINDS.map((kind) => mark(kind === item.quotationKind))],
        { notes: [{ position: "top", text: "Cotización:" }] })]
    : [];

  const apartados: Apartado[] = [
    generatedApartado(`${COST_PREFIX}-identificacion`, "IDENTIFICACIÓN DEL BIEN", {
      tables: [
        generatedTable(`${COST_PREFIX}-tabla-identificacion`, "Identificación del bien",
          [textColumn("Nombre del Bien"), textColumn("Marca", "center"), textColumn("Modelo", "center"), textColumn("No. Serie", "center"), textColumn("No. Motor", "center"), textColumn("No. Matrícula", "center")],
          [[cell(item.name), cell(item.brand), cell(item.model), cell(item.serial), cell(item.engineNumber), cell(item.plate)]]),
        generatedTable(`${COST_PREFIX}-tabla-estado`, "Estado del bien",
          [textColumn("Otro"), textColumn(machineryUseLabels(options).cost, "center"), textColumn("Estado Físico", "center"), textColumn("Deficiencias"), textColumn("Piezas Especiales / Aditamentos"), textColumn("Notas")],
          [[cell(item.other), cell(item.hours), cell(item.physicalState), cell(item.deficiencies), cell(item.attachmentsNote), cell(item.notes)]]),
      ],
    }),
    generatedApartado(`${COST_PREFIX}-vrn-unitario`, "V.R.N. UNITARIO DEL BIEN", {
      tables: [
        ...quotation,
        generatedTable(`${COST_PREFIX}-tabla-vrn-unitario`, "V.R.N. unitario del bien",
          [
            textColumn("Proveedor"), textColumn("Teléfono / Email"), textColumn("País de origen", "center"),
            moneyColumn("Costo Moneda Origen"), figureColumn("Tipo de Cambio"), textColumn("Fecha Actualiza", "center"),
            moneyColumn("Valor de Cotización en MXN"), figureColumn("Otro"), moneyColumn("V.R.N. Unitario"),
          ],
          [[
            cell(item.supplier), cell(item.contact), cell(item.originCountry),
            money(item.quotedPrice ?? 0), figure(item.exchangeRate, 4), cell(item.quotationDate),
            money(result.item.quotedMxn), figure(item.otherFactor), money(result.item.newReplacementValue),
          ]]),
      ],
    }),
    generatedApartado(`${COST_PREFIX}-vrn-instalado`, "V.R.N. INSTALADO DEL BIEN", {
      tables: [generatedTable(`${COST_PREFIX}-tabla-vrn-instalado`, "V.R.N. instalado del bien",
        [...MACHINERY_EXPENSES.map((expense) => figureColumn(expense.label)), figureColumn("Suma de Gastos"), moneyColumn("V.R.N. Instalado")],
        [
          [...MACHINERY_EXPENSES.map((expense) => rate(item[expense.key])), rate(result.item.expensesRate), money(result.item.installedValue)],
          // As the book: customs and freight on the quotation in pesos, the rest on the unit V.R.N.
          [
            ...MACHINERY_EXPENSES.map((expense) =>
              money(item[expense.key] * (expense.key === "customs" || expense.key === "freight" ? result.item.quotedMxn : result.item.newReplacementValue))),
            money(result.item.expensesRate * result.item.newReplacementValue),
            "",
          ],
        ],
        item.expensesNotes.trim() ? { notes: [{ position: "bottom", label: "Notas:", text: item.expensesNotes.trim() }] } : {})],
    }),
    generatedApartado(`${COST_PREFIX}-vnr`, "V.N.R. UNITARIO INSTALADO DEL BIEN", {
      tables: [generatedTable(`${COST_PREFIX}-tabla-vnr`, "V.N.R. unitario instalado del bien",
        [
          textColumn("Tipo de Mantenimiento", "center"), figureColumn("Edad"), figureColumn("Vida Útil Total"),
          figureColumn("Factor Edad FEd", { group: DEPRECIATION }),
          ...itemFactors.map((factor) => figureColumn(factor.label, { group: DEPRECIATION })),
          resultantColumn("FRe", DEPRECIATION),
          moneyColumn("V.N.R. Unitario Instalado"),
        ],
        [[
          cell(item.maintenanceKind), figure(item.age, 0), figure(item.usefulLife, 0),
          figure(result.item.ageFactor), ...itemFactors.map((factor) => figure(item[factor.key])), figure(result.item.resultantFactor),
          money(result.item.value),
        ]],
        { summaryBoxes: [{ id: "vnr", position: "bottom", align: "end", rows: [{ label: "Valor Neto de Reposición del Bien (V.N.R.):", value: money(result.item.value), emphasis: "strong" }] }] })],
    }),
  ];

  const attachments = cost.attachments.filter(isAttachmentComplete);
  const computed = new Map(result.attachments.map((row) => [row.ref, row]));
  if (attachments.length) {
    apartados.push(generatedApartado(`${COST_PREFIX}-aditamentos`, "V.N.R. UNITARIO DE PIEZAS ESPECIALES / ADITAMENTOS", {
      tables: [
        generatedTable(`${COST_PREFIX}-tabla-aditamentos`, "Piezas especiales y aditamentos",
          [figureColumn("REF"), textColumn("Aditamento"), textColumn("Marca", "center"), textColumn("Proveedor", "center"), textColumn("Fuente"), moneyColumn("Cotización en MXN"), textColumn("Cotización", "center")],
          attachments.map((row) => [row.ref, cell(row.description), cell(row.brand), cell(row.supplier), cell(row.source), money(row.quotedPrice ?? 0), cell(row.quotationKind)])),
        generatedTable(`${COST_PREFIX}-tabla-aditamentos-vnr`, "V.N.R. de piezas especiales y aditamentos",
          [
            figureColumn("REF"), figureColumn("F.E.E.S."), figureColumn("Gastos Ing."), figureColumn("Gastos Instal."), figureColumn("Σ Gast"),
            moneyColumn("V.R.N. Instalado"), figureColumn("Edad"), figureColumn("VUT"), figureColumn("VUR"),
            figureColumn("FEd", { group: DEPRECIATION }), figureColumn("FCo", { group: DEPRECIATION }), figureColumn("FMt", { group: DEPRECIATION }),
            figureColumn("Obs. Tecno", { group: DEPRECIATION }), figureColumn("Obs. Eco", { group: DEPRECIATION }), resultantColumn("FRe", DEPRECIATION),
            moneyColumn("V.N.R. Unitario Instalado"),
          ],
          attachments.map((row) => {
            const values = computed.get(row.ref);
            const age = row.age ?? 0;
            const life = row.usefulLife ?? 0;
            return [
              row.ref, rate(row.fees), rate(row.engineering), rate(row.installation), rate(row.fees + row.engineering + row.installation),
              money(values?.installedValue ?? 0), figure(age, 0), figure(life, 0), figure(Math.max(life - age, 0), 0),
              figure(values?.ageFactor), figure(row.conservation), figure(row.maintenance), figure(row.technological), figure(row.economic), figure(values?.resultantFactor),
              money(values?.value ?? 0),
            ];
          }),
          { summaryBoxes: [{ id: "aditamentos", position: "bottom", align: "end", rows: [{ label: "Total V.N.R. de Piezas Especiales / Aditamentos:", value: money(result.attachmentsTotal), emphasis: "strong" }] }] }),
      ],
    }));
  }

  // The physical value closes the page, under the last table.
  const last = apartados[apartados.length - 1];
  const closed = { ...last, tables: last.tables.map((table, index) => (index === last.tables.length - 1 ? withSummaryBox(table, closingBox("VALOR FÍSICO DEL BIEN V.N.R.:", result.physicalValue)) : table)) };
  return [generatedBlock(COST_PREFIX, "ENFOQUE FÍSICO O DE COSTOS", { apartados: [...apartados.slice(0, -1), closed] })];
}

/** The tables of the market's page, by name: where the editor captures each datum (one table, 20 nov 2026). */
export type MachineryMarketTable = "oferta" | "resumen" | "contacto" | "caracteristicas" | "homologacion";
export const machineryMarketTableId = (name: MachineryMarketTable) => `${MARKET_PREFIX}-tabla-${name}`;

/** The columns of the homologation the calculation writes, by their ids: the same ones before and after factors are added or taken out. */
export const MACHINERY_HOMOLOGATION_COLUMNS = { ref: "col-1", price: "col-2", fees: "col-3", installation: "col-4", expenses: "col-5", onSite: "col-6", age: "col-7", resultant: "col-12", value: "col-13" } as const;
const BOOK_FACTOR_COLUMNS: Record<string, string> = { conservation: "col-8", maintenance: "col-9", technological: "col-10", economic: "col-11" };
/** The column of a factor: the book's keep the places they always had, the appraiser's their own id. */
export const machineryFactorColumnId = (key: string) => BOOK_FACTOR_COLUMNS[key] ?? `factor-${key.toLowerCase()}`;
/** The factor a column of the homologation is, by its id; null for the other columns. */
export const machineryFactorAt = (columns: readonly MachineryFactorColumn[], columnId: string) =>
  columns.findIndex((column) => machineryFactorColumnId(column.key) === columnId.toLowerCase());

/** The columns of the technical characteristics: the concept, the subject and one per offer. */
export const machineryCharacteristicColumn = { label: "col-1", subject: "col-2", offer: (place: number) => generatedColumnId(place + 2) } as const;

/** Rows of the technical characteristics the calculation writes before the appraiser's own (Marca, Modelo, Año, use, Ubicación). */
const DESCRIPTION_ROWS = 5;

/**
 * Where each datum of the offers sits in the tables of the page: the row of
 * each offer in the summary, the contact and the homologation, and in the
 * technical characteristics the row of each of the appraiser's own concepts
 * and those of the age and the useful life. In the editor every offer has
 * its rows, also those still being written.
 */
export function machineryCaptureRows(market: Pick<MachineryMarketDto, "offers" | "characteristics">) {
  const count = market.offers.length;
  const rows = (name: MachineryMarketTable) => generatedRowIds(machineryMarketTableId(name), count);
  const characteristics = generatedRowIds(machineryMarketTableId("caracteristicas"), DESCRIPTION_ROWS + market.characteristics.length + 4);
  return {
    resumen: rows("resumen"),
    contacto: rows("contacto"),
    homologacion: rows("homologacion"),
    characteristics: {
      free: characteristics.slice(DESCRIPTION_ROWS, DESCRIPTION_ROWS + market.characteristics.length),
      age: characteristics[DESCRIPTION_ROWS + market.characteristics.length],
      usefulLife: characteristics[DESCRIPTION_ROWS + market.characteristics.length + 1],
    },
  };
}

/** The statistics of the homologated values of the offers, as a real estate market's (the offers' are their asking prices). */
export function machineryStatistics(market: Pick<MachineryMarketDto, "offers">, result: MachineryMarketResult | null): HomologationStats | null {
  if (!result?.offers.length) return null;
  const prices = new Map(market.offers.map((offer) => [offer.ref, offer.price ?? 0]));
  return describe(result.offers.map((row) => row.value), result.offers.map((row) => prices.get(row.id) ?? row.adjustedPrice));
}

/** A statistic of the box as it prints: in pesos, a dispersion with two decimals; «—» when it cannot be computed. */
export function machineryStatisticText(key: StatisticKey, choice: PrintedStatistics, stats: HomologationStats, values: readonly number[]): string {
  const extra = choice.extra?.find((item) => item.id === key);
  if (extra) return extraStatisticText(extra, stats, values) ?? EMPTY;
  switch (key) {
    case "initialDispersion": return figure(stats.initialDispersion, 2);
    case "dispersion": return figure(stats.dispersion, 2);
    case "offerMin": case "offerMax": case "min": case "max": case "mean": case "median": return money(stats[key]);
    default: return EMPTY;
  }
}

/** Under the homologation, the appraiser's justification of the factors, with its title on a line of its own. */
const justificationNotes = (market: Pick<MachineryMarketDto, "justification">): TableNote[] => {
  const text = market.justification?.trim();
  return text ? [{ position: "bottom", heading: true, text: FACTOR_JUSTIFICATION_TITLE }, { position: "bottom", text }] : [];
};

/**
 * The block of the market section, with the subject of the cost capture next
 * to the offers, in the order of the book's sheet «V. ENF. MERCADO»: the
 * offer level, the summary of the comparables and their contact, the
 * technical characteristics against the subject, and the homologation with
 * its factors as columns, the statistics and the value. None while there
 * are no offers, except in the editor (`capture`), where the structure is
 * always there to capture in (video 8.7: «que sí se vea la estructura
 * siempre»), with every offer, also those still being written.
 */
export function machineryMarketBlocks(
  market: MachineryMarketDto,
  subject: MachineryCostDto["item"],
  result: MachineryMarketResult | null,
  options: MachineryDocumentOptions & { capture?: boolean } = {},
): Block[] {
  const capture = options.capture === true;
  const use = machineryUseLabels(options);
  // A row of the characteristics reads the book's name, or the one the appraiser gave the datum in a column.
  const rowLabel = (key: string, book: string) => machineryOwnFieldLabel(market, key) ?? book;
  // Each offer keeps its place in the capture: the free characteristics carry one value per place.
  const places = market.offers.map((row, place) => ({ row, place })).filter(({ row }) => capture || row.ref.trim());
  const offers = places.map(({ row }) => row);
  if (!offers.length && !capture) return [];
  const apartados: Apartado[] = [];

  // The offer level of the research: the options of the book (or the appraiser's), with an X on the one observed.
  // The editor always has its place, where it is chosen; the dictamen prints it once one is marked.
  const offerMark = offerMarkOf({ offerMark: market.offerMark ?? undefined, offerLevel: market.offerLevel, offerLabels: market.offerLabels });
  if (offerMark !== null || capture) {
    apartados.push(generatedApartado(`${MARKET_PREFIX}-oferta`, "BIENES SIMILARES EN VENTA", {
      tables: [offerOptionsTable(machineryMarketTableId("oferta"), market.offerIntro?.trim() || MACHINERY_OFFER_INTRO, offerLabelsOf({ offerLabels: market.offerLabels }), offerMark ?? -1)],
    }));
  }

  const linked = (table: MachineryLinkTable) => machineryLinkedFields(market, table);
  const linkedColumns = (table: MachineryLinkTable) => linked(table).map((field) => ({
    ...(field.figure ? figureColumn(plainLabel(field.key)) : textColumn(plainLabel(field.key))),
    id: linkedColumnId(field.key),
  }));
  const linkedCells = (table: MachineryLinkTable, offer: MachineryOfferDto) => linked(table).map((field) => field.text(offer));
  // The card's number in the firm's base, beside the reference, once an offer has one (the AI search's).
  const withFolio = offers.some((offer) => offer.folio);
  const plainLabel = (key: string) => machineryFieldLabel(market, key, options);

  apartados.push(generatedApartado(`${MARKET_PREFIX}-datos`, "DATOS DE COMPARABLES", {
    tables: [
      generatedTable(machineryMarketTableId("resumen"), "Resumen de comparables",
        [
          { ...figureColumn("REF."), id: "col-1" },
          ...(withFolio ? [{ ...figureColumn(plainLabel("folio")), id: "col-folio" }] : []),
          { ...textColumn(plainLabel("description")), id: "col-2" },
          { ...textColumn(plainLabel("brand"), "center"), id: "col-3" },
          { ...textColumn(plainLabel("model"), "center"), id: "col-4" },
          { ...figureColumn(plainLabel("year")), id: "col-5" },
          { ...figureColumn(plainLabel("hours")), id: "col-6" },
          { ...textColumn(plainLabel("attachments")), id: "col-7" },
          { ...figureColumn(plainLabel("date")), id: "col-8" },
          { ...moneyColumn(plainLabel("price")), id: "col-9" },
          ...linkedColumns("resumen"),
        ],
        offers.map((row) => [
          row.ref, ...(withFolio ? [formatComparableId(row.folio) ?? EMPTY] : []),
          cell(row.description), cell(row.brand), cell(row.model), cell(row.year), cell(row.hours), cell(row.attachments), cell(row.date),
          row.price === null ? (capture ? EMPTY : money(0)) : money(row.price),
          ...linkedCells("resumen", row),
        ]),
        { notes: [{ position: "top", label: "Obtención del valor unitario.", text: "Comparables de bienes en venta semejantes en uso al sujeto que se valúa." }] }),
      generatedTable(machineryMarketTableId("contacto"), "Información de contacto",
        [
          { ...figureColumn("REF."), id: "col-1" },
          { ...textColumn(plainLabel("contact")), id: "col-2" },
          { ...textColumn(plainLabel("company")), id: "col-3" },
          { ...figureColumn(plainLabel("phone")), id: "col-4" },
          { ...textColumn(plainLabel("email")), id: "col-5" },
          { ...textColumn(plainLabel("link")), id: "col-6" },
          { ...textColumn(plainLabel("location")), id: "col-7" },
          { ...textColumn(plainLabel("notes")), id: "col-8" },
          ...linkedColumns("contacto"),
        ],
        // The editor sees the advertiser's data it captured; the dictamen prints them only when the carátula says so.
        offers.map((offer) => ({ offer, shown: printableMachineryContact(offer, capture || options.advertiserData === true) }))
          .map(({ offer, shown: row }) => [
            row.ref, cell(row.contact), cell(row.company), cell(row.phone), cell(row.email), cell(row.link), cell(row.location), cell(row.notes),
            ...linkedCells("contacto", offer),
          ])),
    ],
  }));

  const life = (row: { usefulLife: number | null }) => row.usefulLife ?? market.usefulLife;
  const remaining = (age: number | null, usefulLife: number | null) => (age === null || usefulLife === null ? EMPTY : whole(Math.max(usefulLife - age, 0)));
  type Characteristic = [string, string, (row: (typeof offers)[number]) => string];
  // What the subject has no datum for here (it has no offer price, G75 of the book is blank; its location is the
  // valuation's, not one of these rows): blank, not the «—» of a datum still to capture, which the editor marks as missing.
  const NOT_APPLICABLE = "";
  // As the book: what describes the equipment first, the appraiser's own rows after it, and the lives and the price at the end.
  const description: Characteristic[] = [
    [rowLabel("brand", "Marca"), cell(subject.brand), (row) => cell(row.brand)],
    [rowLabel("model", "Modelo"), cell(subject.model), (row) => cell(row.model)],
    [rowLabel("year", "Año"), cell(subject.year), (row) => cell(row.year)],
    [rowLabel("hours", use.characteristic), cell(subject.hours), (row) => cell(row.hours)],
    [rowLabel("location", "Ubicación"), NOT_APPLICABLE, (row) => cell(row.location)],
  ];
  const figures: Characteristic[] = [
    [rowLabel("age", "Edad"), whole(subject.age), (row) => whole(row.age)],
    [rowLabel("usefulLife", "V.U.T."), whole(subject.usefulLife), (row) => whole(life(row))],
    ["V.U.R.", remaining(subject.age, subject.usefulLife), (row) => remaining(row.age, life(row))],
    [rowLabel("price", "Precio Oferta"), NOT_APPLICABLE, (row) => (row.price === null ? EMPTY : money(row.price))],
  ];
  const fixed = ([concept, subjectValue, value]: Characteristic) => [concept, subjectValue, ...offers.map(value)];
  // The editor keeps the rows still without a concept, to write it in them.
  const free = market.characteristics
    .filter((row) => capture || row.label.trim())
    .map((row) => [row.label.trim() || EMPTY, cell(row.subject), ...places.map(({ place }) => cell(row.values[place] ?? ""))]);
  apartados.push(generatedApartado(`${MARKET_PREFIX}-caracteristicas`, "CARACTERÍSTICAS TÉCNICAS", {
    tables: [generatedTable(machineryMarketTableId("caracteristicas"), "Características técnicas",
      [textColumn("Concepto"), figureColumn("Sujeto"), ...offers.map((row) => figureColumn(`Comparable ${row.ref}`))],
      [...description.map(fixed), ...free, ...figures.map(fixed)])],
  }));

  const homologated = capture ? offers : offers.filter((row) => isOfferComplete(row, market.usefulLife));
  const computed = new Map(result?.offers.map((row) => [row.id, row]) ?? []);
  if ((result && homologated.length) || capture) {
    const factors = machineryFactorColumns(market);
    const columns = MACHINERY_HOMOLOGATION_COLUMNS;
    const choice = machineryStatisticsOf(market);
    const stats = machineryStatistics(market, result);
    const values = result?.offers.map((row) => row.value) ?? [];
    const statisticRows: TableSummaryRow[] = stats
      ? choice.order.filter((key) => !choice.hidden.includes(key)).map((key) => ({ id: key, label: `${statisticLabel(choice, key)}:`, value: machineryStatisticText(key, choice, stats, values) }))
      : [];
    apartados.push(generatedApartado(`${MARKET_PREFIX}-homologacion`, "CÁLCULO DE V.N.R. HOMOLOGADO", {
      tables: [generatedTable(machineryMarketTableId("homologacion"), "V.N.R. homologado",
        [
          { ...figureColumn("REF."), id: columns.ref },
          { ...moneyColumn(plainLabel("price")), id: columns.price },
          { ...figureColumn(plainLabel("fees")), id: columns.fees },
          { ...figureColumn(plainLabel("installation")), id: columns.installation },
          { ...figureColumn("Σ Gast"), id: columns.expenses },
          { ...moneyColumn("Valor de oferta puesto en sitio"), id: columns.onSite },
          { ...figureColumn("FEd", { group: HOMOLOGATION }), id: columns.age },
          ...factors.map((factor) => ({ ...figureColumn(factor.label, { group: HOMOLOGATION }), id: machineryFactorColumnId(factor.key) })),
          { ...resultantColumn("FRe", HOMOLOGATION), id: columns.resultant },
          { ...moneyColumn("V.N.R. Unitario Instalado"), id: columns.value },
          ...linkedColumns("homologacion"),
        ],
        homologated.map((row) => {
          const values = computed.get(row.ref);
          return [
            row.ref, row.price === null ? EMPTY : money(row.price), rate(row.fees), rate(row.installation), rate(row.fees + row.installation),
            values ? money(values.adjustedPrice) : EMPTY,
            values ? figure(values.ageFactor) : EMPTY,
            ...factors.map((factor) => figure(machineryOfferFactor(row, factor.key))),
            values ? figure(values.resultantFactor) : EMPTY,
            values ? money(values.value) : EMPTY,
            ...linkedCells("homologacion", row),
          ];
        }),
        {
          summaryBoxes: result ? [
            { id: "valores", position: "bottom", align: "end", caption: "Valores homologados resultantes", rows: statisticRows },
            {
              id: "valor",
              position: "bottom",
              align: "end",
              rows: [
                ...(market.additionalAmount ? [{ id: "adicional", label: "Monto adicional a considerar:", value: money(market.additionalAmount) }] : []),
                { id: "valor", label: "VALOR COMPARATIVO DE MERCADO:", value: money(result.value), emphasis: "total" as const },
                { id: "letras", label: "Cifra en letras:", value: amountInWords(result.value) },
              ],
            },
          ] : [],
          notes: justificationNotes(market),
        })],
    }));
  }

  return [generatedBlock(MARKET_PREFIX, "ENFOQUE COMPARATIVO DE MERCADO", { apartados })];
}

/** The sentence over the offer level, unless the appraiser writes another. */
export const MACHINERY_OFFER_INTRO = "Nivel de oferta observada durante la investigación de mercado.";

