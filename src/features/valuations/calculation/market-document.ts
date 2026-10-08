/**
 * Turns the market calculation into the dictamen: one block per comparable
 * type, laid out as the appraiser's own format (comparables data, homologation
 * with its factors, and the boxes that lead to the value), and the comparables'
 * photos in the annex. Generated blocks carry the GENERATED_BLOCK_PREFIX and
 * are rewritten on every calculation; the appraiser edits the data in the
 * calculation panel.
 */
import type { MarketApproachResult } from "../engine/market";
import type { AppSection, Block } from "../model";
import type { TableSummaryBox } from "../services/table";
import {
  EMPTY,
  figure,
  figureColumn,
  generatedApartado,
  generatedBlock,
  generatedTable,
  money,
  moneyColumn,
  offerLevelTable,
  printedTable,
  squareMetres,
  textColumn,
} from "./generated-content";
import {
  COMPARABLE_TYPE_LABELS,
  FACTOR_TYPE_LABELS,
  MARKET_LABELS,
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
  areaTag: string;
  price: string;
  priceTag: string;
  unit: string;
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
    area: "SUPERFICIE DE TERRENO (m²)", shortArea: "SUP. TERRENO (m²)", areaTag: "SUPERFICIE",
    price: "OFERTA $ (TERRENO)", priceTag: "OFERTA", unit: "$/m²",
    homologated: "Valor Unitario Homologado", mean: "Valor Prom. Homologado", adopted: "Valor homologado a utilizar",
    baseArea: "Lote Tipo", subject: "Lote Sujeto", value: "VALOR COMPARATIVO DE MERCADO (TERRENOS)",
  },
  INMUEBLE_VENTA: {
    title: "ENFOQUE COMPARATIVO DE MERCADO (INMUEBLES)", scope: "(INMUEBLES)",
    offerTitle: "INMUEBLES SIMILARES EN VENTA",
    offerIntro: "Nivel de oferta observada durante la investigación de mercado de inmuebles.",
    intro: "Comparables de inmuebles en venta semejantes en uso al sujeto que se valúa.",
    area: "SUP. CONSTRUIDA (m²)", shortArea: "SUP. CONSTR. (m²)", areaTag: "SUP. CONST.",
    price: "OFERTA $ (INMUEBLE)", priceTag: "OFERTA", unit: "$/m²",
    homologated: "Valor Unitario Homologado", mean: "Valor Prom. Homologado", adopted: "Valor homologado a utilizar",
    baseArea: "Superficie Tipo", subject: "Superficie del Sujeto", value: "VALOR COMPARATIVO DE MERCADO (INMUEBLES)",
  },
  INMUEBLE_RENTA: {
    title: "MERCADO DE RENTAS", scope: "(INMUEBLES EN RENTA)",
    offerTitle: "INMUEBLES SIMILARES EN RENTA",
    offerIntro: "Nivel de oferta observada durante la investigación de mercado de rentas de inmuebles.",
    intro: "Comparables de inmuebles en renta semejantes en uso al sujeto que se valúa.",
    area: "SUP. RENTABLE (m²)", shortArea: "SUP. RENTABLE (m²)", areaTag: "SUP. RENTABLE",
    price: "RENTA MENSUAL $", priceTag: "RENTA MENSUAL", unit: "$/m²/mes",
    homologated: "Renta Unitaria Homologada", mean: "Renta Prom. Homologada", adopted: "Renta homologada a utilizar",
    baseArea: "Superficie Tipo", subject: "Superficie del Sujeto", value: "RENTA MENSUAL ESTIMADA DEL SUJETO",
  },
};

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

