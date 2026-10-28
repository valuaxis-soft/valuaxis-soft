"use client";

import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { ArchiveRestore, Check, ChevronLeft, ChevronRight, FileText, ListTree, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppSection } from "@/features/valuations/model";
import { cn } from "@/lib/utils";
import { sectionDisplayName } from "./model/section-numbering";
import { SectionDndContainer } from "./section-dnd-container";

export function ValuationNavigation({
  activeSectionId,
  enabledSections,
  iconMap,
  onAddSection,
  onRemoveSection,
  onRenameSection,
  onReorder,
  onRestoreSection,
  onSelectSection,
  readOnly,
  removedSections = [],
}: {
  activeSectionId: string;
  enabledSections: AppSection[];
  iconMap: Record<string, LucideIcon>;
  /** Adds a section of the appraiser's own at the end of the strip. */
  onAddSection?: () => void;
  /** Asks to delete a section (any but the required ones). */
  onRemoveSection?: (sectionId: string) => void;
  onRenameSection?: (sectionId: string, title: string) => void;
  onReorder: (nextSections: AppSection[]) => void;
  /** Brings back a registry section the appraiser deleted. */
  onRestoreSection?: (sectionId: string) => void;
  /** Opens a section from the list of all of them. */
  onSelectSection?: (sectionId: string) => void;
  readOnly: boolean;
  /** Registry sections the appraiser deleted: listed to be restored. */
  removedSections?: AppSection[];
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollSections = (direction: -1 | 1) => {
    scrollSectionContainer(scrollContainerRef.current, direction);
  };

  // The active tab is always in view, however it was chosen (list, undo, keyboard).
  useEffect(() => {
    revealSectionTab(scrollContainerRef.current, activeSectionId);
  }, [activeSectionId]);

  return (
    <nav
      className="mx-auto flex w-full min-w-0 max-w-[44rem] items-center gap-1 xl:flex-[1_1_28rem]"
      aria-label="Secciones del avalúo"
    >
      {onSelectSection ? (
        <SectionListMenu
          activeSectionId={activeSectionId}
          iconMap={iconMap}
          onRestoreSection={readOnly ? undefined : onRestoreSection}
          onSelectSection={onSelectSection}
          removedSections={removedSections}
          sections={enabledSections}
        />
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="hidden sm:inline-flex max-lg:size-10"
        aria-label="Desplazar secciones a la izquierda"
        onClick={() => scrollSections(-1)}
      >
        <ChevronLeft />
      </Button>
      <div
        ref={scrollContainerRef}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-color:var(--muted-foreground)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent"
      >
        <SectionDndContainer
          sections={enabledSections}
          activeSectionId={activeSectionId}
          iconMap={iconMap}
          onReorder={onReorder}
          onRename={onRenameSection}
          onRemove={onRemoveSection}
          readOnly={readOnly}
        />
        {onAddSection ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 rounded-full max-lg:min-h-10"
            title="Agregar una sección propia al final"
            disabled={readOnly}
            onClick={onAddSection}
          >
            <Plus data-icon="inline-start" />
            Sección
          </Button>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="hidden sm:inline-flex max-lg:size-10"
        aria-label="Desplazar secciones a la derecha"
        onClick={() => scrollSections(1)}
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}

/**
 * Every section in one list, to jump to any of them without scrolling the
 * strip; the deleted ones follow, to be restored.
 */
function SectionListMenu({
  activeSectionId,
  iconMap,
  onRestoreSection,
  onSelectSection,
  removedSections,
  sections,
}: {
  activeSectionId: string;
  iconMap: Record<string, LucideIcon>;
  onRestoreSection?: (sectionId: string) => void;
  onSelectSection: (sectionId: string) => void;
  removedSections: AppSection[];
  sections: AppSection[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="shrink-0 max-lg:size-10"
            aria-label="Ir a una sección"
            title="Ir a una sección"
          >
            <ListTree />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-[70vh] w-72 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Secciones</DropdownMenuLabel>
          {sections.map((section) => {
            const Icon = iconMap[section.id] ?? FileText;
            const active = section.id === activeSectionId;
            return (
              <DropdownMenuItem
                key={section.id}
                className={cn("min-h-9", active && "font-semibold")}
                aria-current={active ? "page" : undefined}
                onClick={() => onSelectSection(section.id)}
              >
                <Icon />
                <span className="min-w-0 flex-1 truncate">{sectionDisplayName(section)}</span>
                {active ? <Check className="ml-auto" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        {removedSections.length && onRestoreSection ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Eliminadas</DropdownMenuLabel>
              {removedSections.map((section) => (
                <DropdownMenuItem key={section.id} className="min-h-9" onClick={() => onRestoreSection(section.id)}>
                  <ArchiveRestore />
                  <span className="min-w-0 flex-1 truncate">Restaurar {section.title}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ScrollableStrip = Pick<HTMLDivElement, "scrollBy" | "clientWidth" | "getBoundingClientRect" | "querySelectorAll">;

/** A few pixels so the tab brought in does not touch the arrow. */
const TAB_MARGIN_PX = 8;

/**
 * One arrow click brings in the next tab hidden on that side, and only it: the
 * strip used to jump a fixed 280 px, and the tabs in between went by unseen.
 * Past the last tab it moves half the strip, to show the "Sección" button.
 */
export function scrollSectionContainer(container: ScrollableStrip | null, direction: -1 | 1) {
  if (!container) return;
  const box = container.getBoundingClientRect();
  const tabs = [...container.querySelectorAll<HTMLElement>("[data-section-tab]")].map((tab) => tab.getBoundingClientRect());
  const hidden = direction > 0
    ? tabs.find((tab) => tab.right > box.right + 1)
    : tabs.findLast((tab) => tab.left < box.left - 1);
  const left = hidden
    ? direction > 0 ? hidden.right - box.right + TAB_MARGIN_PX : hidden.left - box.left - TAB_MARGIN_PX
    : direction * Math.round(container.clientWidth / 2);
  container.scrollBy({ left, behavior: "smooth" });
}

/** Scrolls the strip sideways (only sideways: the page stays where it is) until the tab is in view. */
function revealSectionTab(container: ScrollableStrip | null, sectionId: string) {
  if (!container) return;
  const tab = [...container.querySelectorAll<HTMLElement>("[data-section-tab]")].find((item) => item.dataset.sectionTab === sectionId);
  if (!tab) return;
  const box = container.getBoundingClientRect();
  const rect = tab.getBoundingClientRect();
  if (rect.left < box.left) container.scrollBy({ left: rect.left - box.left - TAB_MARGIN_PX, behavior: "smooth" });
  else if (rect.right > box.right) container.scrollBy({ left: rect.right - box.right + TAB_MARGIN_PX, behavior: "smooth" });
}
