import type { BlockFlowPersisted, ConceptDateFormat, ConceptType, ConceptValueFormat, ContentLayoutItem, ContentLayoutPersisted, ImageLayoutWidth, ApartadoPresentationMode } from "@/features/valuations/model";
import type { ConceptPresentation } from "@/features/valuations/services/concept-presentation";
import { isBlockFlowV1, isBlockFlowV2 } from "@/features/valuations/services/block-flow";
import { isValidContentLayoutSpan } from "@/features/valuations/services/content-layout-policy";
import { isContentLayout, normalizeContentLayout } from "@/features/valuations/services/content-layout";

export type ConceptMetadata = {
  enabled: boolean;
  type?: ConceptType;
  labelKey?: string;
  valueKey?: string;
  layoutSpan?: "full" | "half";
  rowId?: string;
  spacingBefore?: number;
  spacingAfter?: number;
  valueFormat?: ConceptValueFormat;
  sourceUnit?: ConceptValueFormat;
  customUnit?: string;
  dateFormat?: ConceptDateFormat;
};

export type ImageMetadata = {
  enabled: boolean;
  layoutWidth?: ImageLayoutWidth;
  layoutWidthPercent?: number;
  terrainSlot?: "macro" | "micro";
  captionText?: string;
  captionEnabled?: boolean;
  captionPosition?: "top" | "bottom";
  captionAlign?: "left" | "center" | "right";
};

export type SectionMetadata = {
  enabled: boolean;
  startOnNewPage?: boolean;
  flowSpacingBeforePx?: number;
};

export type BlockMetadata = {
  enabled: boolean;
  startOnNewPage?: boolean;
  contentLayout?: ContentLayoutPersisted;
  blockFlow?: BlockFlowPersisted;
  conceptPresentation?: ConceptPresentation;
  flowSpacingBeforePx?: number;
};

export type ApartadoMetadata = {
  enabled: boolean;
  startOnNewPage?: boolean;
  contentLayout?: ContentLayoutPersisted;
  conceptPresentation?: ConceptPresentation;
  presentationMode?: ApartadoPresentationMode;
  flowSpacingBeforePx?: number;
};

/* ------------------------------------------------------------------ */
/*  Flow spacing canonical capability                                  */
/* ------------------------------------------------------------------ */

/**
 * Canonical capability contract for structural flow spacing.
 *
 * Shared by AppSection, Block, SubBlock, and future fixed-region targets.
 * The field is optional — absent means no override (legacy-safe).
 * The resolver enforces: finite number >= 0.
 */
export type FlowSpacingPresentation = {
  flowSpacingBeforePx?: number;
};

/**
 * Resolve flow spacing before a structural element.
 *
 * - undefined → defaultValue (caller supplies the current structural default)
 * - 0 → 0 (explicit zero is valid)
 * - positive finite → same value
 * - negative / NaN / Infinity → defaultValue
 *
 * IMPORTANT: never use `value || defaultValue` because 0 is valid.
 */
export function resolveFlowSpacingBeforePx(
  explicitValue: number | undefined,
  defaultValue: number,
): number {
  if (typeof explicitValue === "number" && Number.isFinite(explicitValue) && explicitValue >= 0) {
    return explicitValue;
  }
  return defaultValue;
}

type ConceptMetadataContent = Partial<Omit<ConceptMetadata, "enabled">> & { enabled?: boolean };
type ImageMetadataContent = Partial<Omit<ImageMetadata, "enabled">> & { enabled?: boolean };
type SectionMetadataContent = Partial<Omit<SectionMetadata, "enabled">> & { enabled?: boolean };
type BlockMetadataContent = Partial<Omit<BlockMetadata, "enabled">> & { enabled?: boolean };
type ApartadoMetadataContent = Partial<Omit<ApartadoMetadata, "enabled">> & { enabled?: boolean };

export function conceptMetadataFromContent(content: ConceptMetadataContent): ConceptMetadata {
  return {
    enabled: content.enabled !== false,
    layoutSpan: content.layoutSpan,
    rowId: content.rowId,
    spacingBefore: content.spacingBefore,
    spacingAfter: content.spacingAfter,
    valueFormat: content.valueFormat,
    sourceUnit: content.sourceUnit,
    customUnit: content.customUnit,
    dateFormat: content.dateFormat,
    type: content.type,
    labelKey: content.labelKey,
    valueKey: content.valueKey,
  };
}

