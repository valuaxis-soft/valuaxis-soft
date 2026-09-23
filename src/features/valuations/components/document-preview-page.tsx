"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { AppSection } from "../model";
import { ensureTableV2 } from "../services/table";

export type DocumentFlowItem = {
  id: string;
  startOnNewPage?: boolean;
  node: ReactNode;
};

/**
 * Canonical layout-only frame for each DocumentFlowItem.
 *
 * Used IDENTICALLY in both measurement DOM and visible DOM to guarantee
 * the paginator measures the exact same box it displays.
 *
 * - flow-root creates a Block Formatting Context (BFC)
 * - No visual decoration, no semantic change
 * - data-document-flow-item-id enables ID-based measurement mapping
 */
function DocumentFlowItemFrame({
  itemId,
  children,
}: {
  itemId: string;
  children: ReactNode;
}) {
  return (
    <div className="flow-root" data-document-flow-item-id={itemId}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Layout invalidation context                                        */
/* ------------------------------------------------------------------ */

type LayoutInvalidationContextValue = {
  requestPagination: () => void;
};

const LayoutInvalidationContext = createContext<LayoutInvalidationContextValue | null>(null);

/**
 * Generic hook for children (e.g. DocumentImage) to request pagination
 * remeasurement after async geometry changes (image onLoad, etc.).
 */
export function useLayoutInvalidation() {
  return useContext(LayoutInvalidationContext);
}

/* ------------------------------------------------------------------ */
/*  Pagination reporter — page count flows UPWARD from flow to viewer   */
/* ------------------------------------------------------------------ */

type PaginationReporterContextValue = {
  reportPageCount: (count: number) => void;
};

const PaginationReporterContext = createContext<PaginationReporterContextValue>({
  reportPageCount: () => {},
});

/**
 * Provide a callback that AutoPaginatedDocumentFlow will call
 * whenever its visible page count changes.
 */
export function PaginationReporterProvider({
  onReportPageCount,
  children,
}: {
  onReportPageCount: (count: number) => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ reportPageCount: onReportPageCount }), [onReportPageCount]);
  return (
    <PaginationReporterContext.Provider value={value}>
      {children}
    </PaginationReporterContext.Provider>
  );
}

function useReportPageCount() {
  return useContext(PaginationReporterContext).reportPageCount;
}

/* ------------------------------------------------------------------ */
/*  Centralized document layout key computation                        */
/* ------------------------------------------------------------------ */

