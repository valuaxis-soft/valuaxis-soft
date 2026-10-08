import { useMemo, type ReactNode } from "react";

import type { AppSection } from "../model";
import { isTerrenoMainBlock } from "../sections/terreno";
import { useDocumentTheme } from "@/features/valuations/components/document-theme";
import { documentBlockFlowItems } from "./document-block-renderer";
import {
  AutoPaginatedDocumentFlow,
  computeDocumentLayoutKey,
} from "./document-preview-page";
import { terrenoApartadoHead } from "./terreno-preview-modules";

export function TerrenoPreview({ header, section }: { header: ReactNode; section: AppSection }) {
  const theme = useDocumentTheme();
  // The main block prints like any other; only "Medidas y colindancias" has a format of its own.
  const items = section.blocks
    .filter((block) => block.enabled)
    .flatMap((block) => documentBlockFlowItems(block, {
      renderTitleBar: true,
      renderApartadoHead: isTerrenoMainBlock(block) ? terrenoApartadoHead : undefined,
    }));

  const contentLayoutKey = useMemo(() => computeDocumentLayoutKey(section), [section]);

  return (
    <AutoPaginatedDocumentFlow
      contentClassName={`${theme.sectionGap} ${theme.pagePadding}`}
      contentLayoutKey={contentLayoutKey}
      header={header}
      items={items}
      pageKeyPrefix="terreno"
    />
  );
}