/** One line with what was captured of the comparable, in the order of the books. */
function characteristics(comparable: ComparableDto, page: (typeof PAGE)[ComparableType]) {
  const parts: [string, string | null | undefined][] = [
    ["N. FRENTES", comparable.frontCount ? String(comparable.frontCount) : null],
    // The zoning key, without the description the land use column already gives.
    ["USO DE SUELO", comparable.landUseKey || comparable.landUse?.split(" (")[0]],
    ["FORMA", comparable.shape],
    ["ZONA", comparable.zone],
    ["FRENTE", metres(comparable.frontage)],
    ["FONDO", metres(comparable.depth)],
    [page.areaTag, comparable.area ? squareMetres(comparable.area) : null],
    ["CONSERVACIÓN", comparable.conservation],
    ["CALIDAD", comparable.quality],
    ["TOPOGRAFÍA", comparable.topography],
    ["SERVICIOS", comparable.services],
    // Without the space after the sign, so the amount is not cut at the end of a line.
    [page.priceTag, comparable.price ? money(comparable.price).replace("$ ", "$") : null],
    ["OBSERVACIONES", comparable.notes],
  ];
  return parts.filter(([, value]) => value).map(([tag, value]) => `${tag}: ${value}`).join(" ; ") || EMPTY;
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

  // The offer level of the market research: the six options of the books, with an X on the one observed.
  const offer = settings.offerLevel
    ? [generatedApartado(`${prefix}-oferta`, page.offerTitle, {
        tables: [offerLevelTable(`${prefix}-tabla-oferta`, page.offerIntro, settings.offerLevel)],
      })]
    : [];

  const data = generatedApartado(`${prefix}-datos`, `DATOS DE COMPARABLES ${page.scope}`, {
    tables: [
      generatedTable(`${prefix}-tabla-caracteristicas`, "Características de los comparables",
        [figureColumn("REF."), textColumn("UBICACIÓN"), textColumn("USO DE SUELO", "center"), textColumn("CARACTERÍSTICAS")],
        comparables.map((comparable) => [
          reference(comparable),
          comparable.location,
          landUseCell(comparable),
          characteristics(comparable, page),
        ]),
        { compact: true, notes: [{ position: "top", label: "Obtención del valor unitario.", text: page.intro }] }),
      generatedTable(`${prefix}-tabla-ofertas`, "Ofertas de los comparables",
        [
          figureColumn("REF."), textColumn("CONTACTO"), figureColumn("TELÉFONO"), figureColumn("FECHA"),
          figureColumn(page.area), moneyColumn(page.price), moneyColumn(page.unit),
        ],
        comparables.map((comparable) => [
          reference(comparable),
          [comparable.sourceName, comparable.contactName].filter(Boolean).join(" · ") || EMPTY,
          comparable.contactPhone ?? EMPTY,
          shortDate(comparable.offerDate),
          figure(comparable.area),
          comparable.price ? money(comparable.price) : EMPTY,
          comparable.area && comparable.price ? money(comparable.price / comparable.area) : EMPTY,
        ])),
    ],
  });

  const slots = settings.factorSlots;
  const factors = "FACTORES DE HOMOLOGACIÓN";
  const homologation = generatedApartado(`${prefix}-homologacion`, `HOMOLOGACIÓN ${settings.comparableType === "INMUEBLE_RENTA" ? "(RENTAS)" : page.scope}`, {
    tables: [generatedTable(`${prefix}-tabla-homologacion`, "Homologación",
      [
        figureColumn("REF"), moneyColumn(page.price), figureColumn(page.shortArea), moneyColumn(`${words.unitValue} ${page.unit}`),
        ...slots.map((slot) => figureColumn(factorTitle(slot), { group: factors })),
        figureColumn("FRe", { group: factors }),
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
            if (slot.type === "SUPERFICIE") return figure(row.surfaceFactor);
            const captured = comparable.factors.find((item) => item.type === slot.type);
            return figure(captured?.subjectRating && captured.comparableRating
              ? captured.subjectRating / captured.comparableRating
              : captured?.value ?? 1);
          }),
          row ? figure(row.resultantFactor) : EMPTY,
          row ? money(row.homologatedUnitValue) : EMPTY,
        ];
      }),
      {
        summaryBoxes: homologationBoxes(calculation, result),
        ...(result && settings.justification
          ? { notes: [{ position: "bottom" as const, label: "Justificación del valor adoptado:", text: settings.justification }] }
          : {}),
      })],
  });

  return [generatedBlock(prefix, page.title, { apartados: [...offer, data, homologation] })];
}