export function hydrateConceptMetadata(config: unknown): ConceptMetadata {
  return {
    enabled: true,
    type: conceptTypeMetadata(config),
    labelKey: conceptStringMetadata(config, "labelKey"),
    valueKey: conceptStringMetadata(config, "valueKey"),
    layoutSpan: conceptLayoutSpan(config),
    rowId: conceptStringMetadata(config, "rowId"),
    spacingBefore: conceptNumberMetadata(config, "spacingBefore"),
    spacingAfter: conceptNumberMetadata(config, "spacingAfter"),
    valueFormat: conceptValueFormat(config),
    sourceUnit: conceptSourceUnit(config),
    customUnit: conceptStringMetadata(config, "customUnit"),
    dateFormat: conceptDateFormat(config),
  };
}

export function imageMetadataFromContent(content: ImageMetadataContent): ImageMetadata {
  return {
    enabled: content.enabled !== false,
    layoutWidth: content.layoutWidth,
    layoutWidthPercent: content.layoutWidthPercent,
    terrainSlot: content.terrainSlot,
    captionText: content.captionText,
    captionEnabled: content.captionEnabled,
    captionPosition: content.captionPosition,
    captionAlign: content.captionAlign,
  };
}

export function hydrateImageMetadata(config: unknown): ImageMetadata {
  return {
    enabled: true,
    layoutWidth: imageLayoutWidth(config),
    layoutWidthPercent: imageNumberMetadata(config, "layoutWidthPercent"),
    terrainSlot: imageTerrainSlot(config),
    captionText: imageCaptionText(config),
    captionEnabled: imageCaptionEnabled(config),
    captionPosition: imageCaptionPosition(config),
    captionAlign: imageCaptionAlign(config),
  };
}

export function sectionMetadataFromContent(content: SectionMetadataContent): SectionMetadata {
  return {
    enabled: content.enabled !== false,
    startOnNewPage: content.startOnNewPage,
    flowSpacingBeforePx: content.flowSpacingBeforePx,
  };
}

export function hydrateSectionMetadata(config: unknown): SectionMetadata {
  return {
    enabled: true,
    startOnNewPage: sectionBooleanMetadata(config, "startOnNewPage"),
    flowSpacingBeforePx: readFlowSpacingBeforePx(config),
  };
}

export function blockMetadataFromContent(content: BlockMetadataContent): BlockMetadata {
  return {
    enabled: content.enabled !== false,
    startOnNewPage: content.startOnNewPage,
    contentLayout: content.contentLayout,
    blockFlow: content.blockFlow,
    conceptPresentation: content.conceptPresentation,
    flowSpacingBeforePx: content.flowSpacingBeforePx,
  };
}

export function hydrateBlockMetadata(config: unknown): BlockMetadata {
  return {
    enabled: true,
    startOnNewPage: sectionBooleanMetadata(config, "startOnNewPage"),
    contentLayout: parseContentLayout(config),
    blockFlow: parseBlockFlow(config),
    conceptPresentation: parseConceptPresentation(config),
    flowSpacingBeforePx: readFlowSpacingBeforePx(config),
  };
}

export function apartadoMetadataFromContent(content: ApartadoMetadataContent): ApartadoMetadata {
  return {
    enabled: content.enabled !== false,
    startOnNewPage: content.startOnNewPage,
    contentLayout: content.contentLayout,
    conceptPresentation: content.conceptPresentation,
    presentationMode: content.presentationMode,
    flowSpacingBeforePx: content.flowSpacingBeforePx,
  };
}

export function hydrateApartadoMetadata(config: unknown): ApartadoMetadata {
  return {
    enabled: true,
    startOnNewPage: sectionBooleanMetadata(config, "startOnNewPage"),
    contentLayout: parseContentLayout(config),
    conceptPresentation: parseConceptPresentation(config),
    presentationMode: parsePresentationMode(config),
    flowSpacingBeforePx: readFlowSpacingBeforePx(config),
  };
}

function conceptTypeMetadata(config: unknown): ConceptType | undefined {
  return readConfigMetadata(config, readConceptType);
}

