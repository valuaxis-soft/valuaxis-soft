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
  type Announcements,
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

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Para reordenar la sección, pulsa la barra espaciadora, muévela con las flechas y vuelve a pulsar la barra espaciadora para soltarla. Escape cancela.",
};

function sectionAnnouncements(sections: AppSection[]): Announcements {
  const name = (id: string | number) => {
    const section = sections.find((item) => item.id === String(id));
    return section ? `${section.label}. ${section.title}` : String(id);
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
  readOnly,
}: SectionDndContainerProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

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
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ announcements, screenReaderInstructions }}
    >
      <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
        <TabsList
          className="h-9 min-w-max justify-start rounded-full bg-muted/70 p-1 max-lg:min-h-12"
          // While a tab is being moved with the keyboard the arrows belong to
          // the drag, not to the tab list's roving focus.
          onKeyDown={(event) => {
            if (activeId) event.preventBaseUIHandler();
          }}
        >
          {sections.map((section) => {
            const Icon = iconMap[section.id] ?? FileText;
            return (
              <SortableSectionTab
                key={section.id}
                sectionId={section.id}
                disabled={readOnly}
                isActive={section.id === activeSectionId}
                icon={Icon}
                label={
                  `${section.label}. ${section.title}`
                }
              />
            );
          })}
        </TabsList>
      </SortableContext>
    </DndContext>
  );
}
