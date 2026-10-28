import { useMemo, type ReactNode } from "react";
import type { AppSection } from "../model";
import { useDocumentTheme } from "@/features/valuations/components/document-theme";
import { documentBlockFlowItems } from "./document-block-renderer";
import {
  AutoPaginatedDocumentFlow,
  computeDocumentLayoutKey,
  DocumentPreviewPage,
  type DocumentFlowItem,
} from "./document-preview-page";

const EMPTY_VALUE = "No se proporcionó";

/** The printed items of Datos generales. */
export function datosFlowItems(section: AppSection): DocumentFlowItem[] {
  return section.blocks
    .filter((block) => block.enabled)
    .flatMap((block) => documentBlockFlowItems(block, { renderTitleBar: true }));
}

export function DatosPreview({ header, section }: { header: ReactNode; section: AppSection }) {
  const theme = useDocumentTheme();
  const visibleBlocks = section.blocks.filter((block) => block.enabled);
  const items = datosFlowItems(section);
  const contentLayoutKey = useMemo(() => computeDocumentLayoutKey(section), [section]);

  if (!visibleBlocks.length) {
    return (
      <DocumentPreviewPage header={header} pageNumber={1}>
        <div className={theme.pagePadding}>
          <p className="py-8 text-center text-[10px] italic text-slate-400">{EMPTY_VALUE}</p>
        </div>
      </DocumentPreviewPage>
    );
  }

  return (
    <AutoPaginatedDocumentFlow
      contentClassName={`${theme.sectionGap} ${theme.pagePadding}`}
      contentLayoutKey={contentLayoutKey}
      header={header}
      items={items}
      pageKeyPrefix="datos"
    />
  );
}