function conceptValueFormat(config: unknown): ConceptValueFormat | undefined {
  return readConfigMetadata(config, readConceptValueFormat);
}

function conceptSourceUnit(config: unknown): ConceptValueFormat | undefined {
  return readConfigMetadata(config, readConceptSourceUnit);
}

function conceptLayoutSpan(config: unknown): "full" | "half" | undefined {
  return readConfigMetadata(config, readLayoutSpan);
}

function conceptDateFormat(config: unknown): ConceptDateFormat | undefined {
  return readConfigMetadata(config, readConceptDateFormat);
}

function conceptNumberMetadata(config: unknown, key: "spacingBefore" | "spacingAfter") {
  return readConfigMetadata(config, (value) => readNumberMetadata(value, key));
}

function conceptStringMetadata(config: unknown, key: "labelKey" | "valueKey" | "customUnit" | "rowId") {
  const value = readConfigMetadata(config, (candidate) => readStringMetadata(candidate, key));
  return value || undefined;
}

function imageLayoutWidth(config: unknown): ImageLayoutWidth | undefined {
  return readConfigMetadata(config, readImageLayoutWidth);
}

function imageTerrainSlot(config: unknown): "macro" | "micro" | undefined {
  return readConfigMetadata(config, readImageTerrainSlot);
}

function imageNumberMetadata(config: unknown, key: "layoutWidthPercent") {
  return readConfigMetadata(config, (value) => readNumberMetadata(value, key));
}

function imageCaptionText(config: unknown): string | undefined {
  return readConfigMetadata(config, (value) => {
    if (!isRecord(value)) return undefined;
    const text = value.captionText;
    return typeof text === "string" ? text : undefined;
  });
}

function imageCaptionEnabled(config: unknown): boolean | undefined {
  return readConfigMetadata(config, (value) => {
    if (!isRecord(value)) return undefined;
    const enabled = value.captionEnabled;
    return typeof enabled === "boolean" ? enabled : undefined;
  });
}

function imageCaptionPosition(config: unknown): "top" | "bottom" | undefined {
  return readConfigMetadata(config, (value) => {
    if (!isRecord(value)) return undefined;
    const pos = value.captionPosition;
    return pos === "top" || pos === "bottom" ? pos : undefined;
  });
}

function imageCaptionAlign(config: unknown): "left" | "center" | "right" | undefined {
  return readConfigMetadata(config, (value) => {
    if (!isRecord(value)) return undefined;
    const align = value.captionAlign;
    return align === "left" || align === "center" || align === "right" ? align : undefined;
  });
}

function sectionBooleanMetadata(config: unknown, key: "startOnNewPage") {
  return readConfigMetadata(config, (value) => readBooleanMetadata(value, key));
}

function readConfigMetadata<T>(config: unknown, reader: (value: unknown) => T | undefined): T | undefined {
  if (!isRecord(config)) return undefined;
  return reader(config.payload) ?? reader(config);
}

function readConceptType(value: unknown): ConceptType | undefined {
  if (!isRecord(value)) return undefined;
  const type = value.type;
  return type === "text" ||
    type === "date" ||
    type === "phone" ||
    type === "email" ||
    type === "number" ||
    type === "currency" ||
    type === "measurement" ||
    type === "longText" ||
    type === "url"
    ? type
    : undefined;
}

function readConceptValueFormat(value: unknown): ConceptValueFormat | undefined {
  if (!isRecord(value)) return undefined;
  const valueFormat = value.valueFormat;
  return valueFormat === "plain" ||
    valueFormat === "mxn" ||
    valueFormat === "m" ||
    valueFormat === "m2" ||
    valueFormat === "m3" ||
    valueFormat === "km" ||
    valueFormat === "km2" ||
    valueFormat === "cm" ||
    valueFormat === "mm" ||
    valueFormat === "ha" ||
    valueFormat === "in" ||
    valueFormat === "ft" ||
    valueFormat === "percent" ||
    valueFormat === "kg" ||
    valueFormat === "g" ||
    valueFormat === "l" ||
    valueFormat === "custom"
    ? valueFormat
    : undefined;
}

