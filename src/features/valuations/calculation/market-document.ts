/**
 * Turns the market calculation into the dictamen: one block per comparable
 * type, laid out as the appraiser's own format (comparables data, homologation
 * with its factors, and the boxes that lead to the value), and the comparables'
 * photos in the annex. Generated blocks carry the GENERATED_BLOCK_PREFIX and
 * are rewritten on every calculation; the appraiser edits the data in the
 * calculation panel.
 */
import type { MarketApproachResult } from "../engine/market";
import type { AppSection, Block, TableContent } from "../model";
import type { TableNote, TableSummaryBox } from "../services/table";
import { factorDecimals } from "./calculation-precision";
import {
  EMPTY,
  figure,
  figureColumn,
  resultantColumn,
  generatedApartado,
  generatedBlock,
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
  isBuiltinCharacteristic,
  isLandComparableType,
  offerLabelsOf,
  offerMarkOf,
  printsAdditionalAmount,
  type CharacteristicField,
  type ComparableDto,
  type ComparableType,
  type FactorSlotConfig,
  type FactorType,
  type MarketCalculationDto,
} from "./market-types";

export const GENERATED_BLOCK_PREFIX = "motor-";

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

/** Land area captured in the terreno, datos or carátula sections ("169.78 m²"), to suggest as the subject area. */
export function findSubjectLandArea(sections: AppSection[]): number | null {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/gi, "").trim().toLowerCase();
  for (const section of sections) {
    for (const concept of section.blocks.flatMap((item) => [...item.concepts, ...item.apartados.flatMap((apartado) => apartado.concepts)])) {
      if (!SUBJECT_LAND_AREA_LABELS.includes(normalize(concept.label))) continue;
      const match = concept.value.replace(/,/g, "").match(/\d+(\.\d+)?/);
      const area = match ? Number(match[0]) : NaN;
      if (area > 0) return area;
    }
  }
  return null;
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
    homologated: "Valor Unitario Homologado", mean: "Valor Prom. Homologado", adopted: "Valor homologado a utilizar",
    baseArea: "Lote Tipo", subject: "Lote Sujeto", value: "VALOR COMPARATIVO DE MERCADO (TERRENOS)",
  },
  INMUEBLE_VENTA: {
    title: "ENFOQUE COMPARATIVO DE MERCADO (INMUEBLES)", scope: "(INMUEBLES)",
    offerTitle: "INMUEBLES SIMILARES EN VENTA",
    offerIntro: "Nivel de oferta observada durante la investigación de mercado de inmuebles.",
    intro: "Comparables de inmuebles en venta semejantes en uso al sujeto que se valúa.",
    area: "SUP. CONSTRUIDA (m²)", shortArea: "SUP. CONSTR. (m²)",
    price: "OFERTA $ (INMUEBLE)", unit: "$/m²", homologation: "HOMOLOGACIÓN (INMUEBLES)",
    homologated: "Valor Unitario Homologado", mean: "Valor Prom. Homologado", adopted: "Valor homologado a utilizar",
    baseArea: "Superficie Tipo", subject: "Superficie del Sujeto", value: "VALOR COMPARATIVO DE MERCADO (INMUEBLES)",
  },
  INMUEBLE_RENTA: {
    title: "MERCADO DE RENTAS", scope: "(INMUEBLES EN RENTA)",
    offerTitle: "INMUEBLES SIMILARES EN RENTA",
    offerIntro: "Nivel de oferta observada durante la investigación de mercado de rentas de inmuebles.",
    intro: "Comparables de inmuebles en renta semejantes en uso al sujeto que se valúa.",
    area: "SUP. RENTABLE (m²)", shortArea: "SUP. RENTABLE (m²)",
    price: "RENTA MENSUAL $", unit: "$/m²/mes", homologation: "HOMOLOGACIÓN (RENTAS)",
    homologated: "Renta Unitaria Homologada", mean: "Renta Prom. Homologada", adopted: "Renta homologada a utilizar",
    baseArea: "Superficie Tipo", subject: "Superficie del Sujeto", value: "RENTA MENSUAL ESTIMADA DEL SUJETO",
  },
  TERRENO_RENTA: {
    title: "MERCADO DE RENTAS (TERRENOS)", scope: "(TERRENOS EN RENTA)",
    offerTitle: "TERRENOS SIMILARES EN RENTA",
    offerIntro: "Nivel de oferta observada durante la investigación de mercado de rentas de terrenos.",
    intro: "Comparables de terrenos en renta semejantes en uso al sujeto que se valúa.",
    area: "SUPERFICIE DE TERRENO (m²)", shortArea: "SUP. TERRENO (m²)",
    price: "RENTA MENSUAL $", unit: "$/m²/mes", homologation: "HOMOLOGACIÓN (RENTAS DE TERRENOS)",
    homologated: "Renta Unitaria Homologada", mean: "Renta Prom. Homologada", adopted: "Renta homologada a utilizar",
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
function printedCharacteristic(comparable: ComparableDto, key: string): string | null | undefined {
  if (!isBuiltinCharacteristic(key)) return comparable.extra?.[key];
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

/**
 * One line with what was captured of the comparable, in the order and with
 * the tags of the list of characteristics; or the appraiser's own text.
 */
function characteristics(comparable: ComparableDto, fields: CharacteristicField[]) {
  if (comparable.characteristicsText?.trim()) return comparable.characteristicsText.trim();
  return fields
    .map((field): [string, string | null | undefined] => [field.label, printedCharacteristic(comparable, field.key)])
    .filter(([, value]) => value)
    .map(([tag, value]) => `${tag}: ${value}`)
    .join(" ; ") || EMPTY;
}

/** The block of the market section. None while there is nothing to show. */
export function marketDocumentBlocks(calculation: MarketCalculationDto, result: MarketApproachResult | null): Block[] {
  const { settings, comparables } = calculation;
  if (!comparables.length) return [];
  const prefix = `${prefixFor(settings.comparableType)}-enfoque`;
  const page = PAGE[settings.comparableType];
  const words = MARKET_LABELS[settings.comparableType];
  const byReference = new Map(result?.homologation.comparables.map((row) => [row.id, row]) ?? []);
  const reference = (comparable: ComparableDto) => String(comparable.reference);
  // The fourth column of the offers table: the books give the offer date for land and the conservation for buildings.
  const offersOfLand = isLandComparableType(settings.comparableType);
  const fields = characteristicFieldsOf(settings);
  // The appraiser's added columns follow each comparable by its reference.
  const rowKeys = comparables.map(reference);

  // The offer level of the market research: the options of the books (or the appraiser's), with an X on the one observed.
  const offerMark = offerMarkOf(settings);
  const offer = offerMark !== null
    ? [generatedApartado(`${prefix}-oferta`, page.offerTitle, {
        tables: [offerOptionsTable(`${prefix}-tabla-oferta`, settings.offerIntro?.trim() || page.offerIntro, offerLabelsOf(settings), offerMark)],
      })]
    : [];

  // The appraiser may leave the homologation table out of the dictamen: the offers then carry the statistics and the value.
  const homologationShown = settings.showHomologationTable !== false;
  const data = generatedApartado(`${prefix}-datos`, `DATOS DE COMPARABLES ${page.scope}`, {
    tables: [
      generatedTable(`${prefix}-tabla-caracteristicas`, "Características de los comparables",
        [figureColumn("REF."), textColumn("UBICACIÓN"), textColumn("USO DE SUELO", "center"), textColumn("CARACTERÍSTICAS")],
        comparables.map((comparable) => [
          reference(comparable),
          comparable.location,
          landUseCell(comparable),
          characteristics(comparable, fields),
        ]),
        { notes: [{ position: "top", label: "Obtención del valor unitario.", text: page.intro }], rowKeys }),
      generatedTable(`${prefix}-tabla-ofertas`, "Ofertas de los comparables",
        [
          figureColumn("REF."), textColumn("CONTACTO"), figureColumn("TELÉFONO"),
          offersOfLand ? figureColumn("FECHA") : textColumn("CONSERVACIÓN", "center"),
          figureColumn(page.area), moneyColumn(page.price), moneyColumn(page.unit),
        ],
        comparables.map((comparable) => [
          reference(comparable),
          [comparable.sourceName, comparable.contactName].filter(Boolean).join(" · ") || EMPTY,
          comparable.contactPhone ?? EMPTY,
          offersOfLand ? shortDate(comparable.offerDate) : comparable.conservation ?? EMPTY,
          figure(comparable.area),
          comparable.price ? money(comparable.price) : EMPTY,
          comparable.area && comparable.price ? money(comparable.price / comparable.area) : EMPTY,
        ]),
        homologationShown
          ? { rowKeys }
          : {
              rowKeys,
              summaryBoxes: homologationBoxes(calculation, result).filter((box) => box.position === "bottom"),
              notes: justificationNotes(calculation),
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
        ];
      }),
      {
        rowKeys,
        summaryBoxes: homologationBoxes(calculation, result),
        notes: [
          ...(settings.comparableType === "TERRENO_RENTA" ? [{ position: "top" as const, text: SAME_FACTORS_AS_LAND_SALE }] : []),
          ...(homologationNote ? [{ position: "bottom" as const, text: homologationNote }] : []),
          ...justificationNotes(calculation),
        ],
      })],
  });

  return [
    generatedBlock(prefix, page.title, { apartados: [...offer, data, homologation] }),
  ];
}

