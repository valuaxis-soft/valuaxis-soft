/**
 * Where the croquis images go in the valuation's document. "Generar croquis
 * de localización" stores each image like any uploaded one and this puts it
 * in its place, so the appraiser keeps editing it (caption, size, turn) like
 * any image of a block:
 *
 * - **Any block or subbloque** (V5.7-01, nov 2026): «Agregar → Croquis de
 *   localización» inserts new croquis images there, each with an id of its
 *   own (several per valuation); generating again from one of them replaces
 *   only its picture.
 * - **The Croquis section and the annex Mapa de comparables** keep their
 *   access: the croquis of that kind already in the section is replaced, or
 *   a new one goes into its first block (macro and micro side by side).
 *
 * A croquis is known by its marker (`ImageContent.croquis`), not by its id.
 * Pure functions over the editor's sections.
 */
import type { AppSection, Apartado, Block, ContentLayout, ImageContent } from "@/features/valuations/model";
import { isGeneratedBlock } from "@/features/valuations/calculation/market-document";
import { ensureBlockContentIntegrity, withAddedApartadoContent, withAddedBlockContent } from "@/features/valuations/components/workspace/model/section-content";
import { newId } from "@/features/valuations/components/workspace/model/content-factories";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import { captionsPatch } from "@/features/valuations/services/image-captions";
import { isRelationManagedImageSection } from "@/features/valuations/services/image-source";

import { croquisKind, type CroquisKind } from "./croquis";
import type { CroquisImageMarker } from "./croquis-marker";

/** The section each kind's own access prints in. */
export function croquisSectionKey(kind: CroquisKind) {
  return kind === "comparables" ? "MAPA_COMPARABLES" : "CROQUIS_COMPARABLES";
}

/**
 * Why a croquis cannot be added here, or null. The carátula takes concepts
 * and subbloques only (its «Agregar» has no images), and the images of Datos
 * generales are files of their own service, known by id: a croquis there
 * would not print.
 */
export function croquisInsertLock(sectionId: string): string | null {
  if (sectionId === "caratula") return "La carátula solo lleva conceptos y subbloques: agrega el croquis en otra sección.";
  if (isRelationManagedImageSection(sectionId)) return "Las imágenes de Datos generales son archivos de esa sección: agrega el croquis en otra sección (por ejemplo, Terreno).";
  return null;
}

/** The block the section's own access puts new croquis in: the first one the appraiser edits (never a block the calculation generates). */
function targetBlock(section: AppSection) {
  return section.blocks.find((block) => !isGeneratedBlock(block)) ?? null;
}

function emptyBlock(title: string): Block {
  return { id: newId(), title, sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [] };
}

/** A new croquis image with its caption ("Croquis de macrolocalización"…) and an id of its own. */
export function newCroquisImage(marker: CroquisImageMarker, src: string, id: string = newId()): ImageContent {
  const { caption } = croquisKind(marker.kind);
  return {
    id,
    title: caption,
    src,
    enabled: true,
    croquis: marker,
    ...captionsPatch([{ id: "caption-1", text: caption, position: "bottom", align: "center" }]),
  };
}

/** Where an image lives in the document. */
export interface CroquisLocation {
  sectionId: string;
  blockId: string;
  apartadoId?: string;
}

export interface LocatedCroquis extends CroquisLocation {
  image: ImageContent & { croquis: CroquisImageMarker };
}

const isCroquis = (image: ImageContent): image is ImageContent & { croquis: CroquisImageMarker } => Boolean(image.croquis);

/** Every croquis of the document (of the sections still in it), in the order of sections, blocks and subbloques. */
export function documentCroquis(sections: readonly AppSection[]): LocatedCroquis[] {
  return sections
    .filter((section) => !section.removed)
    .flatMap((section) =>
      section.blocks.flatMap((block) => [
        ...block.images.filter(isCroquis).map((image) => ({ sectionId: section.id, blockId: block.id, image })),
        ...block.apartados.flatMap((apartado) => apartado.images.filter(isCroquis).map((image) => ({ sectionId: section.id, blockId: block.id, apartadoId: apartado.id, image }))),
      ]),
    );
}

/** One croquis by its image id. */
export function findCroquisById(sections: readonly AppSection[], imageId: string): LocatedCroquis | null {
  return documentCroquis(sections).find((entry) => entry.image.id === imageId) ?? null;
}

