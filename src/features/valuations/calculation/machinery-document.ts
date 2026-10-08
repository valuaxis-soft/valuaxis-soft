/**
 * Turns the machinery and equipment calculation into the dictamen: one
 * generated block in the cost section and one in the market section, laid out
 * as the sheets «IV. ENF. COSTOS» and «V. ENF. MERCADO» of the firm's MEH book
 * print them.
 */
import { amountInWords } from "../engine/amount-in-words";
import type { MachineryCostResult, MachineryMarketResult } from "../engine/machinery";
import type { Apartado, Block } from "../model";
import type { TableSummaryBox } from "../services/table";
import { withSummaryBox } from "./cost-document";
import {
  EMPTY,
  figure,
  figureColumn,
  generatedApartado,
  generatedBlock,
  generatedTable,
  money,
  moneyColumn,
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
  type MachineryCostDto,
  type MachineryMarketDto,
} from "./machinery-types";
import { GENERATED_BLOCK_PREFIX } from "./market-document";
import { OFFER_LEVELS, OFFER_LEVEL_LABELS } from "./market-types";

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

/** The block of the cost section. None while the item cannot be computed. */
export function machineryCostBlocks(cost: MachineryCostDto, result: MachineryCostResult | null): Block[] {
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
          [textColumn("Otro"), textColumn("Horas", "center"), textColumn("Estado Físico", "center"), textColumn("Deficiencias"), textColumn("Piezas Especiales / Aditamentos"), textColumn("Notas")],
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
          figureColumn("FRe", { group: DEPRECIATION }),
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
            figureColumn("Obs. Tecno", { group: DEPRECIATION }), figureColumn("Obs. Eco", { group: DEPRECIATION }), figureColumn("FRe", { group: DEPRECIATION }),
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

/**
 * The block of the market section, with the subject of the cost capture next
 * to the offers. None while there are no offers.
 */
export function machineryMarketBlocks(market: MachineryMarketDto, subject: MachineryCostDto["item"], result: MachineryMarketResult | null): Block[] {
  const offers = market.offers.filter((row) => row.ref.trim());
  if (!offers.length) return [];
  const apartados: Apartado[] = [];

  if (market.offerLevel) {
    apartados.push(generatedApartado(`${MARKET_PREFIX}-oferta`, "BIENES SIMILARES EN VENTA", {
      tables: [generatedTable(`${MARKET_PREFIX}-tabla-oferta`, "Nivel de oferta",
        OFFER_LEVELS.map((level) => figureColumn(OFFER_LEVEL_LABELS[level])),
        [OFFER_LEVELS.map((level) => mark(level === market.offerLevel))],
        { notes: [{ position: "top", text: "Nivel de oferta observada durante la investigación de mercado." }] })],
    }));
  }

  apartados.push(generatedApartado(`${MARKET_PREFIX}-datos`, "DATOS DE COMPARABLES", {
    tables: [
      generatedTable(`${MARKET_PREFIX}-tabla-resumen`, "Resumen de comparables",
        [
          figureColumn("REF."), textColumn("Descripción"), textColumn("Marca", "center"), textColumn("Modelo", "center"), figureColumn("Año"),
          figureColumn("Horas"), textColumn("Aditamentos"), figureColumn("Fecha"), moneyColumn("Valor de Oferta"),
        ],
        offers.map((row) => [row.ref, cell(row.description), cell(row.brand), cell(row.model), cell(row.year), cell(row.hours), cell(row.attachments), cell(row.date), money(row.price ?? 0)]),
        { notes: [{ position: "top", label: "Obtención del valor unitario.", text: "Comparables de bienes en venta semejantes en uso al sujeto que se valúa." }] }),
      generatedTable(`${MARKET_PREFIX}-tabla-contacto`, "Información de contacto",
        [figureColumn("REF."), textColumn("Contacto"), textColumn("Empresa"), figureColumn("Teléfono"), textColumn("Correo"), textColumn("Link"), textColumn("Ubicación"), textColumn("Observaciones")],
        offers.map((row) => [row.ref, cell(row.contact), cell(row.company), cell(row.phone), cell(row.email), cell(row.link), cell(row.location), cell(row.notes)]),
        { compact: true }),
    ],
  }));

  const life = (row: { usefulLife: number | null }) => row.usefulLife ?? market.usefulLife;
  const remaining = (age: number | null, usefulLife: number | null) => (age === null || usefulLife === null ? EMPTY : whole(Math.max(usefulLife - age, 0)));
  const characteristics: [string, string, (row: (typeof offers)[number]) => string][] = [
    ["Marca", cell(subject.brand), (row) => cell(row.brand)],
    ["Modelo", cell(subject.model), (row) => cell(row.model)],
    ["Año", cell(subject.year), (row) => cell(row.year)],
    ["Horas", cell(subject.hours), (row) => cell(row.hours)],
    ["Ubicación", EMPTY, (row) => cell(row.location)],
    ["Edad", whole(subject.age), (row) => whole(row.age)],
    ["V.U.T.", whole(subject.usefulLife), (row) => whole(life(row))],
    ["V.U.R.", remaining(subject.age, subject.usefulLife), (row) => remaining(row.age, life(row))],
    ["Precio Oferta", EMPTY, (row) => (row.price === null ? EMPTY : money(row.price))],
  ];
  apartados.push(generatedApartado(`${MARKET_PREFIX}-caracteristicas`, "CARACTERÍSTICAS TÉCNICAS", {
    tables: [generatedTable(`${MARKET_PREFIX}-tabla-caracteristicas`, "Características técnicas",
      [textColumn("Concepto"), figureColumn("Sujeto"), ...offers.map((row) => figureColumn(`Comparable ${row.ref}`))],
      characteristics.map(([concept, subjectValue, value]) => [concept, subjectValue, ...offers.map(value)]))],
  }));

  const homologated = offers.filter((row) => isOfferComplete(row, market.usefulLife));
  const computed = new Map(result?.offers.map((row) => [row.id, row]) ?? []);
  if (result && homologated.length) {
    apartados.push(generatedApartado(`${MARKET_PREFIX}-homologacion`, "CÁLCULO DE V.N.R. HOMOLOGADO", {
      tables: [generatedTable(`${MARKET_PREFIX}-tabla-homologacion`, "V.N.R. homologado",
        [
          figureColumn("REF."), moneyColumn("Valor de Oferta"), figureColumn("F.E.E.S."), figureColumn("Gastos Instal."), figureColumn("Σ Gast"),
          moneyColumn("Valor de oferta puesto en sitio"),
          figureColumn("FEd", { group: HOMOLOGATION }),
          ...MACHINERY_FACTORS.map((factor) => figureColumn(factor.short, { group: HOMOLOGATION })),
          figureColumn("FRe", { group: HOMOLOGATION }),
          moneyColumn("V.N.R. Unitario Instalado"),
        ],
        homologated.map((row) => {
          const values = computed.get(row.ref);
          return [
            row.ref, money(row.price ?? 0), rate(row.fees), rate(row.installation), rate(row.fees + row.installation),
            money(values?.adjustedPrice ?? 0),
            figure(values?.ageFactor), ...MACHINERY_FACTORS.map((factor) => figure(row[factor.key])), figure(values?.resultantFactor),
            money(values?.value ?? 0),
          ];
        }),
        { summaryBoxes: [
          {
            id: "valores",
            position: "bottom",
            align: "end",
            caption: "Valores homologados resultantes",
            rows: [{ label: "Valor Prom. Homologado:", value: money(result.mean) }, { label: "Mediana:", value: money(result.median), emphasis: "strong" }],
          },
          closingBox("VALOR COMPARATIVO DE MERCADO:", result.value),
        ] })],
    }));
  }

  return [generatedBlock(MARKET_PREFIX, "ENFOQUE COMPARATIVO DE MERCADO", { apartados })];
}
