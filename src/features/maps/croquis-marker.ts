/**
 * What makes an image of the document a croquis (V5.7-01, nov 2026): its
 * kind, the frame it was generated with and where the appraiser put the
 * street names. It travels inside the image's own metadata
 * (`ImageContent.croquis`, stored in the node's `JConfiguracion`), so a
 * croquis can sit in any block or subbloque, there can be several per
 * valuation, and copying, duplicating, moving or importing a block carries
 * it like any other image field, under the copy's new id. Pure values.
 */
import { z } from "zod";

import { CROQUIS_IMAGE_IDS, CROQUIS_KINDS, type CroquisKind } from "./croquis";
import type { CroquisFrame } from "./map-styles";
import type { LatLon } from "./types";

/** A street name the appraiser moved or turned: where it sits and its angle in degrees (clockwise, 0 = horizontal). */
export interface CroquisLabelPlacement {
  name: string;
  point: LatLon;
  angle: number;
}

export interface CroquisImageMarker {
  kind: CroquisKind;
  /** The frame it was generated with; absent, the valuation's frame for its kind. */
  frame?: CroquisFrame;
  /** The street names placed by hand; the others follow their street. */
  labels?: CroquisLabelPlacement[];
}

/** More names than this would not fit one croquis. */
export const MAX_LABEL_PLACEMENTS = 60;

const pointSchema = z.tuple([z.number().finite().min(-90).max(90), z.number().finite().min(-180).max(180)]);

export const croquisLabelPlacementSchema = z.object({
  name: z.string().trim().min(1).max(120),
  point: pointSchema,
  angle: z.number().finite().min(-180).max(180),
});

export const croquisMarkerSchema = z.object({
  kind: z.enum(CROQUIS_KINDS.map((item) => item.kind) as [CroquisKind, ...CroquisKind[]]),
  frame: z.object({ offset: z.tuple([z.number().finite(), z.number().finite()]), zoom: z.number().int().min(1).max(21) }).optional(),
  labels: z.array(croquisLabelPlacementSchema).max(MAX_LABEL_PLACEMENTS).optional(),
});

/** The marker as stored; anything else (an image that is not a croquis, a damaged value) is no marker. */
export function readCroquisMarker(value: unknown): CroquisImageMarker | undefined {
  const parsed = croquisMarkerSchema.safeParse(value);
  return parsed.success ? (parsed.data as CroquisImageMarker) : undefined;
}

const LEGACY_KINDS = new Map(Object.entries(CROQUIS_IMAGE_IDS).map(([kind, id]) => [id, kind as CroquisKind]));

/**
 * Before 13 nov 2026 a croquis was known by its fixed id
 * (`croquis-macrolocalizacion`…): one macro and one micro per valuation.
 * Read with that id and no marker, the image becomes a croquis of that kind,
 * keeping its id, picture, caption and size, so it keeps working and its
 * copies stay croquis too.
 */
export function withLegacyCroquisMarker<T extends { id: string; croquis?: CroquisImageMarker }>(image: T): T {
  if (image.croquis) return image;
  const kind = LEGACY_KINDS.get(image.id);
  return kind ? { ...image, croquis: { kind } } : image;
}