function hashStr(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

function hashNumber(h: number, n: number): number {
  return ((h << 5) - h + (n | 0)) | 0;
}

/**
 * Compute a stable layout invalidation key from canonical document data.
 *
 * Changes for ANY semantically relevant rendered content change:
 * - Concept label, value, type, format, layout width
 * - Image src, caption, width, layout metadata
 * - Table columns, cell contents, structure
 * - Block title, enabled, pageBreak
 * - Apartado title, enabled
 *
 * Same semantic input → same key.
 * Different relevant content → different key.
 */
export function computeDocumentLayoutKey(section: AppSection): string {
  let h = 0;
  for (const block of section.blocks) {
    h = hashStr(h, block.id);
    h = hashStr(h, block.title);
    h = hashNumber(h, block.enabled ? 1 : 0);
    h = hashNumber(h, block.startOnNewPage ? 1 : 0);
    h = hashNumber(h, block.concepts.length);
    for (const c of block.concepts) {
      h = hashStr(h, c.id);
      h = hashStr(h, c.label);
      h = hashStr(h, c.value);
      h = hashStr(h, c.type ?? "text");
      h = hashStr(h, c.valueFormat ?? "");
      h = hashStr(h, c.sourceUnit ?? "");
      h = hashStr(h, c.customUnit ?? "");
      h = hashStr(h, c.layoutSpan ?? "");
    }
    h = hashNumber(h, block.images.length);
    for (const img of block.images) {
      h = hashStr(h, img.id);
      h = hashStr(h, img.src ?? "");
      h = hashNumber(h, img.enabled ? 1 : 0);
      h = hashNumber(h, img.captionEnabled ? 1 : 0);
      h = hashStr(h, img.captionText ?? "");
      h = hashStr(h, img.captionPosition ?? "");
      h = hashStr(h, img.captionAlign ?? "");
      h = hashStr(h, img.layoutWidth ?? "");
      h = hashNumber(h, img.layoutWidthPercent ?? 0);
    }
    h = hashNumber(h, block.tables.length);
    for (const t of block.tables) {
      const t2 = ensureTableV2(t);
      h = hashStr(h, t2.id);
      h = hashStr(h, t2.title);
      h = hashNumber(h, t2.enabled ? 1 : 0);
      h = hashNumber(h, t2.columns.length);
      for (const col of t2.columns) {
        h = hashStr(h, col.id);
        h = hashStr(h, col.name);
      }
      h = hashNumber(h, t2.rows.length);
      for (const row of t2.rows) {
        h = hashStr(h, row.id);
        for (const col of t2.columns) {
          const cell = row.cells[col.id];
          if (!cell) {
            h = hashStr(h, "");
          } else if (cell.kind === "value") {
            h = hashStr(h, "v");
            h = hashStr(h, cell.value);
          } else {
            h = hashStr(h, "f");
            h = hashStr(h, JSON.stringify(cell.formula.expression));
          }
        }
      }
    }
    h = hashNumber(h, block.apartados.length);
    for (const sb of block.apartados) {
      h = hashStr(h, sb.id);
      h = hashStr(h, sb.title);
      h = hashNumber(h, sb.enabled ? 1 : 0);
      h = hashNumber(h, sb.startOnNewPage ? 1 : 0);
      h = hashNumber(h, sb.concepts.length);
      for (const c of sb.concepts) {
        h = hashStr(h, c.id);
        h = hashStr(h, c.label);
        h = hashStr(h, c.value);
        h = hashStr(h, c.type ?? "text");
        h = hashStr(h, c.valueFormat ?? "");
        h = hashStr(h, c.sourceUnit ?? "");
        h = hashStr(h, c.customUnit ?? "");
        h = hashStr(h, c.layoutSpan ?? "");
      }
      h = hashNumber(h, sb.images.length);
      for (const img of sb.images) {
        h = hashStr(h, img.id);
        h = hashStr(h, img.src ?? "");
        h = hashNumber(h, img.enabled ? 1 : 0);
        h = hashNumber(h, img.captionEnabled ? 1 : 0);
        h = hashStr(h, img.captionText ?? "");
        h = hashStr(h, img.captionPosition ?? "");
        h = hashStr(h, img.captionAlign ?? "");
        h = hashStr(h, img.layoutWidth ?? "");
        h = hashNumber(h, img.layoutWidthPercent ?? 0);
      }
      h = hashNumber(h, sb.tables.length);
      for (const t of sb.tables) {
        const t2 = ensureTableV2(t);
        h = hashStr(h, t2.id);
        h = hashStr(h, t2.title);
        h = hashNumber(h, t2.enabled ? 1 : 0);
        h = hashNumber(h, t2.columns.length);
        for (const col of t2.columns) {
          h = hashStr(h, col.id);
          h = hashStr(h, col.name);
        }
        h = hashNumber(h, t2.rows.length);
        for (const row of t2.rows) {
          h = hashStr(h, row.id);
          for (const col of t2.columns) {
            const cell = row.cells[col.id];
            if (!cell) {
              h = hashStr(h, "");
            } else if (cell.kind === "value") {
              h = hashStr(h, "v");
              h = hashStr(h, cell.value);
            } else {
              h = hashStr(h, "f");
              h = hashStr(h, JSON.stringify(cell.formula.expression));
            }
          }
        }
      }
    }
  }
  return String(h);
}

type AutoPaginatedContentProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "className" | "style"
> &
  Partial<Record<`data-${string}`, string | number | boolean>>;

const LETTER_PAGE_HEIGHT_PX = 1056;
const DEFAULT_CONTENT_HEIGHT_PX = 760;

export function DocumentPreviewPage({
  children,
  className = "",
  header,
  pageNumber,
}: {
  children: ReactNode;
  className?: string;
  header: ReactNode;
  pageNumber?: number;
}) {
  return (
    <article
      className={`light mx-auto break-inside-avoid print:break-before-page print:border-0 print:shadow-none h-[1056px] max-h-[1056px] w-[816px] max-w-[816px] overflow-hidden border border-slate-300 bg-white text-slate-900 shadow-xl shadow-slate-900/10 ${className}`}
      data-document-page={pageNumber}
      data-preview-page={pageNumber}
    >
      {header}
      {children}
    </article>
  );
}

export function AutoPaginatedDocumentFlow({
  contentClassName,
  contentProps,
  contentStyle,
  contentLayoutKey = "",
  header,
  items,
  pageKeyPrefix,
  pageClassName,
}: {
  contentClassName: string;
  contentProps?: AutoPaginatedContentProps;
  contentStyle?: CSSProperties;
  contentLayoutKey?: string;
  header: ReactNode;
  items: DocumentFlowItem[];
  pageKeyPrefix: string;
  /** Extra className applied to each DocumentPreviewPage article (e.g. borderless for caratula). */
  pageClassName?: string;
}) {
  const measurePageRef = useRef<HTMLDivElement | null>(null);
  const measureContentRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef(items);
  const itemLayoutSignature = items
    .map((item) => `${item.id}:${item.startOnNewPage ? "1" : "0"}`)
    .join("|");

  // Keep latest signature in a ref so measurement reads the CURRENT revision,
  // not a stale closure value from the first render.
  const itemLayoutSignatureRef = useRef(itemLayoutSignature);
  // Refs are synced after commit (layout phase, before any scheduled rAF
  // measurement can run) instead of during render.
  useLayoutEffect(() => {
    itemsRef.current = items;
    itemLayoutSignatureRef.current = itemLayoutSignature;
  }, [items, itemLayoutSignature]);

  const [availableHeight, setAvailableHeight] = useState(DEFAULT_CONTENT_HEIGHT_PX);
  // Pagination stores ONLY item IDs per page, not full DocumentFlowItem objects.
  // This ensures content always renders from the latest items, never stale ReactNodes.
  const [pagination, setPagination] = useState(() => ({
    itemLayoutSignature,
    pageItemIds: splitDocumentFlowItemIds(items),
  }));

  // Single-flight pagination scheduler — at most one measurement per animation frame
  const rafPendingRef = useRef(false);
  // Stable callbacks (empty deps): they only read refs and call state setters.
  const measureAndPaginate = useCallback(() => {
    const currentItems = itemsRef.current;
    const measurePage = measurePageRef.current;
    const measureContent = measureContentRef.current;
    if (!measurePage || !measureContent) return;

    const pageHeader = measurePage.querySelector<HTMLElement>("[data-document-preview-header]");
    const computedContentStyle = window.getComputedStyle(measureContent);
    const contentVerticalPadding =
      Number.parseFloat(computedContentStyle.paddingTop || "0") +
      Number.parseFloat(computedContentStyle.paddingBottom || "0");
    const nextAvailableHeight = Math.max(
      0,
      LETTER_PAGE_HEIGHT_PX - (pageHeader?.offsetHeight ?? 0) - contentVerticalPadding,
    );

    const elements = Array.from(
      measureContent.querySelectorAll<HTMLElement>("[data-document-flow-item-id]"),
    );

    // ID-based measurement: key by item identity, not DOM index
    const heightById = new Map<string, number>();
    const prevBottomByIndex: number[] = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const id = el.getAttribute("data-document-flow-item-id");
      if (!id) continue;
      const rect = el.getBoundingClientRect();
      const precedingGap =
        i > 0 ? Math.max(0, rect.top - prevBottomByIndex[i - 1]) : 0;
      heightById.set(id, rect.height + precedingGap);
      prevBottomByIndex[i] = rect.bottom;
    }

    // Measurement completeness: reject if any expected item is missing
    const expectedIds = currentItems.map((item) => item.id);
    const incomplete =
      expectedIds.length !== heightById.size ||
      expectedIds.some((id) => {
        const h = heightById.get(id);
        return h === undefined || !Number.isFinite(h) || h < 0;
      });
    if (incomplete) {
      return;
    }

    // Reconstruct measuredItems in canonical item order (by ID, not DOM order)
    const measuredItems = currentItems.map((item) => ({
      item,
      height: heightById.get(item.id)!,
    }));

    const nextPages = splitMeasuredDocumentFlowItems(measuredItems, nextAvailableHeight);
    setAvailableHeight((current) =>
      Math.abs(current - nextAvailableHeight) > 1 ? nextAvailableHeight : current,
    );
    setPagination((current) => {
      // Convert pages to ID-only arrays for comparison and storage
      const nextPageIds = nextPages.map((page) => page.map((item) => item.id));

      // Conservation invariant: paginated IDs must exactly equal current item IDs
      const flatPaginated = nextPageIds.flat();
      const canonicalIds = currentItems.map((item) => item.id);
      const conservationOk =
        flatPaginated.length === canonicalIds.length &&
        flatPaginated.every((id, i) => id === canonicalIds[i]);
      if (!conservationOk) {
        return current;
      }

      if (
        current.itemLayoutSignature === itemLayoutSignatureRef.current &&
        samePageIds(current.pageItemIds, nextPageIds)
      ) {
        return current;
      }
      return { itemLayoutSignature: itemLayoutSignatureRef.current, pageItemIds: nextPageIds };
    });
  }, []);

  const requestPagination = useCallback(() => {
    if (rafPendingRef.current) {
      return;
    }
    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      measureAndPaginate();
    });
  }, [measureAndPaginate]);

  // Content change: schedule one measurement after paint
  useEffect(() => {
    requestPagination();
  }, [itemLayoutSignature, contentLayoutKey, requestPagination]);

  // Window/container resize: schedule measurement
  useEffect(() => {
    const handleResize = () => requestPagination();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [requestPagination]);

  const contextValue = useMemo(() => ({ requestPagination }), [requestPagination]);

  const paginatedContentStyle = {
    ...contentStyle,
    "--document-content-height": `${availableHeight}px`,
    height: "var(--document-content-height)",
    overflow: "hidden",
  } as CSSProperties;

  const visiblePages = (() => {
    // Build item lookup Map for O(1) resolution (no silent .filter(Boolean))
    const itemById = new Map(items.map((item) => [item.id, item]));

    const resolvePageIds = (pageIds: string[][]): DocumentFlowItem[][] =>
      pageIds.map((ids) => {
        const resolved = ids
          .map((id) => {
            const item = itemById.get(id);
            return item;
          })
          .filter(Boolean) as DocumentFlowItem[];
        return resolved;
      });

    const sigMatch = pagination.itemLayoutSignature === itemLayoutSignature;
    const hasPages = pagination.pageItemIds.length > 0;
    if (sigMatch && hasPages) {
      const resolved = resolvePageIds(pagination.pageItemIds);
      return resolved;
    }
    // Stale signature: use height-unaware split as temporary layout.
    // Previous reconcileProvisionalPages used old page sizes which caused
    // overpacking when content changed. Simple split preserves all items
    // on minimal pages until measurement runs with correct heights.
    const provisional = splitDocumentFlowItemIds(items);
    const resolved = resolvePageIds(provisional);
    return resolved;
  })();

  // Report canonical page count upward to the viewer
  const reportPageCount = useReportPageCount();
  useEffect(() => {
    reportPageCount(visiblePages.length);
  }, [visiblePages.length, reportPageCount]);

  const pagesContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <LayoutInvalidationContext.Provider value={contextValue}>
      {createPortal(
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[-10000px] top-0 opacity-0 print:hidden"
          ref={measurePageRef}
        >
          <DocumentPreviewPage header={header} className="shadow-none" pageNumber={0}>
            <div {...contentProps} className={contentClassName} ref={measureContentRef} style={contentStyle} data-document-pagination-content="measurement">
              {items.map((item) => (
                <DocumentFlowItemFrame itemId={item.id} key={item.id}>
                  {item.node}
                </DocumentFlowItemFrame>
              ))}
            </div>
          </DocumentPreviewPage>
        </div>,
        document.body,
      )}

      <div className="space-y-6 print:space-y-0" ref={pagesContainerRef}>
        {visiblePages.map((pageItems, pageIndex) => (
          <DocumentPreviewPage header={header} key={`${pageKeyPrefix}-page-${pageIndex + 1}`} pageNumber={pageIndex + 1} className={pageClassName}>
            <div {...contentProps} className={contentClassName} style={paginatedContentStyle} data-document-pagination-content="visible">
              {pageItems.map((item) => (
                <DocumentFlowItemFrame itemId={item.id} key={item.id}>
                  {item.node}
                </DocumentFlowItemFrame>
              ))}
            </div>
          </DocumentPreviewPage>
        ))}
      </div>
    </LayoutInvalidationContext.Provider>
  );
}