/**
 * "Justificación de los factores utilizados", after the tables: the general
 * text, then each comparable's with its number in bold. The appraiser may
 * leave it out of the dictamen.
 */
function justificationNotes({ settings, comparables }: MarketCalculationDto): TableNote[] {
  if (settings.showFactorJustification === false) return [];
  const general = settings.justification?.trim();
  return [
    ...(general ? [{ position: "bottom" as const, label: "Justificación de los factores utilizados:", text: general }] : []),
    ...comparables.flatMap((comparable) => {
      const text = comparable.factorJustification?.trim();
      return text ? [{ position: "bottom" as const, label: `Comparable ${comparable.reference}:`, text }] : [];
    }),
  ];
}

/** Above the homologation, what it is made against; below, the steps from the homologated values to the value. */
function homologationBoxes({ settings }: MarketCalculationDto, result: MarketApproachResult | null): TableSummaryBox[] {
  const subjectArea = settings.subjectArea;
  const page = PAGE[settings.comparableType];
  const againstBase = homologationBasisOf(settings) === "LOTE_TIPO";
  // Frente and fondo of what the homologation is made against: the typical lot of the zone, or the subject; only what was captured.
  const [frontLabel, depthLabel] = againstBase
    ? ["Frente tipo en la zona:", "Fondo tipo en la zona:"]
    : ["Frente del sujeto:", "Fondo del sujeto:"];
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
    // As the format: both options, with an x on the one the homologation is made against.
    ...(subjectArea ? [{
      id: "base",
      position: "top" as const,
      align: "start" as const,
      caption: "Homologación de acuerdo a:",
      rows: [
        { label: `${page.baseArea}:`, value: settings.baseArea ? squareMetres(settings.baseArea) : EMPTY, mark: againstBase },
        { label: `${page.subject}:`, value: squareMetres(subjectArea), mark: !againstBase },
      ],
    }] : []),
    ...(zone.rows.length ? [zone] : []),
  ];
  if (!result || !subjectArea) return boxes;

  const subjectLabel = MARKET_LABELS[settings.comparableType].subjectArea.replace(" (m²)", "");
  // The engine's own subtotal: area × adopted value, as the books, with or without a lote tipo.
  const subtotal = subjectArea * result.adoptedUnitValue;
  const stats = result.homologation.stats;
  boxes.push(
    { id: "sujeto", position: "bottom", align: "start", rows: [{ label: `${subjectLabel} (m²):`, value: squareMetres(subjectArea) }] },
    // Before and after homologating: the lowest and highest unit values and their dispersion (max / min).
    {
      id: "dispersion",
      position: "bottom",
      align: "start",
      rows: [
        { label: `Mínimo de oferta (${page.unit}):`, value: money(stats.offerMin) },
        { label: `Máximo de oferta (${page.unit}):`, value: money(stats.offerMax) },
        { label: "Dispersión inicial:", value: figure(stats.initialDispersion, 2) },
        { label: `Mínimo homologado (${page.unit}):`, value: money(stats.min) },
        { label: `Máximo homologado (${page.unit}):`, value: money(stats.max) },
        { label: "Dispersión final:", value: figure(stats.dispersion, 2) },
      ],
    },
    {
      id: "valores",
      position: "bottom",
      align: "end",
      rows: [
        { label: `${page.mean} (${page.unit}):`, value: money(result.homologation.stats.mean) },
        { label: `${page.adopted} (${page.unit}):`, value: money(result.adoptedUnitValue), emphasis: "strong" },
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

/** Photos of the comparables, for the annex. */
export function marketPhotoBlocks(calculation: MarketCalculationDto): Block[] {
  const images = calculation.comparables.flatMap((comparable) =>
    comparable.photos.map((photo) => ({
      id: `${GENERATED_BLOCK_PREFIX}foto-${photo.id}`,
      title: `Comparable ${comparable.reference}: ${comparable.location}`,
      src: photo.url,
      enabled: true,
    })));
  if (!images.length) return [];
  const prefix = prefixFor(calculation.settings.comparableType);
  return [generatedBlock(`${prefix}-fotos`, `FOTOGRAFÍAS DE COMPARABLES: ${COMPARABLE_TYPE_LABELS[calculation.settings.comparableType].toUpperCase()}`, { images })];
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
  // The columns the appraiser hid, renamed or added stay on the tables the calculation writes again.
  const laidOut = withTableLayouts(blocks, current);
  if (sameContent(current, laidOut) && !section.blocks.some(isPlaceholder)) return section;
  // A block the appraiser hid stays hidden when the calculation writes it again.
  const hidden = new Set(current.filter((item) => item.enabled === false).map((item) => item.id.toLowerCase()));
  const written = hidden.size ? laidOut.map((item) => (hidden.has(item.id.toLowerCase()) ? { ...item, enabled: false } : item)) : laidOut;
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
  options: { placeholderIds?: string[]; position?: "start" | "end"; kind?: "calculo" | "fotos" } = {},
): AppSection {
  const photos = `${prefixFor(type)}-fotos`;
  const owns = options.kind === "fotos"
    ? (item: Block) => item.id.startsWith(photos)
    : (item: Block) => item.id.startsWith(prefixFor(type)) && !item.id.startsWith(photos);
  return replaceGeneratedBlocks(section, owns, blocks, { ...options, placeAmong: placeAmongMarkets(type, options.kind ?? "calculo") });
}

/** Compares what the dictamen shows, ignoring labels the editor renumbers and photo URLs that expire. */
function sameContent(left: Block[], right: Block[]) {
  const content = (item: Pick<Block, "concepts" | "tables" | "images">) => ({
    concepts: item.concepts.map((concept) => [concept.label, concept.value, concept.generatedLabel ?? null]),
    // What prints, and what the calculation wrote under the appraiser's columns (a hidden column may be shown again).
    tables: item.tables.map((table) => [printedTable(table), printedTable(sourceOf(table) as unknown as TableContent), layoutOf(table)]),
    images: item.images.map((image) => [image.id, image.title]),
  });
  const shape = (blocks: Block[]) => JSON.stringify(blocks.map((item) => ({
    id: item.id,
    title: item.title,
    ...content(item),
    apartados: item.apartados.map((apartado) => ({ title: apartado.title, ...content(apartado) })),
  })));
  return shape(left) === shape(right);
}
