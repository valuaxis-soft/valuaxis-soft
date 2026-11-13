/**
 * Where the croquis images go in the valuation's document: the macro and
 * micro croquis side by side in the Croquis section, the map of comparables
 * in its annex. "Aplicar al croquis" stores each image like any uploaded one
 * and this puts it in its place, or replaces the one from the last time, so
 * the appraiser keeps editing it (caption, size, turn) like any image block.
 * Pure functions over the editor's sections.
 */
import type { AppSection, Block, ContentLayout, ImageContent } from "@/features/valuations/model";
import { isGeneratedBlock } from "@/features/valuations/calculation/market-document";
import { ensureBlockContentIntegrity, withAddedBlockContent } from "@/features/valuations/components/workspace/model/section-content";
import { newId } from "@/features/valuations/components/workspace/model/content-factories";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import { captionsPatch } from "@/features/valuations/services/image-captions";

import { CROQUIS_IMAGE_IDS, croquisKind, type CroquisKind } from "./croquis";


/** The section each capture prints in. */
export function croquisSectionKey(kind: CroquisKind) {
  return kind === "comparables" ? "MAPA_COMPARABLES" : "CROQUIS_COMPARABLES";
}

/** The block the croquis go in: the first one the appraiser edits (never a block the calculation generates). */
function targetBlock(section: AppSection) {
  return section.blocks.find((block) => !isGeneratedBlock(block)) ?? null;
}

function emptyBlock(title: string): Block {
  return { id: newId(), title, sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [] };
}

function imageOf(kind: CroquisKind, src: string): ImageContent {
  const { caption } = croquisKind(kind);
  return {
    id: CROQUIS_IMAGE_IDS[kind],
    title: caption,
    src,
    enabled: true,
    ...captionsPatch([{ id: "caption-1", text: caption, position: "bottom", align: "center" }]),
  };
}

/** The row of the layout holding this item, with the index of its column. */
function findItem(layout: ContentLayout, imageId: string) {
  for (const row of layout.rows) {
    const column = row.columns.findIndex((col) => col.items.some((item) => item.type === "image" && item.id === imageId));
    if (column >= 0) return { row, column };
  }
  return null;
}

/**
 * The macro and the micro croquis share one row, each in its own column, so
 * they print side by side. Only when each sits alone in its row: a layout the
 * appraiser arranged otherwise is left as it is.
 */
function pairCroquisRow(block: Block): Block {
  const layout = block.contentLayout;
  if (!layout) return block;
  const macro = findItem(layout, CROQUIS_IMAGE_IDS.macro);
  const micro = findItem(layout, CROQUIS_IMAGE_IDS.micro);
  if (!macro || !micro || macro.row.id === micro.row.id) return block;
  const alone = (found: NonNullable<typeof macro>) => found.row.columns.length === 1 && found.row.columns[0].items.length === 1;
  if (!alone(macro) || !alone(micro)) return block;
  const rows = layout.rows
    .filter((row) => row.id !== micro.row.id)
    .map((row) => (row.id === macro.row.id ? { ...row, columns: [...row.columns, { ...micro.row.columns[0], id: `${row.id}-col-micro` }] } : row));
  return ensureBlockContentIntegrity({ ...block, contentLayout: { version: 2, rows } });
}

function withImageInBlock(block: Block, kind: CroquisKind, src: string): Block {
  const id = CROQUIS_IMAGE_IDS[kind];
  const fresh = imageOf(kind, src);
  if (block.images.some((image) => image.id === id)) {
    // The appraiser's caption, size and turn stay; only the picture changes.
    return ensureBlockContentIntegrity({ ...block, images: block.images.map((image) => (image.id === id ? { ...image, src, enabled: true } : image)) });
  }
  const inApartado = block.apartados.find((apartado) => apartado.images.some((image) => image.id === id));
  if (inApartado) {
    return {
      ...block,
      apartados: block.apartados.map((apartado) =>
        apartado.id === inApartado.id ? { ...apartado, images: apartado.images.map((image) => (image.id === id ? { ...image, src, enabled: true } : image)) } : apartado,
      ),
    };
  }
  return pairCroquisRow(withAddedBlockContent({ ...block, images: [...block.images, fresh] }, { type: "image", id }));
}

/**
 * A manual image gives way to the croquis: the croquis takes its place in
 * the layout (same row and column) and the manual image leaves the block.
 * The editor's «Deshacer» brings it back.
 */
