"use client";

import { useCallback, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FileText } from "lucide-react";
import type { AppSection } from "../../model";
import { moveSection } from "../../services/section-order-operations";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
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
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

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
    >
      <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
        <TabsList className="h-9 min-w-max justify-start rounded-full bg-muted/70 p-1">
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
