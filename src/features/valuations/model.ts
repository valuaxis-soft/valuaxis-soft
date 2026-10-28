import type { CoverImageFocus, CoverImageSize } from "./services/cover-image-focus";
import type { ValuationSignature } from "./services/valuation-signatures";
import type { PageBreakMode, SectionDocumentRole, SectionPageBreak } from "./services/document-structure";
import type { ReportApproach } from "./services/report-approaches";

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
  /** Everyone who signs the dictamen, in printing order. */
  firmas: ValuationSignature[];
  valorTotal: string;
  valorConLetra: string;
  fechaAvaluo: string;
  /** Whole months the valuation is valid for, 1 to 12; null until the appraiser chooses. */
  mesesVigencia: number | null;
  /** Validity date of a valuation saved before the validity was captured in months. */
  fechaVigencia: string;
  /** The part of the principal cover image kept in view inside the cover box; centered when absent. */
  enfoqueImagenPrincipal?: CoverImageFocus;
  /** How big the principal image shows in the cover box; absent, it fills the box (kept with the company header block). */
  tamanoImagenPrincipal?: CoverImageSize;
  /** Up to three short label/value pairs of the appraiser's choice (RFC, cédula, sitio web…) printed in the page header. */
  camposEncabezado?: HeaderExtraField[];
};

/** A short datum the appraiser adds to the document header. */
export type HeaderExtraField = { label: string; value: string };

/**
 * The firm's letterhead (Datos del despacho). The document header shows it
 * wherever the valuation's own carátula leaves a field empty.
 */
export type Letterhead = {
  name: string;
  legalName: string | null;
  rfc: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
};

/** "paragraph": a free text with no label, printed edge to edge. */
export type ConceptType = "text" | "date" | "phone" | "email" | "number" | "currency" | "measurement" | "longText" | "url" | "paragraph";
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
  /**
   * The value is computed from other concepts and table cells; `value` holds
   * the last result, written as the concept's format reads it.
   */
  formula?: import("./services/table").TableFormula;
  /**
   * Only in a block the calculation writes: the label the calculation gave
   * the concept, when the appraiser printed it under a name of their own
   * (`label`). The calculation writing the block again keeps their name.
   */
  generatedLabel?: string;
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

/** One caption line of an image, printed above or below it. */
export type ImageCaption = {
  id: string;
  text: string;
  position: ImageCaptionPosition;
  align: ImageCaptionAlign;
};

/** Clockwise quarter turns the appraiser gave the image ("Girar"). */
export type ImageRotation = 0 | 90 | 180 | 270;

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
  /**
   * The caption lines, in order. When present they replace the single caption
   * above, whose fields keep a copy of the first line.
   */
  captions?: ImageCaption[];
  /** Turned clockwise in the document. Absent: as the file shows it. */
  rotation?: ImageRotation;
  /** Its place and zoom inside its frame, as the cover image's. Absent: whole and centered. */
  framing?: import("./services/image-framing").ImageFraming;
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

/* ------------------------------------------------------------------ */
/*  Content Layout (version 2) — Row/Column semantic layout            */
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

/**
 * Concepts side by side printed as data labels: each box as wide as its
 * content, with room between them, on a white or a shaded background.
 */
export type ContentRowTagStyle = "white" | "shaded";

/** A row containing 1–3 columns. */
export type ContentLayoutRowV2 = {
  id: string;
  columns: ContentLayoutColumnV2[];
  /** Concepts of the row printed as data labels; absent, as columns of equal width. */
  tagStyle?: ContentRowTagStyle;
};

/** Semantic content layout — explicit row/column structure. */
export type ContentLayout = {
  version: 2;
  rows: ContentLayoutRowV2[];
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

export type Apartado = {
  id: string;
  title: string;
  enabled: boolean;
  startOnNewPage?: boolean;
  /** Where it starts on the printed pages; absent, as `startOnNewPage` says. */
  pageBreak?: PageBreakMode;
  concepts: Concept[];
  tables: TableContent[];
  images: ImageContent[];
  contentLayout?: ContentLayout;
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
  /** Where it starts on the printed pages; absent, as `startOnNewPage` says. */
  pageBreak?: PageBreakMode;
  /**
   * The block belongs to an annex: its apartados carry no number. Set by the
   * numbering of the sections on every change, never saved.
   */
  annex?: boolean;
  concepts: Concept[];
  apartados: Apartado[];
  tables: TableContent[];
  images: ImageContent[];
  contentLayout?: ContentLayout;
  blockFlow?: BlockFlowV2;
  conceptPresentation?: import("./services/concept-presentation").ConceptPresentation;
  flowSpacingBeforePx?: number;
  /** Only the carátula's company header block: the extra header data, kept in its configuration. */
  headerFields?: HeaderExtraField[];
  /** Only the carátula's company header block: the size of the principal cover image. */
  coverImageSize?: CoverImageSize;
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
  /**
   * Whether the numbers of the whole document are written with the thousands
   * separator ("40,000" or "40000"). Kept on the carátula section only; absent
   * means with it, as documents saved before the choice existed print.
   */
  thousandsSeparator?: boolean;
  /** The left margin of every page, for binding. Carátula section only; absent means "normal". */
  bindingMargin?: "normal" | "wide";
  /** The title bars of the blocks, blue or outlined. Carátula section only; absent means "filled". */
  titleBars?: "filled" | "outline";
  /** The document's title band under the page header, blue or white with a line. Carátula section only; absent means "filled". */
  titleBand?: "filled" | "outline";
  /** Chapter or annex, as the appraiser chose; absent, an annex when it comes after the conclusion. */
  documentRole?: SectionDocumentRole;
  /** The label an annex prints instead of "ANEXO n", when the appraiser wrote one. */
  annexTitle?: string;
  /** Where the section starts on the printed pages; absent, on a new page. */
  pageBreak?: SectionPageBreak;
  /** The approaches of this section left out of the dictamen ("Agregar al informe valuatorio" off). */
  excludedFromReport?: ReportApproach[];
  /** Added by the appraiser; not in the section registry. */
  custom?: boolean;
  /** The appraiser renamed the tab: the stored title wins over the registry label. */
  titleEdited?: boolean;
  /**
   * A registry section the appraiser deleted. It stays in the document, hidden
   * (`enabled: false`) and out of the tab strip, so its calculations keep a
   * place to write to and it can be restored. A section he added is removed
   * from the array instead.
   */
  removed?: boolean;
  blocks: Block[];
};
