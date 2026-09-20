export type ValuationKind = "venta" | "renta" | "ambos";
export type PropertyKind = "casa" | "departamento" | "oficina" | "terreno";

/** Apartado document presentation mode. */
export type ApartadoPresentationMode = "normal" | "technical-list";

export type ValuationMeta = {
  folio: string;
  client: string;
  postalCode: string;
  location: string;
  valuationKind: ValuationKind;
  propertyKind: PropertyKind;
};

export type CaratulaFormData = {
  tituloInmueble: string;
  numeroAvaluo: string;
  folio: string;
  direccionEmpresa: string;
  telefonoEmpresa: string;
  correoEmpresa: string;
  solicitante: string;
  propietario: string;
  objeto: string;
  proposito: string;
  valuador: string;
  registroValuador: string;
  valorTotal: string;
  valorConLetra: string;
  fechaAvaluo: string;
  fechaVigencia: string;
};

export type ConceptType = "text" | "date" | "phone" | "email" | "number" | "currency" | "measurement" | "longText" | "url";
export type ConceptValueFormat =
  | "plain"
  | "mxn"
  | "m"
  | "m2"
  | "m3"
  | "km"
  | "km2"
  | "cm"
  | "mm"
  | "ha"
  | "in"
  | "ft"
  | "percent"
  | "kg"
  | "g"
  | "l"
  | "custom";

export type ConceptDateFormat = "short" | "long" | "normal";

export type Concept = {
  id: string;
  label: string;
  value: string;
  type?: ConceptType;
  labelKey?: string;
  valueKey?: string;
  enabled?: boolean;
  layoutSpan?: "full" | "half";
  rowId?: string;
  spacingBefore?: number;
  spacingAfter?: number;
  valueFormat?: ConceptValueFormat;
  sourceUnit?: ConceptValueFormat;
  customUnit?: string;
  dateFormat?: ConceptDateFormat;
};

export type TableContent = {
  id: string;
  title: string;
  columns: string[];
  columnKeys?: string[];
  rows: string[][];
  boundaryDistanceFormats?: Array<{
    valueFormat?: ConceptValueFormat;
    customUnit?: string;
  }>;
  enabled?: boolean;
  /** When present and === 2, columns/rows are in V2 canonical shape.
   *  Absent or undefined = legacy shape (string[] / string[][]). */
  version?: number;
  /** Optional structural schema — absent = free table */
  schema?: unknown;
};

export type ImageCaptionPosition = "top" | "bottom";
export type ImageCaptionAlign = "left" | "center" | "right";

export type ImageContent = {
  id: string;
  title: string;
  src: string;
  enabled?: boolean;
  layoutWidth?: ImageLayoutWidth;
  layoutWidthPercent?: number;
  terrainSlot?: "macro" | "micro";
  /** Optional visible document caption associated with this image. */
  captionText?: string;
  /** Whether to render the caption. Absent or false = no caption rendered. */
  captionEnabled?: boolean;
  /** Caption position relative to the image. Default when absent: "bottom". */
  captionPosition?: ImageCaptionPosition;
  /** Caption horizontal alignment. Default when absent: "center". */
  captionAlign?: ImageCaptionAlign;
};

export type ImageLayoutWidth = "normal" | "wide" | "full";

export type PrincipalCoverImage = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
  warning?: string;
};

export type ContentLayoutItemType = "concept" | "image" | "table";

