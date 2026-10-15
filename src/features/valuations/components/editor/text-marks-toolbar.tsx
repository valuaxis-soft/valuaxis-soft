"use client";

import { useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toggleTextMark, type TextMark } from "@/features/valuations/services/text-marks";

const MARKS: Array<{ mark: TextMark; letter: string; title: string; className: string }> = [
  { mark: "bold", letter: "N", title: "Negrita", className: "font-bold" },
  { mark: "italic", letter: "K", title: "Cursiva", className: "italic" },
  { mark: "underline", letter: "S", title: "Subrayado", className: "underline" },
];

/**
 * Bold, italic and underline for the text field it wraps. A button applies
 * the mark to the text selected in the field, or to the whole value when
 * nothing is selected, and leaves the field focused where it was.
 */
export function TextMarksField({
  value,
  onChange,
  disabled,
  children,
  className,
  toolbarClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  /** The input or textarea the marks apply to. */
  children: ReactNode;
  className?: string;
  toolbarClassName?: string;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);

  const apply = (mark: TextMark) => {
    const field = fieldRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    const start = field?.selectionStart ?? undefined;
    const end = field?.selectionEnd ?? undefined;
    const next = toggleTextMark(value, mark, start ?? undefined, end ?? undefined);
    if (next === value) return;
    onChange(next);
    if (!field || start === undefined || end === undefined || start === end) return;
    // The selection follows the text it was on, tags included.
    const grew = next.length - value.length;
    const selectionEnd = Math.max(start, end + grew);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start, selectionEnd);
    });
  };

  return (
    <div className={cn("grid min-w-0 gap-1", className)} ref={fieldRef}>
      {children}
      <div className={cn("flex items-center gap-0.5", toolbarClassName)} role="toolbar" aria-label="Formato del texto">
        {MARKS.map((item) => (
          <Button
            key={item.mark}
            type="button"
            size="icon-xs"
            variant="ghost"
            className={cn("text-xs", item.className)}
            aria-label={item.title}
            title={`${item.title} (al texto seleccionado o a todo el dato)`}
            disabled={disabled}
            // Keeps the focus, and with it the selection, in the field.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply(item.mark)}
          >
            {item.letter}
          </Button>
        ))}
      </div>
    </div>
  );
}
