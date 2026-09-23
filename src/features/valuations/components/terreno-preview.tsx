import { useMemo, type ReactNode } from "react";

import type { AppSection } from "../model";
import { isTerrenoMainBlock } from "../sections/terreno";
import { useDocumentTheme } from "@/features/valuations/components/document-theme";
import { documentBlockFlowItems } from "./document-block-renderer";
import {
  AutoPaginatedDocumentFlow,
  computeDocumentLayoutKey,
} from "./document-preview-page";
import { getPreviewFixedModule } from "./preview-fixed-module-registry";

// Resolved once at module scope so the component identity is stable across renders.
const TerrainRenderer = getPreviewFixedModule("terreno-main");

export function TerrenoPreview({ header, section }: { header: ReactNode; section: AppSection }) {
  const theme = useDocumentTheme();
  const mainBlock = section.blocks.find(
    (block) => block.enabled && isTerrenoMainBlock(block),
  );

  const additionalBlocks = section.blocks.filter(
    (block) => block.enabled && !isTerrenoMainBlock(block),
  );

  const items = [];

  if (mainBlock && TerrainRenderer) {
    items.push({
      id: "terreno-main",
      node: <TerrainRenderer block={mainBlock} />,
    });
  }

  for (const block of additionalBlocks) {
    items.push(...documentBlockFlowItems(block, { renderTitleBar: true }));
  }

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
