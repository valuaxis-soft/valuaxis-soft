/**
 * FAL-11 (decision of the appraiser, 14 nov 2026): the photographs of the
 * subject and of the comparables print two per row, each with its caption
 * (its description), instead of one per page. Applied when the dictamen is
 * laid out (on screen, in the preview and in the server's PDF, which share
 * the renderer), so the photos of every valuation print this way without
 * touching what the editor stores. Pure functions.
 */
import type { Apartado, Block, ContentLayout, ContentLayoutRowV2, ImageContent } from "../model";
import { GENERATED_ID_PREFIX as GENERATED_BLOCK_PREFIX } from "../calculation/generated-block-layout";
import { resolveContentLayout } from "./content-layout";
import { printedImageCaptions } from "./image-captions";

/** The section of the subject's photographs. */
const PHOTO_SECTION_KEY = "FOTOS_SUJETO";
/** The calculation's photo block of a market («FOTOGRAFÍAS DE COMPARABLES: …»): `motor-…-fotos`. */
const COMPARABLE_PHOTOS = new RegExp(`^${GENERATED_BLOCK_PREFIX}.*-fotos`, "i");

/** Whether a block is the fichas of a market's comparables («Croquis y fotografías de comparables»). */
export const isComparableFichasBlock = (block: Pick<Block, "id">) => COMPARABLE_PHOTOS.test(block.id);

/** The images of a block of fichas in the order the appraiser left them (its layout), the enabled and the hidden ones. */
export function fichasInOrder(block: Block): ImageContent[] {
  const byId = new Map(block.images.map((image) => [image.id, image]));
  const ordered = resolveContentLayout(block).rows.flatMap((row) => row.columns.flatMap((column) => column.items))
    .flatMap((item) => (item.type === "image" && byId.has(item.id) ? [byId.get(item.id)!] : []));
  return [...ordered, ...block.images.filter((image) => !ordered.includes(image))];
}

/**
 * Video 8.14: the fichas in this order, each in a row of its own (the
 * print groups them 2 or 3 a row, `photoGridBlock`); the concepts and
 * tables of the block, if the appraiser added any, keep their rows first.
 */
export function withFichasOrder(block: Block, imageIds: readonly string[]): Block {
  const images = new Set(block.images.map((image) => image.id));
  const others = resolveContentLayout(block).rows
    .map((row) => ({ ...row, columns: row.columns.map((column) => ({ ...column, items: column.items.filter((item) => item.type !== "image") })).filter((column) => column.items.length) }))
    .filter((row) => row.columns.length);
  const rows: ContentLayoutRowV2[] = imageIds.filter((id) => images.has(id)).map((id) => ({ id: `r-image-${id}`, columns: [{ id: `c-image-${id}`, items: [{ type: "image", id }] }] }));
  return { ...block, contentLayout: { version: 2, rows: [...others, ...rows] } };
}

/** Moves one item of a list to another place (the fichas dragged or moved with ↑ ↓). */
export function movedTo<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Whether a block's images are photographs: every block of the subject's photos, and the comparables' photo blocks. */
export function isPhotoBlock(sectionKey: string, block: Pick<Block, "id">) {
  return sectionKey === PHOTO_SECTION_KEY || COMPARABLE_PHOTOS.test(block.id);
}

/** A title that is only the file's name («IMG_2034.jpg») says nothing under a photo. */
const FILE_NAME = /\.(jpe?g|png|webp|gif|heic|heif|bmp|tiff?|avif)$/i;

/** The caption a photo prints: its description (its title), unless that is only its file's name. */
export function photoCaption(image: Pick<ImageContent, "title">) {
  const text = image.title?.trim() ?? "";
  return text && !FILE_NAME.test(text) ? text : null;
}

/** A photo with no caption of its own gets its description under it; one with a caption keeps it. */
function withCaption(image: ImageContent): ImageContent {
  if (image.croquis || printedImageCaptions(image, "top").length || printedImageCaptions(image, "bottom").length) return image;
  const text = photoCaption(image);
  return text ? { ...image, captions: [{ id: "photo-caption", text, position: "bottom", align: "center" }] } : image;
}

/**
 * The rows of a container with its lone photos grouped `perRow` a row (two
 * by default): consecutive rows that each hold only one photo become rows
 * of that many columns, in order. Rows with anything else (concepts,
 * tables, a croquis, images the appraiser already put side by side) stay
 * as they are, and a group never crosses them. The last group may be
 * shorter; the renderer prints it with the width of the full ones (`inPhotoGrid`).
 */
export function pairedPhotoRows(layout: ContentLayout, images: ReadonlyMap<string, ImageContent>, perRow = 2): ContentLayoutRowV2[] {
  const lonePhoto = (row: ContentLayoutRowV2) => {
    if (row.columns.length !== 1 || row.columns[0].items.length !== 1) return false;
    const item = row.columns[0].items[0];
    const image = item.type === "image" ? images.get(item.id) : undefined;
    return Boolean(image && !image.croquis);
  };
  const rows: ContentLayoutRowV2[] = [];
  let pending: ContentLayoutRowV2 | null = null;
  const flush = () => {
    if (pending) rows.push(pending);
    pending = null;
  };
  for (const row of layout.rows) {
    if (!lonePhoto(row)) {
      flush();
      rows.push(row);
      continue;
    }
    const grown: ContentLayoutRowV2 = pending ? { ...pending, columns: [...pending.columns, row.columns[0]] } : row;
    if (grown.columns.length >= perRow) {
      rows.push(grown);
      pending = null;
    } else pending = grown;
  }
  flush();
  return rows;
}

/** Video 8.14: the photos a row and the size of each, as the appraiser chose them for a block of fichas; two a row at full size by default. */
export function photoGridOf(block: Pick<Block, "photoGrid">) {
  return { perRow: block.photoGrid?.perRow ?? 2, size: block.photoGrid?.size ?? 100 };
}

function photoGrid<T extends Block | Apartado>(container: T, perRow: number, size: number): T {
  if (!container.images.length) return container;
  // The chosen size, for the photos the appraiser did not size one by one.
  const images = container.images.map(withCaption).map((image) =>
    size < 100 && image.layoutWidthPercent === undefined && !image.layoutWidth ? { ...image, layoutWidthPercent: size } : image);
  const layout = resolveContentLayout(container);
  return { ...container, images, contentLayout: { version: 2, rows: pairedPhotoRows(layout, new Map(images.map((image) => [image.id, image])), perRow) } };
}

/** The block as its photographs print: two per row (or as chosen), with their captions, in the block and in its apartados. */
export function photoGridBlock(block: Block): Block {
  const { perRow, size } = photoGridOf(block);
  return { ...photoGrid(block, perRow, size), apartados: block.apartados.map((apartado) => photoGrid(apartado, perRow, size)) };
}
