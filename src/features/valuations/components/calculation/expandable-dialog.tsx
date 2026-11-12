"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** What the comparable windows take when the appraiser enlarges them: almost the whole screen, never the browser's full screen. */
const EXPANDED = "h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none sm:max-w-[calc(100vw-1rem)]";

/**
 * A window of comparables that can be enlarged (V5.3-15): its classes, larger
 * or as they are, and the button beside the close button that switches them.
 */
export function useExpandableDialog() {
  const [expanded, setExpanded] = useState(false);
  return {
    expanded,
    className: (base: string) => cn(base, expanded && EXPANDED),
    button: (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-3 right-11"
        aria-label={expanded ? "Restaurar el tamaño de la ventana" : "Agrandar la ventana"}
        aria-pressed={expanded}
        title={expanded ? "Restaurar tamaño" : "Agrandar"}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? <Minimize2 /> : <Maximize2 />}
      </Button>
    ),
  };
}