/** The first croquis of this kind in the section that kind's own access fills (Croquis, or the annex for the map of comparables). */
export function findCroquisImage(sections: readonly AppSection[], kind: CroquisKind): ImageContent | null {
  const section = sections.find((item) => !item.removed && getCanonicalSectionKey(item.id) === croquisSectionKey(kind));
  if (!section) return null;
  return documentCroquis([section]).find((entry) => entry.image.croquis.kind === kind)?.image ?? null;
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
function pairedLayout(layout: ContentLayout | undefined, macroId: string, microId: string): ContentLayout | undefined {
  if (!layout) return layout;
  const macro = findItem(layout, macroId);
  const micro = findItem(layout, microId);
  if (!macro || !micro || macro.row.id === micro.row.id) return layout;
  const alone = (found: NonNullable<typeof macro>) => found.row.columns.length === 1 && found.row.columns[0].items.length === 1;
  if (!alone(macro) || !alone(micro)) return layout;
  const rows = layout.rows
    .filter((row) => row.id !== micro.row.id)
    .map((row) => (row.id === macro.row.id ? { ...row, columns: [...row.columns, { ...micro.row.columns[0], id: `${row.id}-col-micro` }] } : row));
  return { version: 2, rows };
}

function pairBlock(block: Block, macroId: string, microId: string): Block {
  const contentLayout = pairedLayout(block.contentLayout, macroId, microId);
  return contentLayout === block.contentLayout ? block : ensureBlockContentIntegrity({ ...block, contentLayout });
}

function pairApartado(apartado: Apartado, macroId: string, microId: string): Apartado {
  const contentLayout = pairedLayout(apartado.contentLayout, macroId, microId);
  return contentLayout === apartado.contentLayout ? apartado : { ...apartado, contentLayout };
}

/** A generated croquis: its picture and the marker it was made with. */
export interface GeneratedCroquis {
  kind: CroquisKind;
  src: string;
  marker: CroquisImageMarker;
}

/**
 * The croquis inserted at the end of a block or subbloque, each with an id of
 * its own; a macro and a micro inserted together print side by side. Returns
 * the sections unchanged when the place no longer exists or does not take a
 * croquis.
 */
export function withInsertedCroquis(sections: readonly AppSection[], at: CroquisLocation, generated: readonly GeneratedCroquis[]): { sections: AppSection[]; imageIds: string[] } {
  const section = sections.find((item) => item.id === at.sectionId && !item.removed);
  const block = section?.blocks.find((item) => item.id === at.blockId);
  if (!section || !block || croquisInsertLock(section.id) || isGeneratedBlock(block) || !generated.length) return { sections: [...sections], imageIds: [] };
  if (at.apartadoId && !block.apartados.some((apartado) => apartado.id === at.apartadoId)) return { sections: [...sections], imageIds: [] };
  const images = generated.map((item) => newCroquisImage(item.marker, item.src));
  const macro = images.find((image) => image.croquis?.kind === "macro");
  const micro = images.find((image) => image.croquis?.kind === "micro");
  let updated: Block;
  if (!at.apartadoId) {
    updated = images.reduce((current, image) => withAddedBlockContent({ ...current, images: [...current.images, image] }, { type: "image", id: image.id }), block);
    if (macro && micro) updated = pairBlock(updated, macro.id, micro.id);
  } else {
    updated = {
      ...block,
      apartados: block.apartados.map((apartado) => {
        if (apartado.id !== at.apartadoId) return apartado;
        const added = images.reduce((current, image) => withAddedApartadoContent({ ...current, images: [...current.images, image] }, { type: "image", id: image.id }), apartado);
        return macro && micro ? pairApartado(added, macro.id, micro.id) : added;
      }),
    };
  }
  return {
    sections: sections.map((item) => (item.id === section.id ? { ...item, blocks: item.blocks.map((entry) => (entry.id === block.id ? updated : entry)) } : item)),
    imageIds: images.map((image) => image.id),
  };
}

/**
 * The croquis image with this id gets its new picture and marker wherever it
 * is (block or subbloque, any section); the appraiser's caption, size, turn
 * and framing stay. False when it is no longer in the document.
 */
export function withUpdatedCroquis(sections: readonly AppSection[], imageId: string, src: string, marker: CroquisImageMarker): { sections: AppSection[]; updated: boolean } {
  const found = findCroquisById(sections, imageId);
  if (!found) return { sections: [...sections], updated: false };
  const patch = (image: ImageContent) => (image.id === imageId ? { ...image, src, croquis: marker, enabled: true } : image);
  return {
    updated: true,
    sections: sections.map((section) =>
      section.id !== found.sectionId
        ? section
        : {
            ...section,
            blocks: section.blocks.map((block) =>
              block.id !== found.blockId
                ? block
                : found.apartadoId
                  ? { ...block, apartados: block.apartados.map((apartado) => (apartado.id === found.apartadoId ? { ...apartado, images: apartado.images.map(patch) } : apartado)) }
                  : { ...block, images: block.images.map(patch) },
            ),
          },
    ),
  };
}

/**
 * A manual image gives way to the croquis: the croquis takes its place in
 * the layout (same row and column) and the manual image leaves the block.
 * The editor's «Deshacer» brings it back.
 */
function withImageReplacing(block: Block, fresh: ImageContent, replacedId: string): Block {
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

/** One croquis for the section's own access; `replaceImageId` is a manual image of its block it replaces. */
export interface CroquisPlacement extends GeneratedCroquis {
  replaceImageId?: string | null;
}

/**
 * The section's own access: the croquis of this kind already in its section
 * gets the new picture; otherwise a new one goes into the section's first
 * block, in place of `replaceImageId` (a manual image of that block) or
 * beside what is there. `placed` is false when the section is not in the
 * document (the appraiser removed it).
 */
export function withCroquisImage(sections: readonly AppSection[], placement: CroquisPlacement): { sections: AppSection[]; placed: boolean } {
  const sectionKey = croquisSectionKey(placement.kind);
  const section = sections.find((item) => !item.removed && getCanonicalSectionKey(item.id) === sectionKey);
  if (!section) return { sections: [...sections], placed: false };
  const existing = findCroquisImage(sections, placement.kind);
  if (existing) return { sections: withUpdatedCroquis(sections, existing.id, placement.src, placement.marker).sections, placed: true };
  const block = targetBlock(section) ?? emptyBlock(section.title);
  const fresh = newCroquisImage(placement.marker, placement.src);
  let updated: Block;
  if (placement.replaceImageId && block.images.some((image) => image.id === placement.replaceImageId)) updated = withImageReplacing(block, fresh, placement.replaceImageId);
  else {
    updated = withAddedBlockContent({ ...block, images: [...block.images, fresh] }, { type: "image", id: fresh.id });
    const other = block.images.find((image) => image.croquis && image.croquis.kind === (placement.kind === "macro" ? "micro" : placement.kind === "micro" ? "macro" : null));
    if (other) updated = placement.kind === "macro" ? pairBlock(updated, fresh.id, other.id) : pairBlock(updated, other.id, fresh.id);
  }
  const blocks = section.blocks.some((item) => item.id === block.id) ? section.blocks.map((item) => (item.id === block.id ? updated : item)) : [updated, ...section.blocks];
  return { sections: sections.map((item) => (item.id === section.id ? { ...item, blocks } : item)), placed: true };
}

/** Several croquis at once (one step of the editor's history); the kinds whose section is not in the document come back. */
export function withCroquisImages(sections: readonly AppSection[], placements: readonly CroquisPlacement[]) {
  let current: AppSection[] = [...sections];
  const missing: CroquisKind[] = [];
  for (const placement of placements) {
    const result = withCroquisImage(current, placement);
    current = result.sections;
    if (!result.placed) missing.push(placement.kind);
  }
  return { sections: current, missing };
}

/**
 * MAP-11: the images uploaded by hand where a croquis would go the first
 * time, each paired with the croquis that would replace it, in the order
 * they show (the macro takes the first, the micro the next). A croquis
 * already in the section replaces itself and takes none.
 */
export function croquisReplacements(sections: readonly AppSection[], kinds: readonly CroquisKind[]): Partial<Record<CroquisKind, ImageContent>> {
  const taken = new Set<string>();
  const pairs: Partial<Record<CroquisKind, ImageContent>> = {};
  for (const kind of kinds) {
    if (findCroquisImage(sections, kind)) continue;
    const section = sections.find((item) => !item.removed && getCanonicalSectionKey(item.id) === croquisSectionKey(kind));
    const block = section ? targetBlock(section) : null;
    if (!block) continue;
    const manual = orderedImages(block).find((image) => !image.croquis && !taken.has(image.id) && image.src);
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

