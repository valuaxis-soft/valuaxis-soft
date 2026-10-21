"use client";

import { useCallback, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FileText } from "lucide-react";
import type { AppSection } from "../../model";
import { moveSection } from "../../services/section-order-operations";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { SortableSectionTab } from "../workspace/sortable-section-tab";
import { sectionDisplayName } from "./model/section-numbering";
import { TabsList } from "@/components/ui/tabs";

/* ------------------------------------------------------------------ */
/*  Component props                                                   */
/* ------------------------------------------------------------------ */

export type SectionDndContainerProps = {
  /** The AppSections to render and reorder. */
  sections: AppSection[];
  /** ID of the currently active section. */
  activeSectionId: string;
  /** Icon map for each section. */
  iconMap: Record<string, LucideIcon>;
  /** Called when reorder produces a new Section array. */
  onReorder: (nextSections: AppSection[]) => void;
  /** Called with the new title when the appraiser renames the active tab. */
  onRename?: (sectionId: string, title: string) => void;
  /** Whether the tabs are read-only (disables dragging). */
  readOnly: boolean;
};

/* ------------------------------------------------------------------ */
/*  Sensors and accessibility                                         */
/* ------------------------------------------------------------------ */

/**
 * Activation rules for the section tabs:
 * - Mouse: drag after moving 8 px, so a click still selects the tab.
 * - Touch: long press (250 ms, 5 px tolerance), so a tap selects the tab and a
 *   swipe scrolls the tab strip.
 * - Keyboard: Space picks up / drops and the arrows move the tab. Enter is left
 *   to the tab itself so it keeps opening the section.
 */
export const SECTION_DRAG_ACTIVATION = {
  mouse: { distance: 8 },
  touch: { delay: 250, tolerance: 5 },
  keyboardCodes: {
    start: ["Space"],
    cancel: ["Escape"],
    end: ["Space", "Enter", "Tab"],
  },
};

/**
 * The carátula is the cover: it always opens the document, so its tab neither
 * moves nor takes another tab before it. A short swipe on it used to pick it
 * up and drop it wherever the pointer was let go, the cover going to the
 * middle of the document (observations of 20 Oct 2026, "la carátula se movió raro").
 * A carátula saved somewhere else still moves, so it can be put back first.
 */
const PINNED_SECTION_ID = "caratula";

export const isPinnedSection = (sectionId: string, index: number) => sectionId === PINNED_SECTION_ID && index === 0;

/**
 * Where a dragged tab lands: the tab under the pointer, so letting go away
 * from the strip (over the preview, the form) leaves the order as it was. The
 * keyboard has no pointer and keeps the nearest tab.
 */
export const sectionCollisionDetection: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

/**
 * The strip scrolls while a tab is dragged only with the pointer at its very
 * ends, and slowly: with the defaults (a fifth of its width on each side, ten
 * times faster) a tab dragged near the edge sent the strip racing to the last
 * tab and the tab with it.
 */
const SECTION_AUTO_SCROLL = { threshold: { x: 0.06, y: 0 }, acceleration: 1 };

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Para reordenar la sección, pulsa la barra espaciadora, muévela con las flechas y vuelve a pulsar la barra espaciadora para soltarla. Escape cancela.",
};

function sectionAnnouncements(sections: AppSection[]): Announcements {
  const name = (id: string | number) => {
    const section = sections.find((item) => item.id === String(id));
    return section ? sectionDisplayName(section) : String(id);
  };
  const position = (id: string | number) =>
    sections.findIndex((item) => item.id === String(id)) + 1;

  return {
    onDragStart: ({ active }) => `Sección ${name(active.id)} seleccionada para mover.`,
    onDragOver: ({ active, over }) =>
      over ? `Sección ${name(active.id)} sobre la posición ${position(over.id)} de ${sections.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Sección ${name(active.id)} colocada en la posición ${position(over.id)} de ${sections.length}.`
        : `Sección ${name(active.id)} soltada.`,
    onDragCancel: ({ active }) => `Movimiento de la sección ${name(active.id)} cancelado.`,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * DnD container for horizontal reordering of Section tabs.
 *
 * Owns its own DndContext — independent from:
 * - Block structural DnD
 * - ContentLayoutV2 DnD
 * - Apartado DnD
 *
 * Uses horizontalListSortingStrategy for horizontal tab reordering.
 */
export function SectionDndContainer({
  sections,
  activeSectionId,
  iconMap,
  onReorder,
  onRename,
  readOnly,
}: SectionDndContainerProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // The tab being renamed, if any.
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: SECTION_DRAG_ACTIVATION.mouse,
    }),
    useSensor(TouchSensor, {
      activationConstraint: SECTION_DRAG_ACTIVATION.touch,
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: SECTION_DRAG_ACTIVATION.keyboardCodes,
    }),
  );

  const announcements = useMemo(() => sectionAnnouncements(sections), [sections]);

  const sortableIds = useMemo(
    () => sections.map((s) => s.id),
    [sections],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(String(event.active.id));
    },
    [],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);

      const { active, over } = event;
      if (!over) return;

      const sourceId = String(active.id);
      const targetId = String(over.id);

      if (sourceId === targetId) return;

      const sourceIdx = sections.findIndex((s) => s.id === sourceId);
      const targetIdx = sections.findIndex((s) => s.id === targetId);
      if (sourceIdx < 0 || targetIdx < 0) return;

      const placement = sourceIdx < targetIdx ? "after" : "before";

      const result = moveSection(sections, {
        sourceId,
        targetId,
        placement,
      });

      if (result.changed) {
        onReorder(result.sections);
      }
    },
    [sections, onReorder],
  );

  return (
    <DndContext
      id="section-dnd"
      sensors={sensors}
      collisionDetection={sectionCollisionDetection}
      autoScroll={SECTION_AUTO_SCROLL}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ announcements, screenReaderInstructions }}
    >
      <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
        <TabsList
          className="h-9 min-w-max justify-start rounded-full bg-muted/70 p-1 max-lg:min-h-12"
          // While a tab is being moved with the keyboard the arrows belong to
          // the drag, not to the tab list's roving focus; while one is being
          // renamed they belong to its text box.
          onKeyDown={(event) => {
            if (activeId || renamingId) event.preventBaseUIHandler();
          }}
        >
          {sections.map((section, index) => {
            const Icon = iconMap[section.id] ?? FileText;
            return (
              <SortableSectionTab
                key={section.id}
                sectionId={section.id}
                disabled={readOnly}
                pinned={isPinnedSection(section.id, index)}
                isActive={section.id === activeSectionId}
                icon={Icon}
                label={
                  sectionDisplayName(section)
                }
                rename={onRename ? {
                  title: section.title,
                  editing: renamingId === section.id,
                  onStart: () => setRenamingId(section.id),
                  onCommit: (title) => {
                    setRenamingId(null);
                    onRename(section.id, title);
                  },
                  onCancel: () => setRenamingId(null),
                } : undefined}
              />
            );
          })}
        </TabsList>
      </SortableContext>
    </DndContext>
  );
}