function splitDocumentFlowItemIds(items: DocumentFlowItem[]): string[][] {
  const pages: string[][] = [];
  let currentPage: string[] = [];

  for (const item of items) {
    if (item.startOnNewPage && currentPage.length) {
      pages.push(currentPage);
      currentPage = [];
    }

    currentPage.push(item.id);
  }

  if (currentPage.length) pages.push(currentPage);

  return pages;
}

function samePageIds(left: string[][], right: string[][]): boolean {
  if (left.length !== right.length) return false;
  return left.every((leftPage, pageIndex) => {
    const rightPage = right[pageIndex];
    if (!rightPage || leftPage.length !== rightPage.length) return false;
    return leftPage.every((id, itemIndex) => id === rightPage[itemIndex]);
  });
}

/**
 * Reconcile previous measured page assignment against current items.
 *
 * Used as provisional layout when pagination signature is stale
 * (items changed but measurement hasn't run yet). Preserves the
 * previous multi-page structure instead of collapsing to 1 height-unaware page.
 *
 * Rules:
 *  - Keep only IDs that still exist in current items
 *  - Remove empty pages
 *  - Append new (unseen) items to the final page in document order
 *  - Result contains each current item exactly once, in document order
 *
 * Falls back to simple split when no previous measured state exists.
 */
