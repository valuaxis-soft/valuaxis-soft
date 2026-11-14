"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { RectangleHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PageOrientation } from "@/features/valuations/services/document-structure";
import { BINDING_MARGIN_EXTRA_PX } from "@/features/valuations/services/page-presentation";
import type { FormulaResult, TableV2 } from "@/features/valuations/services/table";
import { canvasTextMeasure, pageContentWidth, planTablePrintFit, printFitColumns } from "@/features/valuations/services/table-print-fit";
import { useNumberPresentation } from "../number-presentation-context";
import { usePagePresentation } from "../page-presentation-context";

/** The page of the block a table is in: upright or on its side, and how to lay it on its side. */
type BlockPageOrientation = { value: PageOrientation; onChange: (value: PageOrientation) => void };

const BlockPageOrientationContext = createContext<BlockPageOrientation | null>(null);

/** Gives the tables of a block its page orientation, so a table too wide for the page can offer «Poner en horizontal». */
export function BlockPageOrientationProvider({ value, children }: { value?: BlockPageOrientation; children?: ReactNode }) {
  return <BlockPageOrientationContext.Provider value={value ?? null}>{children}</BlockPageOrientationContext.Provider>;
}

const subscribeNever = () => () => {};
/** Measured with the letter only the browser knows: the server renders no notice, and hydration matches. */
const useIsClient = () => useSyncExternalStore(subscribeNever, () => true, () => false);

/** The document's letter, to measure the table as it prints; empty outside the browser. */
function documentFontFamily() {
  if (typeof document === "undefined") return "";
  const geist = window.getComputedStyle(document.documentElement).getPropertyValue("--font-geist-sans").trim();
  return geist ? `${geist}, Arial, sans-serif` : "Arial, sans-serif";
}

/**
 * Under the toolbar of a table: when the table does not fit the width of the
 * page even at the smallest letter (table-print-fit.ts), a discreet notice
 * suggests laying its block on its side or hiding columns, with a button for
 * the first. Nothing while it fits.
 */
export function TablePageFitNotice({ table, formulaResults, readOnly }: { table: TableV2; formulaResults: Map<string, FormulaResult>; readOnly: boolean }) {
  const orientation = useContext(BlockPageOrientationContext);
  const presentation = useNumberPresentation();
  const { bindingMargin } = usePagePresentation();
  const landscape = orientation?.value === "landscape";
  const isClient = useIsClient();
  const fits = useMemo(() => {
    if (!isClient || table.schema?.plain) return true;
    const width = pageContentWidth(landscape ? "landscape" : "portrait", BINDING_MARGIN_EXTRA_PX[bindingMargin]);
    const fit = planTablePrintFit(printFitColumns(table, formulaResults, presentation), width, { measure: canvasTextMeasure(documentFontFamily()) });
    return fit.kind === "natural" || fit.fits;
  }, [bindingMargin, formulaResults, isClient, landscape, presentation, table]);
  if (fits) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-highlight/45 bg-highlight/15 px-3 py-1.5 text-xs text-foreground" role="status" data-table-page-fit={landscape ? "landscape" : "portrait"}>
      <span className="min-w-0 flex-1">
        {landscape
          ? "Esta tabla no cabe ni en página horizontal: oculta columnas o acorta sus encabezados."
          : "Esta tabla no cabe en vertical: ponla en página horizontal u oculta columnas."}
      </span>
      {!landscape && orientation ? (
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 bg-background text-xs" disabled={readOnly} onClick={() => orientation.onChange("landscape")}>
          <RectangleHorizontal aria-hidden="true" />
          Poner en horizontal
        </Button>
      ) : null}
    </div>
  );
}
