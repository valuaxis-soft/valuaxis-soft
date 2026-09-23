"use client";

import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AppSection } from "@/features/valuations/model";
import { SectionDndContainer } from "./section-dnd-container";

export function ValuationNavigation({
  activeSectionId,
  enabledSections,
  iconMap,
  onReorder,
  readOnly,
}: {
  activeSectionId: string;
  enabledSections: AppSection[];
  iconMap: Record<string, LucideIcon>;
  onReorder: (nextSections: AppSection[]) => void;
  readOnly: boolean;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollSections = (direction: -1 | 1) => {
    scrollSectionContainer(scrollContainerRef.current, direction);
  };

  return (
    <nav
      className="mx-auto flex w-full min-w-0 max-w-[44rem] items-center gap-1 xl:flex-[1_1_28rem]"
      aria-label="Secciones del avalúo"
    >
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
        className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-color:var(--muted-foreground)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent"
      >
        <SectionDndContainer
          sections={enabledSections}
          activeSectionId={activeSectionId}
          iconMap={iconMap}
          onReorder={onReorder}
          readOnly={readOnly}
        />
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

export function scrollSectionContainer(
  container: Pick<HTMLDivElement, "scrollBy"> | null,
  direction: -1 | 1,
) {
  container?.scrollBy({ left: direction * 280, behavior: "smooth" });
}
