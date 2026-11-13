"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArchiveRestore, Check, ChevronLeft, ChevronRight, FileText, GripVertical, ListTree, Plus } from "lucide-react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AppSection } from "@/features/valuations/model";
import type { SectionDocumentRole } from "@/features/valuations/services/document-structure";
import { cn } from "@/lib/utils";
import { sectionDisplayName } from "./model/section-numbering";
import { isPinnedSection, SectionDndContainer } from "./section-dnd-container";

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
  /** Adds a section of the appraiser's own: a chapter before the conclusion, an annex at the end. */
  onAddSection?: (role: SectionDocumentRole) => void;
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
  const activeSectionRef = useRef(activeSectionId);
  // Whether there are tabs hidden on each side: the arrows are enabled only then.
  const [overflow, setOverflow] = useState<StripOverflow>(NO_OVERFLOW);

  const scrollSections = (direction: -1 | 1) => {
    scrollSectionContainer(scrollContainerRef.current, direction);
  };

  // The active tab is always in view, however it was chosen (list, undo, keyboard).
  useEffect(() => {
    activeSectionRef.current = activeSectionId;
    revealSectionTab(scrollContainerRef.current, activeSectionId);
  }, [activeSectionId]);

  // The strip measured again whenever it or its tabs change size (the browser's
  // zoom, the window, a section renamed or added) and when it scrolls; after a
  // change of size the active tab is brought back into view.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const update = () => setOverflow((current) => {
      const next = stripOverflow(container);
      return next.start === current.start && next.end === current.end ? current : next;
    });
    const observer = new ResizeObserver(() => {
      update();
      revealSectionTab(container, activeSectionRef.current);
    });
    observer.observe(container);
    for (const child of container.children) observer.observe(child);
    container.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", update);
    };
  }, [enabledSections.length]);

  return (
    <nav
      className="flex w-full min-w-0 items-center gap-1 lg:items-start"
      aria-label="Secciones del avalúo"
    >
      {onSelectSection ? (
        <SectionListMenu
          activeSectionId={activeSectionId}
          iconMap={iconMap}
          onAddSection={onAddSection}
          onReorder={onReorder}
          onRestoreSection={readOnly ? undefined : onRestoreSection}
          onSelectSection={onSelectSection}
          readOnly={readOnly}
          removedSections={removedSections}
          sections={enabledSections}
        />
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 pointer-coarse:hidden lg:hidden"
        aria-label="Desplazar secciones a la izquierda"
        disabled={!overflow.start}
        onClick={() => scrollSections(-1)}
      >
        <ChevronLeft />
      </Button>
      <div
        ref={scrollContainerRef}
        data-section-strip=""
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain pb-1 lg:items-start lg:overflow-visible lg:pb-0 [scrollbar-color:var(--muted-foreground)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent"
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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 rounded-full pointer-coarse:min-h-10"
                  title="Agregar una sección propia: capítulo o anexo"
                  disabled={readOnly}
                >
                  <Plus data-icon="inline-start" />
                  Sección
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Agregar sección</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onAddSection("chapter")}>
                  <span className="grid">
                    <span className="font-medium">Capítulo</span>
                    <span className="text-xs text-muted-foreground">Con número romano, antes de la conclusión.</span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddSection("annex")}>
                  <span className="grid">
                    <span className="font-medium">Anexo</span>
                    <span className="text-xs text-muted-foreground">Se imprime «ANEXO n», al final del dictamen.</span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 pointer-coarse:hidden lg:hidden"
        aria-label="Desplazar secciones a la derecha"
        disabled={!overflow.end}
        onClick={() => scrollSections(1)}
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}

/**
 * Every section in one list, to jump to any of them without scrolling the
 * strip, to reorder them by their handle, or to add one; the deleted ones
 * follow, to be restored.
 */
function SectionListMenu({
  activeSectionId,
  iconMap,
  onAddSection,
  onReorder,
  onRestoreSection,
  onSelectSection,
  readOnly,
  removedSections,
  sections,
}: {
  activeSectionId: string;
  iconMap: Record<string, LucideIcon>;
  onAddSection?: (role: SectionDocumentRole) => void;
  onReorder: (nextSections: AppSection[]) => void;
  onRestoreSection?: (sectionId: string) => void;
  onSelectSection: (sectionId: string) => void;
  readOnly: boolean;
  removedSections: AppSection[];
  sections: AppSection[];
}) {
  const [open, setOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = sections.findIndex((section) => section.id === String(active.id));
    const to = sections.findIndex((section) => section.id === String(over.id));
    if (from < 0 || to < 0 || isPinnedSection(String(active.id), from) || isPinnedSection(String(over.id), to)) return;
    onReorder(arrayMove(sections, from, to));
  };
  const select = (sectionId: string) => {
    onSelectSection(sectionId);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="shrink-0 pointer-coarse:size-10"
            aria-label="Ir a una sección"
            title="Secciones: ir a una, ordenarlas o agregar"
          >
            <ListTree />
          </Button>
        }
      />
      <PopoverContent align="start" className="max-h-[70vh] w-80 overflow-y-auto p-1" data-section-list>
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Secciones{readOnly ? "" : " · arrastra el asa para ordenarlas"}</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
            <ul className="grid gap-0.5" aria-label="Secciones del avalúo">
              {sections.map((section, index) => (
                <SectionListRow
                  key={section.id}
                  section={section}
                  icon={iconMap[section.id] ?? FileText}
                  active={section.id === activeSectionId}
                  draggable={!readOnly && !isPinnedSection(section.id, index)}
                  onSelect={() => select(section.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {onAddSection && !readOnly ? (
          <div className="mt-1 grid gap-0.5 border-t pt-1">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Agregar sección</p>
            <Button type="button" variant="ghost" size="sm" className="h-auto justify-start py-1.5" onClick={() => { onAddSection("chapter"); setOpen(false); }}>
              <Plus data-icon="inline-start" />
              <span className="grid text-left">
                <span className="font-medium">Capítulo</span>
                <span className="text-xs font-normal text-muted-foreground">Con número romano, antes de la conclusión.</span>
              </span>
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-auto justify-start py-1.5" onClick={() => { onAddSection("annex"); setOpen(false); }}>
              <Plus data-icon="inline-start" />
              <span className="grid text-left">
                <span className="font-medium">Anexo</span>
                <span className="text-xs font-normal text-muted-foreground">Se imprime «ANEXO n», al final del dictamen.</span>
              </span>
            </Button>
          </div>
        ) : null}
        {removedSections.length && onRestoreSection ? (
          <div className="mt-1 grid gap-0.5 border-t pt-1">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Eliminadas</p>
            {removedSections.map((section) => (
              <Button key={section.id} type="button" variant="ghost" size="sm" className="justify-start" onClick={() => { onRestoreSection(section.id); setOpen(false); }}>
                <ArchiveRestore data-icon="inline-start" />
                <span className="min-w-0 flex-1 truncate text-left">Restaurar {section.title}</span>
              </Button>
            ))}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** One section of the list: its handle to drag it, and its name to open it. */
function SectionListRow({ section, icon: Icon, active, draggable, onSelect }: {
  section: AppSection;
  icon: LucideIcon;
  active: boolean;
  draggable: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id, disabled: !draggable });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-1 rounded-md", isDragging && "z-10 bg-accent shadow-sm")}
      data-section-row={section.id}
    >
      <button
        type="button"
        className={cn("inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-accent active:cursor-grabbing", !draggable && "invisible")}
        aria-label={`Reordenar ${sectionDisplayName(section)}`}
        title="Arrastrar para ordenar"
        disabled={!draggable}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <button
        type="button"
        className={cn("flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent", active && "font-semibold")}
        aria-current={active ? "page" : undefined}
        onClick={onSelect}
      >
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{sectionDisplayName(section)}</span>
        {active ? <Check className="ml-auto size-4" /> : null}
      </button>
    </li>
  );
}

type ScrollableStrip = Pick<HTMLDivElement, "scrollBy" | "clientWidth" | "getBoundingClientRect" | "querySelectorAll">;

type StripOverflow = { start: boolean; end: boolean };
const NO_OVERFLOW: StripOverflow = { start: false, end: false };

/** Whether the strip hides tabs before or after what it shows (a pixel of slack for fractional zoom). */
export function stripOverflow(container: Pick<HTMLDivElement, "scrollLeft" | "scrollWidth" | "clientWidth">): StripOverflow {
  const max = container.scrollWidth - container.clientWidth;
  return { start: container.scrollLeft > 1, end: container.scrollLeft < max - 1 };
}

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