function readConceptSourceUnit(value: unknown): ConceptValueFormat | undefined {
  if (!isRecord(value)) return undefined;
  const sourceUnit = value.sourceUnit;
  return sourceUnit === "plain" ||
    sourceUnit === "mxn" ||
    sourceUnit === "m" ||
    sourceUnit === "m2" ||
    sourceUnit === "m3" ||
    sourceUnit === "km" ||
    sourceUnit === "km2" ||
    sourceUnit === "cm" ||
    sourceUnit === "mm" ||
    sourceUnit === "ha" ||
    sourceUnit === "in" ||
    sourceUnit === "ft" ||
    sourceUnit === "percent" ||
    sourceUnit === "kg" ||
    sourceUnit === "g" ||
    sourceUnit === "l" ||
    sourceUnit === "custom"
    ? sourceUnit
    : undefined;
}

function readLayoutSpan(value: unknown) {
  if (!isRecord(value)) return undefined;
  const layoutSpan = value.layoutSpan;
  return layoutSpan === "full" || layoutSpan === "half" ? layoutSpan : undefined;
}

function readConceptDateFormat(value: unknown): ConceptDateFormat | undefined {
  if (!isRecord(value)) return undefined;
  const dateFormat = value.dateFormat;
  return dateFormat === "short" || dateFormat === "long" || dateFormat === "normal"
    ? dateFormat
    : undefined;
}

function readImageLayoutWidth(value: unknown): ImageLayoutWidth | undefined {
  if (!isRecord(value)) return undefined;
  const layoutWidth = value.layoutWidth;
  return layoutWidth === "normal" || layoutWidth === "wide" || layoutWidth === "full"
    ? layoutWidth
    : undefined;
}

function readImageTerrainSlot(value: unknown): "macro" | "micro" | undefined {
  if (!isRecord(value)) return undefined;
  const terrainSlot = value.terrainSlot;
  return terrainSlot === "macro" || terrainSlot === "micro" ? terrainSlot : undefined;
}

function readNumberMetadata(value: unknown, key: "spacingBefore" | "spacingAfter" | "layoutWidthPercent") {
  if (!isRecord(value)) return undefined;
  const metadata = value[key];
  return typeof metadata === "number" && Number.isFinite(metadata) && metadata >= 0 ? metadata : undefined;
}

function readFlowSpacingBeforePx(config: unknown): number | undefined {
  return readConfigMetadata(config, (value) => {
    if (!isRecord(value)) return undefined;
    const v = value.flowSpacingBeforePx;
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
    return undefined;
  });
}

function readStringMetadata(value: unknown, key: "labelKey" | "valueKey" | "customUnit" | "rowId") {
  if (!isRecord(value)) return undefined;
  const metadata = value[key];
  return typeof metadata === "string" ? metadata : undefined;
}

function readBooleanMetadata(value: unknown, key: "startOnNewPage") {
  if (!isRecord(value)) return undefined;
  const metadata = value[key];
  return typeof metadata === "boolean" ? metadata : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const CONTENT_LAYOUT_VALID_TYPES = new Set(["concept", "image", "table"]);

/**
 * Safely parse a stored contentLayout from JConfiguracion JSONB.
 *
 * Shape detection:
 *  - If the stored value is an object with `version === 2` and a `rows` array,
 *    parse it as ContentLayoutV2 using the V2 type guard and normalize it.
 *  - If the stored value is an array, parse it as V1 ContentLayoutItem[]
 *    using the existing V1 logic.
 *  - If malformed or absent, return undefined.
 *
 * Hydration preserves the persisted version — no automatic V1→V2 conversion.
 * Never mutates the input.
 */
function parseContentLayout(config: unknown): ContentLayoutPersisted | undefined {
  if (!isRecord(config)) return undefined;

  const raw = config.contentLayout ?? (isRecord(config.payload) ? config.payload.contentLayout : undefined);
  if (raw === undefined || raw === null) return undefined;

  // --- V2 detection: object with version === 2 and rows array ---
  if (isContentLayout(raw)) {
    return normalizeContentLayout(raw);
  }

  // --- V1 detection: array ---
  if (Array.isArray(raw)) {
    return parseContentLayoutV1Items(raw);
  }

  // --- Malformed: neither V1 array nor V2 object ---
  return undefined;
}

/**
 * Parse a V1 contentLayout array from raw stored data.
 *
 *  - Returns undefined when not an array or empty.
 *  - Filters out structurally invalid items (bad type, missing id, invalid span).
 *  - Preserves the stored order of valid items.
 *  - Never mutates the input.
 */
function parseContentLayoutV1Items(raw: unknown[]): ContentLayoutItem[] | undefined {
  if (raw.length === 0) return undefined;

  const valid: ContentLayoutItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.id !== "string" || !obj.id) continue;
    if (!CONTENT_LAYOUT_VALID_TYPES.has(obj.type as string)) continue;
    if (!isValidContentLayoutSpan(obj.span)) continue;
    const parsed: ContentLayoutItem = {
      type: obj.type as ContentLayoutItem["type"],
      id: obj.id,
      span: obj.span as ContentLayoutItem["span"],
    };
    if (obj.rowBreakBefore === true) {
      parsed.rowBreakBefore = true;
    }
    valid.push(parsed);
  }

  return valid.length > 0 ? valid : undefined;
}

