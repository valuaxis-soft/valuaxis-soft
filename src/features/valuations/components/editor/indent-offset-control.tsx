"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { MAX_OFFSET_PX, MIN_OFFSET_PX, parseIndentOffset } from "@/features/valuations/services/concept-presentation";

/**
 * The "Sangría" adjustment in pixels: the slider and a box where the number
 * is typed, so the same value is repeated exactly in another concept or
 * block. The same control in the concept, the block and the selection.
 */
export function IndentOffsetControl({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (offsetPx: number) => void;
}) {
  // What is being typed; the value is written as soon as it reads as a number.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="space-y-1.5 pt-1" data-indent-offset>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">Ajuste</span>
        <span className="flex items-center gap-1">
          <Input
            aria-label="Sangría en píxeles"
            className="h-7 w-16 text-right text-xs tabular-nums"
            disabled={disabled}
            inputMode="numeric"
            min={MIN_OFFSET_PX}
            max={MAX_OFFSET_PX}
            step={1}
            type="number"
            value={draft ?? String(value)}
            onBlur={() => setDraft(null)}
            onChange={(event) => {
              setDraft(event.target.value);
              const parsed = parseIndentOffset(event.target.value);
              if (parsed !== null) onChange(parsed);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setDraft(null);
              }
            }}
          />
          <span>px</span>
        </span>
      </div>
      <Slider
        aria-label="Sangría"
        disabled={disabled}
        min={MIN_OFFSET_PX}
        max={MAX_OFFSET_PX}
        step={1}
        value={[value]}
        onValueChange={(next) => {
          setDraft(null);
          onChange(Array.isArray(next) ? next[0] : next);
        }}
      />
    </div>
  );
}