function withImageReplacing(block: Block, kind: CroquisKind, src: string, replacedId: string): Block {
  const fresh = imageOf(kind, src);
  const layout = block.contentLayout;
  const contentLayout = layout
    ? {
        ...layout,
        rows: layout.rows.map((row) => ({
          ...row,
          columns: row.columns.map((column) => ({
            ...column,
            items: column.items.map((item) => (item.type === "image" && item.id === replacedId ? { ...item, id: fresh.id } : item)),
          })),
        })),
      }
    : layout;
  return ensureBlockContentIntegrity({ ...block, images: block.images.map((image) => (image.id === replacedId ? fresh : image)), contentLayout });
}

/** One croquis to put in the document; `replaceImageId` is a manual image of its block it replaces. */
export interface CroquisPlacement {
  kind: CroquisKind;
  src: string;
  replaceImageId?: string | null;
}

/**
 * The sections with this croquis image in its place. `placed` is false when
 * the section is not in the document (the appraiser removed it), in which
 * case nothing changes. A croquis already in the document replaces itself;
 * the first time, `replaceImageId` (a manual image of the same block) gives
 * way to it, otherwise it is added beside what is there.
 */
export function withCroquisImage(sections: readonly AppSection[], kind: CroquisKind, src: string, replaceImageId?: string | null): { sections: AppSection[]; placed: boolean } {
  const sectionKey = croquisSectionKey(kind);
  const section = sections.find((item) => !item.removed && getCanonicalSectionKey(item.id) === sectionKey);
  if (!section) return { sections: [...sections], placed: false };
  const block = targetBlock(section) ?? emptyBlock(section.title);
  const replacing = !findCroquisImage(sections, kind) && replaceImageId && block.images.some((image) => image.id === replaceImageId);
  const updated = replacing ? withImageReplacing(block, kind, src, replaceImageId) : withImageInBlock(block, kind, src);
  const blocks = section.blocks.some((item) => item.id === block.id)
    ? section.blocks.map((item) => (item.id === block.id ? updated : item))
    : [updated, ...section.blocks];
  return { sections: sections.map((item) => (item.id === section.id ? { ...item, blocks } : item)), placed: true };
}

/** Several croquis at once (one step of the editor's history); the kinds whose section is not in the document come back. */
export function withCroquisImages(sections: readonly AppSection[], placements: readonly CroquisPlacement[]) {
  let current: AppSection[] = [...sections];
  const missing: CroquisKind[] = [];
  for (const placement of placements) {
    const result = withCroquisImage(current, placement.kind, placement.src, placement.replaceImageId);
    current = result.sections;
    if (!result.placed) missing.push(placement.kind);
  }
  return { sections: current, missing };
}

/**
 * MAP-11: the images uploaded by hand where a croquis would go the first
 * time, each paired with the croquis that would replace it, in the order
 * they show (the macro takes the first, the micro the next). A croquis
 * already in the document replaces itself and takes none.
 */
export function croquisReplacements(sections: readonly AppSection[], kinds: readonly CroquisKind[]): Partial<Record<CroquisKind, ImageContent>> {
  const taken = new Set<string>();
  const pairs: Partial<Record<CroquisKind, ImageContent>> = {};
  const croquisIds = new Set(Object.values(CROQUIS_IMAGE_IDS));
  for (const kind of kinds) {
    if (findCroquisImage(sections, kind)) continue;
    const section = sections.find((item) => !item.removed && getCanonicalSectionKey(item.id) === croquisSectionKey(kind));
    const block = section ? targetBlock(section) : null;
    if (!block) continue;
    const manual = orderedImages(block).find((image) => !croquisIds.has(image.id) && !taken.has(image.id) && image.src);
    if (!manual) continue;
    taken.add(manual.id);
    pairs[kind] = manual;
  }
  return pairs;
}

/** The block's own images in the order the layout shows them; those not in the layout last. */
function orderedImages(block: Block) {
  const order = (block.contentLayout?.rows ?? []).flatMap((row) => row.columns.flatMap((column) => column.items.filter((item) => item.type === "image").map((item) => item.id)));
  const rank = (id: string) => {
    const index = order.indexOf(id);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...block.images].sort((a, b) => rank(a.id) - rank(b.id));
}

/** The image of this croquis as the document carries it now, if any. */
export function findCroquisImage(sections: readonly AppSection[], kind: CroquisKind): ImageContent | null {
  const section = sections.find((item) => !item.removed && getCanonicalSectionKey(item.id) === croquisSectionKey(kind));
  const id = CROQUIS_IMAGE_IDS[kind];
  for (const block of section?.blocks ?? []) {
    const image = block.images.find((item) => item.id === id) ?? block.apartados.flatMap((apartado) => apartado.images).find((item) => item.id === id);
    if (image) return image;
  }
  return null;
}