/**
 * Safely parse a stored blockFlow from JConfiguracion JSONB.
 *
 * Detects a valid version-1 or version-2 BlockFlow object.
 * Returns undefined when absent or malformed. Never mutates the input.
 */
function parseBlockFlow(config: unknown): BlockFlowPersisted | undefined {
  if (!isRecord(config)) return undefined;
  const raw = config.blockFlow ?? (isRecord(config.payload) ? config.payload.blockFlow : undefined);
  if (raw === undefined || raw === null) return undefined;
  if (isBlockFlowV2(raw)) return raw;
  if (isBlockFlowV1(raw)) return raw;
  return undefined;
}

/**
 * Safely parse a stored presentationMode from JConfiguracion JSONB.
 *
 * Returns undefined when absent or malformed. Never mutates the input.
 */
function parsePresentationMode(config: unknown): ApartadoPresentationMode | undefined {
  if (!isRecord(config)) return undefined;
  const raw = config.presentationMode ?? (isRecord(config.payload) ? config.payload.presentationMode : undefined);
  if (typeof raw === "string" && (raw === "normal" || raw === "technical-list")) {
    return raw;
  }
  return undefined;
}

/**
 * Safely parse a stored conceptPresentation from JConfiguracion JSONB.
 *
 * Supports both new format (mode/labelGuidePx) and legacy format
 * (labelGuidePreset/labelGuidePercent) for backward compatibility.
 *
 * Returns undefined when absent or malformed. Never mutates the input.
 */
function parseConceptPresentation(config: unknown): ConceptPresentation | undefined {
  if (!isRecord(config)) return undefined;
  const raw = config.conceptPresentation ?? (isRecord(config.payload) ? config.payload.conceptPresentation : undefined);
  if (!raw || !isRecord(raw)) return undefined;

  const DEFAULT_PX = 120; // match concept-presentation.ts

  // New format: mode + labelGuideOffsetPx
  const mode = raw.mode;
  if (mode === "custom") {
    const offset = raw.labelGuideOffsetPx;
    if (typeof offset === "number" && Number.isFinite(offset)) {
      return { mode: "custom", labelGuideOffsetPx: offset };
    }
    // Legacy V3: mode=custom with absolute labelGuidePx → convert to offset
    const absolutePx = raw.labelGuidePx;
    if (typeof absolutePx === "number" && Number.isFinite(absolutePx)) {
      return { mode: "custom", labelGuideOffsetPx: absolutePx - DEFAULT_PX };
    }
    return undefined;
  }

  // Legacy format: labelGuidePreset + labelGuidePercent → convert to offset
  const preset = raw.labelGuidePreset;
  if (preset === "custom") {
    const percent = raw.labelGuidePercent;
    if (typeof percent === "number" && Number.isFinite(percent)) {
      const absolutePx = Math.round(690 * (percent / 100));
      return { mode: "custom", labelGuideOffsetPx: absolutePx - DEFAULT_PX };
    }
    return undefined;
  }

  // Legacy preset (compact/normal/wide) → convert to offset
  if (typeof preset === "string" && ["compact", "normal", "wide"].includes(preset)) {
    const percentMap: Record<string, number> = { compact: 36, normal: 42, wide: 48 };
    const percent = percentMap[preset];
    const absolutePx = Math.round(690 * (percent / 100));
    return { mode: "custom", labelGuideOffsetPx: absolutePx - DEFAULT_PX };
  }

  return undefined;
}
