import { useEffect, useEffectEvent, useState } from "react";

import type { AppSection } from "@/features/valuations/model";

import { followedBlockId, revealBlockInPreview } from "../model/preview-follow";

/**
 * Keeps the preview on what the appraiser is editing: the block he clicks or
 * types in, or the market he chooses in the calculation panel (V6.2-10). When
 * the preview shows a section with the ones it shares pages with, it opens
 * where that section starts (V6.1-09). Returns the block followed, so the
 * preview window follows it too.
 */
export function usePreviewFollow({
  activeSection,
  previewSectionId,
  sectionStartBlockId,
}: {
  /** The section the editor shows: the concepts and tables clicked are looked up in its blocks. */
  activeSection: AppSection;
  previewSectionId: string;
  /** The first block of the shown section when it prints after another on the same pages; null: the preview opens at its top. */
  sectionStartBlockId: string | null;
}) {
  // The block followed, with the section it was chosen in: another section starts over.
  const [followed, setFollowed] = useState<{ sectionId: string; blockId: string } | null>(null);

  const activeSectionId = activeSection.id;
  const follow = useEffectEvent((target: Element) => {
    const blockId = followedBlockId(target.isConnected ? target : null, activeSection);
    if (!blockId) return;
    setFollowed((current) => (current?.sectionId === activeSectionId && current.blockId === blockId ? current : { sectionId: activeSectionId, blockId }));
  });
  useEffect(() => {
    const onEditorEvent = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest("#valuation-form")) return;
      // After React applied the click: a market chosen in the panel is read once the panel shows it.
      window.setTimeout(() => follow(target), 0);
    };
    document.addEventListener("click", onEditorEvent, true);
    document.addEventListener("focusin", onEditorEvent, true);
    return () => {
      document.removeEventListener("click", onEditorEvent, true);
      document.removeEventListener("focusin", onEditorEvent, true);
    };
  }, []);

  const followedBlock = followed && followed.sectionId === activeSectionId && previewSectionId === activeSectionId ? followed.blockId : null;
  useEffect(() => {
    if (!followedBlock) return;
    return revealBlockInPreview(followedBlock);
  }, [followedBlock]);

  useEffect(() => {
    if (!sectionStartBlockId) return;
    return revealBlockInPreview(sectionStartBlockId, { behavior: "auto" });
  }, [previewSectionId, sectionStartBlockId]);

  // The preview window («2 pantallas») follows the same block.
  return followedBlock;
}
