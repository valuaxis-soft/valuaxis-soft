/**
 * FAL-11 (decision of the appraiser, 14 nov 2026): the photographs of the
 * subject and of the comparables print two per row, each with its caption
 * (its description), instead of one per page. Applied when the dictamen is
 * laid out (on screen, in the preview and in the server's PDF, which share
 * the renderer), so the photos of every valuation print this way without
 * touching what the editor stores. Pure functions.
 */
import type { Apartado, Block, ContentLayout, ContentLayoutRowV2, ImageContent } from "../model";
import { GENERATED_BLOCK_PREFIX } from "../calculation/market-document";
import { resolveContentLayout } from "./content-layout";
import { printedImageCaptions } from "./image-captions";

/** The section of the subject's photographs. */
const PHOTO_SECTION_KEY = "FOTOS_SUJETO";
/** The calculation's photo block of a market («FOTOGRAFÍAS DE COMPARABLES: …»): `motor-…-fotos`. */
const COMPARABLE_PHOTOS = new RegExp(`^${GENERATED_BLOCK_PREFIX}.*-fotos`, "i");

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
 * The rows of a container with its lone photos paired: two rows in a row
 * that each hold only one photo become one row of two columns, in order. Rows with
 * anything else (concepts, tables, a croquis, images the appraiser already
 * put side by side) stay as they are, and a pair never crosses them. A
 * last photo without a pair stays alone in its row; the renderer prints it
 * at the half width of the others (`inPhotoGrid`).
 */
export function pairedPhotoRows(layout: ContentLayout, images: ReadonlyMap<string, ImageContent>): ContentLayoutRowV2[] {
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
    } else if (pending) {
      const first: ContentLayoutRowV2 = pending;
      rows.push({ ...first, columns: [first.columns[0], row.columns[0]] });
      pending = null;
    } else pending = row;
  }
  flush();
  return rows;
}

function photoGrid<T extends Block | Apartado>(container: T): T {
  if (!container.images.length) return container;
  const images = container.images.map(withCaption);
  const layout = resolveContentLayout(container);
  return { ...container, images, contentLayout: { version: 2, rows: pairedPhotoRows(layout, new Map(images.map((image) => [image.id, image]))) } };
}

/** The block as its photographs print: two per row, with their captions, in the block and in its apartados. */
export function photoGridBlock(block: Block): Block {
  return { ...photoGrid(block), apartados: block.apartados.map((apartado) => photoGrid(apartado)) };
}
