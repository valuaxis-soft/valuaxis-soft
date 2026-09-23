"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ScanLine,
  StretchHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PaginationReporterProvider } from "./document-preview-page";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ZOOM_MIN = 25;
const ZOOM_MAX = 300;
const ZOOM_STEP = 10;
const ZOOM_DEFAULT = 100;

/* ------------------------------------------------------------------ */
/*  Viewer context — exposes page count to children                     */
/* ------------------------------------------------------------------ */

type PreviewViewerContextValue = {
  pageCount: number;
  currentPage: number;
  zoom: number;
};

const PreviewViewerContext = createContext<PreviewViewerContextValue>({
  pageCount: 1,
  currentPage: 1,
  zoom: ZOOM_DEFAULT,
});

/* ------------------------------------------------------------------ */
/*  PreviewViewer — the main shell                                     */
/* ------------------------------------------------------------------ */

export function PreviewViewer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);

  /* --- viewer-only state --- */
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [fitMode, setFitMode] = useState<"custom" | "fit-page" | "fit-width">("custom");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [jumpValue, setJumpValue] = useState("1");

  /* --- canonical page count flows upward from AutoPaginatedDocumentFlow --- */
  const handleReportPageCount = useCallback((count: number) => {
    setPageCount((prev) => (prev !== count ? count : prev));
  }, []);

  /* --- measure viewport for fit modes --- */
  const viewportRef = useRef<HTMLDivElement>(null);

  const computeFitWidth = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return ZOOM_DEFAULT;
    const availableWidth = vp.clientWidth - 32; // padding
    const pageWidth = 816;
    return Math.round((availableWidth / pageWidth) * 100);
  }, []);

  const computeFitPage = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return ZOOM_DEFAULT;
    const availableWidth = vp.clientWidth - 32;
    const availableHeight = vp.clientHeight - 32;
    const pageWidth = 816;
    const pageHeight = 1056;
    const scaleX = availableWidth / pageWidth;
    const scaleY = availableHeight / pageHeight;
    return Math.round(Math.min(scaleX, scaleY) * 100);
  }, []);

  /* --- apply fit mode --- */
  useEffect(() => {
    if (fitMode === "fit-width") {
      setZoom(computeFitWidth());
    } else if (fitMode === "fit-page") {
      setZoom(computeFitPage());
    }
  }, [fitMode, computeFitWidth, computeFitPage]);

  /* --- current page detection via scroll + rAF --- */
  useEffect(() => {
    const scrollEl = scrollRef.current;
    const container = pagesContainerRef.current;
    if (!scrollEl || !container) return;

    let rafId = 0;
    const computeCurrentPage = () => {
      // Query visible pages ONLY — exclude hidden measurement page (pageNumber=0)
      const allPageEls = Array.from(container.querySelectorAll<HTMLElement>("[data-preview-page]"));
      const pageEls = allPageEls.filter((el) => {
        const pageNum = el.getAttribute("data-document-page");
        return pageNum !== null && parseInt(pageNum, 10) > 0;
      });
      const totalPages = pageEls.length;
      if (!totalPages) return;

      // Use actual rendered geometry: find the page whose center is closest
      // to the viewport center. Works correctly at any zoom level because
      // getBoundingClientRect() returns zoom-aware screen coordinates.
      const vpRect = scrollEl.getBoundingClientRect();
      const vpCenterY = vpRect.top + vpRect.height / 2;

      let bestIndex = 0;
      let bestDist = Infinity;

      for (let i = 0; i < pageEls.length; i++) {
        const elRect = pageEls[i].getBoundingClientRect();
        const elCenterY = elRect.top + elRect.height / 2;
        const dist = Math.abs(elCenterY - vpCenterY);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
        }
      }

      const next = bestIndex + 1; // 1-indexed
      setCurrentPage((prev) => (prev !== next ? next : prev));
    };

    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(computeCurrentPage);
    };

    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    // initial computation
    computeCurrentPage();

    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [pageCount]);

  /* --- clamp current page when pages decrease --- */
  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, pageCount));
    setJumpValue((prev) => {
      const num = parseInt(prev, 10);
      return isNaN(num) || num > pageCount ? String(Math.min(num || 1, pageCount)) : prev;
    });
  }, [pageCount]);

  /* --- zoom controls --- */
  const zoomIn = useCallback(() => {
    setFitMode("custom");
    setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX));
  }, []);

  const zoomOut = useCallback(() => {
    setFitMode("custom");
    setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN));
  }, []);

  const fitWidth = useCallback(() => setFitMode("fit-width"), []);
  const fitPage = useCallback(() => setFitMode("fit-page"), []);

  /* --- page navigation --- */
  const scrollToPage = useCallback(
    (pageNum: number) => {
      const container = scrollRef.current;
      if (!container) return;
      const pageEl = container.querySelector<HTMLElement>(
        `[data-preview-page="${pageNum}"]`,
      );
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
        setCurrentPage(pageNum);
      }
    },
    [],
  );

  const goToFirst = useCallback(() => scrollToPage(1), [scrollToPage]);
  const goToLast = useCallback(() => scrollToPage(pageCount), [scrollToPage, pageCount]);
  const goToPrev = useCallback(
    () => scrollToPage(Math.max(1, currentPage - 1)),
    [scrollToPage, currentPage],
  );
  const goToNext = useCallback(
    () => scrollToPage(Math.min(pageCount, currentPage + 1)),
    [scrollToPage, currentPage, pageCount],
  );

  const handleJumpSubmit = useCallback(() => {
    const num = parseInt(jumpValue, 10);
    if (isNaN(num)) {
      setJumpValue(String(currentPage));
      return;
    }
    const clamped = Math.max(1, Math.min(pageCount, num));
    setJumpValue(String(clamped));
    scrollToPage(clamped);
  }, [jumpValue, currentPage, pageCount, scrollToPage]);

  /* --- keyboard shortcuts --- */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Plus/Minus for zoom
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        zoomIn();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        zoomOut();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        setFitMode("custom");
        setZoom(ZOOM_DEFAULT);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut]);

  /* --- sync jump input with current page --- */
  useEffect(() => {
    setJumpValue(String(currentPage));
  }, [currentPage]);

  const contextValue = useMemo(
    () => ({ pageCount, currentPage, zoom }),
    [pageCount, currentPage, zoom],
  );

  return (
    <PreviewViewerContext.Provider value={contextValue}>
      <div className={cn("flex h-full flex-col overflow-hidden", className)}>
        {/* ── Toolbar ── */}
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-background/95 px-3 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          {/* Zoom controls */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={zoomOut}
            aria-label="Alejar"
            title="Alejar (Ctrl+-)"
            disabled={zoom <= ZOOM_MIN}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-[3.5rem] text-center text-xs font-medium tabular-nums text-muted-foreground">
            {zoom}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={zoomIn}
            aria-label="Acercar"
            title="Acercar (Ctrl++)"
            disabled={zoom >= ZOOM_MAX}
          >
            <Plus className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* Fit modes */}
          <Button
            variant={fitMode === "fit-page" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={fitPage}
            aria-label="Ajustar a página"
            title="Ajustar a página"
          >
            <ScanLine className="h-4 w-4" />
          </Button>
          <Button
            variant={fitMode === "fit-width" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={fitWidth}
            aria-label="Ajustar al ancho"
            title="Ajustar al ancho"
          >
            <StretchHorizontal className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* Page navigation */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goToFirst}
            aria-label="Primera página"
            title="Primera página"
            disabled={currentPage <= 1}
          >
            <ChevronFirst className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goToPrev}
            aria-label="Página anterior"
            title="Página anterior"
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Pág</span>
            <Input
              type="text"
              inputMode="numeric"
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              onBlur={handleJumpSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJumpSubmit();
              }}
              className="h-6 w-10 rounded border px-1 text-center text-xs"
              aria-label="Número de página"
            />
            <span className="text-xs text-muted-foreground">de {pageCount}</span>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goToNext}
            aria-label="Página siguiente"
            title="Página siguiente"
            disabled={currentPage >= pageCount}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goToLast}
            aria-label="Última página"
            title="Última página"
            disabled={currentPage >= pageCount}
          >
            <ChevronLast className="h-4 w-4" />
          </Button>
        </div>

        {/* ── Scrollable page container ── */}
        <div
          ref={viewportRef}
          className="relative min-h-0 flex-1 overflow-hidden"
        >
          <div
            ref={scrollRef}
            className="h-full overflow-auto"
          >
            <div
              ref={pagesContainerRef}
              className="flex flex-col items-center gap-6 py-6"
              style={{ zoom: `${zoom}%` }}
            >
              <PaginationReporterProvider onReportPageCount={handleReportPageCount}>
                {children}
              </PaginationReporterProvider>
            </div>
          </div>
        </div>
      </div>
    </PreviewViewerContext.Provider>
  );
}
