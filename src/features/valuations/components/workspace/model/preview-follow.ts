import type { AppSection, Block } from "@/features/valuations/model";
import { printableSectionGroups } from "@/features/valuations/services/printable-sections";

/**
 * The preview follows the editor: it shows the section with the ones it
 * shares pages with («Continuar donde terminó la sección anterior», V6.1-09),
 * as the dictamen prints them, and moves to the block the appraiser is
 * working on, or to the market chosen in the calculation (V6.2-10).
 */

/** The sections printed on the same pages as this one, in order; only itself when it starts its own pages. Pure. */
export function previewGroupIds(sections: AppSection[], sectionId: string): string[] {
  const group = printableSectionGroups(sections).find((candidate) => candidate.some((section) => section.id === sectionId));
  return group ? group.map((section) => section.id) : [sectionId];
}

/** The generated block of the dictamen a market of the calculation writes («TERRENO_VENTA» → its pages; market-document.ts). */
export const marketBlockId = (comparableType: string) => `motor-mercado-${comparableType.toLowerCase()}-enfoque`;

type ElementLike = { closest: (selector: string) => { getAttribute: (name: string) => string | null } | null };

/** What the editor marks on the element the appraiser is on, nearest first. */
type EditorMark = { attribute: "data-block-id" | "data-concept-id" | "data-table-editor"; id: string };

/**
 * The block of the dictamen the appraiser is on: the market chosen in the
 * calculation panel, or what the editor marks around the element he clicked
 * or typed in (the block's card, else the concept or the table, whose block
 * is looked up in the section). Pure over the element's ancestors.
 */
export function followedBlockId(target: ElementLike | null, section?: Pick<AppSection, "blocks">): string | null {
  if (!target) return null;
  const market = target.closest("[data-active-market]")?.getAttribute("data-active-market");
  if (market) return marketBlockId(market);
  for (const attribute of ["data-block-id", "data-concept-id", "data-table-editor"] as const) {
    const id = target.closest(`[${attribute}]`)?.getAttribute(attribute);
    if (!id) continue;
    if (attribute === "data-block-id") return id;
    const block = section?.blocks.find((candidate) => blockHolds(candidate, { attribute, id }));
    if (block) return block.id;
  }
  return null;
}

const blockHolds = (block: Block, mark: EditorMark) => {
  const parts = [block, ...block.apartados];
  return mark.attribute === "data-concept-id"
    ? parts.some((part) => part.concepts.some((concept) => concept.id === mark.id))
    : parts.some((part) => part.tables.some((table) => table.id === mark.id));
};

const quoted = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;

/**
 * The printed page item where a block starts: its title, or its first row
 * when it prints none. Only items laid out on a page count, not the copies
 * the paginator measures. Pure.
 */
export function previewBlockSelector(blockId: string): string {
  return `[data-preview-page] [data-document-flow-item-id^=${quoted(`${blockId}:`)}], [data-preview-page] [data-document-flow-item-id=${quoted(blockId)}]`;
}

/** The scroll that puts the item a little under the top of the preview's view. Pure. */
export function previewScrollDelta(itemTop: number, viewTop: number, margin = 16): number {
  return itemTop - viewTop - margin;
}

/**
 * Moves the preview to where the block prints. The pages are laid out a
 * moment after a change, so it looks again for a while before giving up (the
 * block may be in a section the preview does not show).
 */
export function revealBlockInPreview(blockId: string, options: { behavior?: ScrollBehavior; attempts?: number } = {}): () => void {
  let cancelled = false;
  let timer = 0;
  const attempt = (left: number) => {
    if (cancelled) return;
    const scroller = document.querySelector<HTMLElement>("#valuation-preview [data-preview-scroller]");
    const item = scroller?.querySelector<HTMLElement>(previewBlockSelector(blockId));
    if (scroller && item) {
      const delta = previewScrollDelta(item.getBoundingClientRect().top, scroller.getBoundingClientRect().top);
      if (Math.abs(delta) > 2) scroller.scrollBy({ top: delta, behavior: options.behavior ?? "smooth" });
      return;
    }
    if (left > 0) timer = window.setTimeout(() => attempt(left - 1), 150);
  };
  attempt(options.attempts ?? 12);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