export function reconcileProvisionalPages(
  previousPageItemIds: string[][],
  currentItems: DocumentFlowItem[],
): string[][] {
  if (previousPageItemIds.length === 0) {
    return splitDocumentFlowItemIds(currentItems);
  }

  const currentIds = new Set(currentItems.map((item) => item.id));

  // 1. Filter each previous page to only IDs that still exist, remove empty pages
  const filtered = previousPageItemIds
    .map((page) => page.filter((id) => currentIds.has(id)))
    .filter((page) => page.length > 0);

  if (filtered.length === 0) {
    // All previous items were removed — any remaining are new
    const newIds = currentItems.map((item) => item.id);
    return newIds.length > 0 ? [newIds] : [];
  }

  // 2. Collect all IDs present in filtered pages
  const seen = new Set<string>();
  for (const page of filtered) {
    for (const id of page) seen.add(id);
  }

  // 3. Find new items not in any previous page, in document order
  const newItems = currentItems.filter((item) => !seen.has(item.id));

  // 4. Build target page sizes: keep old sizes, append new items to final page
  const targetSizes = filtered.map((page) => page.length);
  if (newItems.length > 0) {
    targetSizes[targetSizes.length - 1] += newItems.length;
  }

  // 5. Distribute current items in document order using target page sizes
  const result: string[][] = [];
  let offset = 0;
  for (const size of targetSizes) {
    const page = currentItems.slice(offset, offset + size).map((item) => item.id);
    if (page.length > 0) result.push(page);
    offset += size;
  }

  // 6. Safety: if any current items weren't placed, append to final page
  if (offset < currentItems.length) {
    const remaining = currentItems.slice(offset).map((item) => item.id);
    if (result.length > 0) {
      result[result.length - 1] = [...result[result.length - 1], ...remaining];
    } else {
      result.push(remaining);
    }
  }

  // 7. Verify completeness — every current item must appear exactly once
  const resultIds = new Set(result.flat());
  if (resultIds.size !== currentItems.length) {
    return splitDocumentFlowItemIds(currentItems);
  }

  return result;
}