/** Above the homologation, what it is made against; below, the steps from the homologated values to the value. */
function homologationBoxes({ settings }: MarketCalculationDto, result: MarketApproachResult | null): TableSummaryBox[] {
  const subjectArea = settings.subjectArea;
  const page = PAGE[settings.comparableType];
  const againstBase = Boolean(settings.baseArea);
  // The typical lot of the zone, beside what the homologation is made against; only what was captured.
  const zone: TableSummaryBox = {
    id: "zona",
    position: "top",
    align: "end",
    rows: [
      ...(settings.typicalFrontage ? [{ label: "Frente tipo en la zona:", value: metres(settings.typicalFrontage) as string }] : []),
      ...(settings.typicalDepth ? [{ label: "Fondo tipo en la zona:", value: metres(settings.typicalDepth) as string }] : []),
    ],
  };
  const boxes: TableSummaryBox[] = [
    ...(subjectArea ? [{
      id: "base",
      position: "top" as const,
      align: "start" as const,
      caption: "Homologación de acuerdo a:",
      rows: [
        ...(settings.baseArea ? [{ label: `${page.baseArea}:`, value: squareMetres(settings.baseArea), mark: true }] : []),
        { label: `${page.subject}:`, value: squareMetres(subjectArea), mark: !againstBase },
      ],
    }] : []),
    ...(zone.rows.length ? [zone] : []),
  ];
  if (!result || !subjectArea) return boxes;

  const subjectLabel = MARKET_LABELS[settings.comparableType].subjectArea.replace(" (m²)", "");
  // The engine's own subtotal: area × adopted value, times the subject's factor when homologating against the lote tipo.
  const subtotal = subjectArea * result.adoptedUnitValue * result.subjectSurfaceFactor;
  boxes.push(
    { id: "sujeto", position: "bottom", align: "start", rows: [{ label: `${subjectLabel} (m²):`, value: squareMetres(subjectArea) }] },
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
        { label: `${subjectLabel}:`, value: squareMetres(subjectArea) },
        ...(result.subjectSurfaceFactor !== 1
          // Four decimals: the subtotal is the product of the figures of this box.
          ? [{ label: "Factor de superficie del sujeto contra el lote tipo:", value: figure(result.subjectSurfaceFactor, 4) }]
          : []),
        { label: "Subtotal:", value: money(subtotal) },
        { label: "Monto adicional a considerar:", value: settings.additionalAmount ? money(settings.additionalAmount) : "$ -" },
        { label: `${page.value}:`, value: money(result.value), emphasis: "total" },
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
  options: { placeholderIds?: string[]; position?: "start" | "end" } = {},
): AppSection {
  // Saved block ids come back in lower case.
  const placeholders = new Set((blocks.length ? options.placeholderIds ?? [] : []).map((id) => id.toLowerCase()));
  const isPlaceholder = (item: Block) => placeholders.has(item.id.toLowerCase());
  const current = section.blocks.filter(owns);
  if (sameContent(current, blocks) && !section.blocks.some(isPlaceholder)) return section;
  const firstIndex = section.blocks.findIndex((item) => owns(item) || isPlaceholder(item));
  const kept = section.blocks.filter((item) => !owns(item) && !isPlaceholder(item));
  const insertAt = firstIndex !== -1
    ? section.blocks.slice(0, firstIndex).filter((item) => kept.includes(item)).length
    : options.position === "end" ? kept.length : 0;
  return { ...section, blocks: [...kept.slice(0, insertAt), ...blocks, ...kept.slice(insertAt)] };
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
  return replaceGeneratedBlocks(section, owns, blocks, options);
}

/** Compares what the dictamen shows, ignoring labels the editor renumbers and photo URLs that expire. */
function sameContent(left: Block[], right: Block[]) {
  const content = (item: Pick<Block, "concepts" | "tables" | "images">) => ({
    concepts: item.concepts.map((concept) => [concept.label, concept.value]),
    tables: item.tables.map(printedTable),
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