export type ContentLayoutItem = {
  type: ContentLayoutItemType;
  id: string;
  span: 4 | 6 | 8 | 12;
  /** When true, this item starts a new visual row. */
  rowBreakBefore?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Content Layout V2 — Row/Column semantic layout                     */
/* ------------------------------------------------------------------ */

/** Lightweight reference to a content item by type and ID. */
export type ContentLayoutItemRef = {
  type: ContentLayoutItemType;
  id: string;
};

/** A column within a row, containing one or more content item refs. */
export type ContentLayoutColumnV2 = {
  id: string;
  items: ContentLayoutItemRef[];
  /** Optional per-cell presentation override for concept alignment. */
  conceptPresentation?: import("./services/concept-presentation").ConceptPresentation;
};

/** A row containing 1–3 columns. */
export type ContentLayoutRowV2 = {
  id: string;
  columns: ContentLayoutColumnV2[];
};

/** Semantic content layout — explicit row/column structure. */
export type ContentLayout = {
  version: 2;
  rows: ContentLayoutRowV2[];
};

/**
 * Transition type: the contentLayout field in Block/SubBlock may hold
 * either V1 (flat array) or V2 (row/column object) during migration.
 *
 *  - V1: `ContentLayoutItem[]` — flat ordered list with span/rowBreakBefore
 *  - V2: `ContentLayoutV2` — explicit row/column semantic structure
 *
 * Hydration detects the shape at parse time. Serialization preserves whichever
 * version exists. No automatic V1→V2 conversion during hydration.
 */
export type ContentLayoutPersisted = ContentLayoutItem[] | ContentLayout;

/* ------------------------------------------------------------------ */
/*  BlockFlow V1 — flat ordered composition layer inside Block          */
/* ------------------------------------------------------------------ */

export type BlockFlowContentRowItem = {
  type: "content-row";
  rowId: string;
};

export type BlockFlowApartadoItem = {
  type: "apartado";
  apartadoId: string;
};

export type BlockFlowItem = BlockFlowContentRowItem | BlockFlowApartadoItem;

export type BlockFlow = {
  version: 1;
  items: BlockFlowItem[];
};

/* ------------------------------------------------------------------ */
/*  BlockFlow V2 — structural-row composition layer inside Block       */
/* ------------------------------------------------------------------ */

/** Reference to a ContentLayoutV2 row within a structural row. */
export type BlockFlowContentRowRef = {
  type: "content-row";
  rowId: string;
};

/** Reference to an Apartado/SubBlock within a structural row. */
export type BlockFlowApartadoRef = {
  type: "apartado";
  apartadoId: string;
};

/** A single cell item inside a V2 structural row. */
export type BlockFlowCellItem = BlockFlowContentRowRef | BlockFlowApartadoRef;

/**
 * A structural row in BlockFlow V2.
 *
 * Valid compositions:
 *  - CONTENT ROW: exactly 1 content-row ref
 *  - APARTADO ROW: 1 or 2 apartado refs
 *
 * Mixed content-row + apartado is NOT valid in this phase.
 */
export type BlockFlowStructuralRow = {
  id: string;
  items: BlockFlowCellItem[];
};

export type BlockFlowV2 = {
  version: 2;
  rows: BlockFlowStructuralRow[];
};

/** Persisted blockFlow — may be V1 (flat) or V2 (structural rows). */
export type BlockFlowPersisted = BlockFlow | BlockFlowV2;

export type Apartado = {
  id: string;
  title: string;
  enabled: boolean;
  startOnNewPage?: boolean;
  concepts: Concept[];
  tables: TableContent[];
  images: ImageContent[];
  contentLayout?: ContentLayoutPersisted;
  conceptPresentation?: import("./services/concept-presentation").ConceptPresentation;
  presentationMode?: ApartadoPresentationMode;
  flowSpacingBeforePx?: number;
};

export type Block = {
  id: string;
  title: string;
  sectionLabel: string;
  enabled: boolean;
  required: boolean;
  startOnNewPage?: boolean;
  concepts: Concept[];
  apartados: Apartado[];
  tables: TableContent[];
  images: ImageContent[];
  contentLayout?: ContentLayoutPersisted;
  blockFlow?: BlockFlowPersisted;
  conceptPresentation?: import("./services/concept-presentation").ConceptPresentation;
  flowSpacingBeforePx?: number;
};

export type AppSection = {
  id: string;
  label: string;
  title: string;
  sourceFile: string;
  enabled: boolean;
  required: boolean;
  startOnNewPage?: boolean;
  flowSpacingBeforePx?: number;
  blocks: Block[];
};

export type Comparable = {
  id: string;
  title: string;
  source: string;
  status: "activo" | "por revisar" | "historial";
  operation: ValuationKind;
  propertyKind: PropertyKind;
  postalCode: string;
  price: string;
  area: string;
  pricePerMeter: string;
  distance: string;
  link: string;
  selected: boolean;
};