export function splitMeasuredDocumentFlowItems(
  measuredItems: Array<{ item: DocumentFlowItem; height: number }>,
  availableHeight: number,
) {
  const pages: DocumentFlowItem[][] = [];
  let currentPage: DocumentFlowItem[] = [];
  let currentHeight = 0;

  for (const measuredItem of measuredItems) {
    const { item, itemHeight } = { item: measuredItem.item, itemHeight: measuredItem.height };

    // Manual page break: always honor startOnNewPage
    if (item.startOnNewPage && currentPage.length) {
      pages.push(currentPage);
      currentPage = [];
      currentHeight = 0;
    }

    // Auto overflow: move ENTIRE item to next page when it doesn't fit.
    // A normal atomic item that fits on a fresh page must NEVER be split
    // across two physical Letter pages.
    if (currentPage.length && currentHeight + itemHeight > availableHeight) {
      pages.push(currentPage);
      currentPage = [];
      currentHeight = 0;
    }

    currentPage.push(item);
    // Use raw measured height — no Math.min clamp.
    // An oversized item (itemHeight > availableHeight) occupies its own page
    // and its overflow is clipped by the physical Letter page boundary.
    // Full fragmentation of oversized items is a future enhancement.
    currentHeight += itemHeight;
  }

  if (currentPage.length) pages.push(currentPage);

  return pages;
}
