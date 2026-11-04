/**
 * "Aplicar al croquis": the croquis as an image stored with the valuation.
 * The server fetches the Maps Static API image with its key, composes the
 * numbered pins of the comparables and the north arrow over it with sharp,
 * and stores the result like any image the editor uploads. The dictamen, its
 * PDF and the deliverables then show it without asking Google for anything.
 */
import sharp from "sharp";

import type { AuthUser } from "@/features/auth/model";
import { storeEditorImage, type EditorImageDto } from "@/features/files/services/editor-image";
import { ValuationWorkflowError } from "@/features/valuations/services/valuation-workflow/errors";

import { CROQUIS_IMAGE_IDS, pinsOverlaySvg, type ComparablePin, type CroquisKind } from "../croquis";
import type { NorthArrow } from "../map-styles";
import { northArrowPlacement, northArrowSvg } from "../north-arrow-symbols";
import { STATIC_MAP_SCALE, STATIC_MAP_SIZE, staticMapUrl } from "../static-map";
import type { LatLon } from "../types";
import { MAPS_NOT_CONFIGURED, googleMapsServerKey } from "./google-maps-keys";

/** Height of the north arrow on the image, in map pixels (the image is at scale 2). */
const NORTH_ARROW_HEIGHT = 44;
const NORTH_ARROW_MARGIN = 10;

export interface CroquisRenderInput {
  kind: CroquisKind;
  center: LatLon;
  zoom: number;
  subject: LatLon;
  clean: boolean;
  northArrow: NorthArrow;
  pins: readonly ComparablePin[];
}

/** The base image from Google, as PNG bytes. */
export async function fetchStaticMap(input: Pick<CroquisRenderInput, "center" | "zoom" | "subject" | "clean">, fetchImpl: typeof fetch = fetch) {
  const apiKey = googleMapsServerKey();
  if (!apiKey) throw new ValuationWorkflowError(MAPS_NOT_CONFIGURED, 503);
  const response = await fetchImpl(staticMapUrl({ apiKey, center: input.center, zoom: input.zoom, subject: input.subject, clean: input.clean }));
  if (!response.ok) {
    // The key is rejected or the API is not enabled: the cause goes to the log, the client gets a generic message.
    console.error(`[CROQUIS] Maps Static API answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    throw new ValuationWorkflowError("No se pudo obtener el mapa de Google; revisa la llave de Google Maps.", 503);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** The base image with the comparables' pins and the north arrow over it, as JPEG. */
export async function composeCroquisImage(base: Buffer, input: Pick<CroquisRenderInput, "center" | "zoom" | "northArrow" | "pins">) {
  const image = sharp(base);
  const metadata = await image.metadata();
  const width = metadata.width ?? STATIC_MAP_SIZE.width * STATIC_MAP_SCALE;
  const height = metadata.height ?? STATIC_MAP_SIZE.height * STATIC_MAP_SCALE;
  // The overlay is drawn for the size the Static API was asked for; a different answer is scaled to fit.
  const scale = width / STATIC_MAP_SIZE.width;
  const arrowHeight = Math.round(NORTH_ARROW_HEIGHT * scale);
  const arrow = Buffer.from(northArrowSvg(input.northArrow.style, arrowHeight));
  const arrowSize = await sharp(arrow).metadata();
  const symbol = { width: arrowSize.width ?? arrowHeight, height: arrowSize.height ?? arrowHeight };
  const placement = northArrowPlacement(input.northArrow.corner, { width, height }, symbol, Math.round(NORTH_ARROW_MARGIN * scale));
  const layers: sharp.OverlayOptions[] = [];
  if (input.pins.length) {
    const pins = Buffer.from(pinsOverlaySvg(input.center, input.zoom, input.pins, scale));
    layers.push({ input: pins, left: 0, top: 0 });
  }
  layers.push({ input: arrow, left: Math.max(0, placement.left), top: Math.max(0, placement.top) });
  return image.composite(layers).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
}

/** The composed image stored as an image of the editor, with its stable address. */
export async function storeCroquisImage(user: Pick<AuthUser, "id" | "organizationId">, kind: CroquisKind, jpeg: Buffer): Promise<EditorImageDto> {
  const file = new File([new Uint8Array(jpeg)], `${CROQUIS_IMAGE_IDS[kind]}.jpg`, { type: "image/jpeg" });
  return storeEditorImage(user, file, "CROQUIS");
}

/** Fetch, compose and store, in that order. */
export async function renderAndStoreCroquis(user: Pick<AuthUser, "id" | "organizationId">, input: CroquisRenderInput) {
  const base = await fetchStaticMap(input);
  const jpeg = await composeCroquisImage(base, input);
  return storeCroquisImage(user, input.kind, jpeg);
}
