"use client";

import { useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  activeTextMarks,
  applyTextMark,
  hasTextMarks,
  rawSelectionOf,
  stripTextMarks,
  textSelectionOf,
  withMarkedText,
  type TextMark,
} from "@/features/valuations/services/text-marks";
import { markedRuns } from "../document-concept-value";

const MARKS: Array<{ mark: TextMark; letter: string; title: string; className: string }> = [
  { mark: "bold", letter: "N", title: "Negrita", className: "font-bold" },
  { mark: "italic", letter: "K", title: "Cursiva", className: "italic" },
  { mark: "underline", letter: "S", title: "Subrayado", className: "underline" },
];

type FieldSelection = { start: number; end: number };

/**
 * The text a field shows for a value with marks, and the value an edit of
 * that text makes: the tags never show in the field (audit of 2 nov 2026,
 * «se ven las etiquetas crudas <b>»), they stay in the value.
 */
export type MarkedTextField = {
  text: string;
  valueOf: (text: string) => string;
};

/**
 * Bold, italic and underline for the text field it wraps. A button applies
 * the mark to the text selected in the field, or to the whole value when
 * nothing is selected, and removes it when that text already has it; with
 * only the caret in a marked stretch, it removes the mark from that stretch.
 * Each button shows itself pressed while the text it would work on has its
 * mark, and a value with marks shows under the field the way it prints.
 *
 * Given as a function, the field shows the text without the tags and writes
 * back through `valueOf`, which keeps the marks; given as an element, it
 * shows the value as written.
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
  children: ReactNode | ((field: MarkedTextField) => ReactNode);
  className?: string;
  toolbarClassName?: string;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  // Where the selection or the caret is while the field has the focus, as the field counts it; without it, the buttons work on the whole value.
  const [selection, setSelection] = useState<FieldSelection | null>(null);
  const showsText = typeof children === "function";
  // The field counts in the text when it shows it; the marks are worked in the value as written.
  const toRaw = (range: FieldSelection) => (showsText ? rawSelectionOf(value, range.start, range.end) : range);
  const rawSelection = selection ? toRaw(selection) : null;
  const active = activeTextMarks(value, rawSelection?.start, rawSelection?.end);

  const field = () => fieldRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea") ?? null;
  const readSelection = () => {
    const element = field();
    if (!element || document.activeElement !== element || element.selectionStart === null || element.selectionEnd === null) {
      setSelection(null);
      return;
    }
    setSelection({ start: element.selectionStart, end: element.selectionEnd });
  };

  const apply = (mark: TextMark) => {
    const element = field();
    const focused = element !== null && document.activeElement === element && element.selectionStart !== null && element.selectionEnd !== null;
    const fieldRange = focused ? { start: element.selectionStart!, end: element.selectionEnd! } : null;
    const raw = fieldRange ? toRaw(fieldRange) : null;
    const next = applyTextMark(value, mark, raw?.start, raw?.end);
    if (next.value === value) return;
    onChange(next.value);
    if (!element || !fieldRange) return;
    // The selection follows the text it was on; a lone caret stays a caret on the same text.
    const rawRange = fieldRange.start === fieldRange.end
      ? { start: next.selectionEnd, end: next.selectionEnd }
      : { start: next.selectionStart, end: next.selectionEnd };
    const range = showsText ? textSelectionOf(next.value, rawRange.start, rawRange.end) : rawRange;
    setSelection(range);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(range.start, range.end);
    });
  };

  return (
    <div
      className={cn("group/marks grid min-w-0 gap-1", className)}
      ref={fieldRef}
      onSelect={readSelection}
      onKeyUp={readSelection}
      onMouseUp={readSelection}
      onFocus={readSelection}
      onBlur={() => setSelection(null)}
    >
      {typeof children === "function"
        ? children({ text: stripTextMarks(value), valueOf: (text) => withMarkedText(value, text) })
        : children}
      <div className="flex min-w-0 items-start gap-2">
        {/*
          The buttons show only while the field is being written in, for a
          word or a stretch of it: passing the pointer over the concepts does
          not repeat them (V5.2-02). The whole value of several concepts gets
          N/K/S from "Seleccionar conceptos" or the right-click menu.
        */}
        <div
          className={cn(
            "invisible flex items-center gap-0.5 group-focus-within/marks:visible",
            toolbarClassName,
          )}
          role="toolbar"
          aria-label="Formato del texto"
        >
          {MARKS.map((item) => (
            <Button
              key={item.mark}
              type="button"
              size="icon-xs"
              variant={active[item.mark] ? "secondary" : "ghost"}
              className={cn("text-xs", item.className, active[item.mark] && "border-border shadow-inner")}
              aria-label={item.title}
              aria-pressed={active[item.mark]}
              data-active={active[item.mark] ? "" : undefined}
              title={`${item.title} (al texto seleccionado o a todo el dato; si ya la tiene, se quita)`}
              disabled={disabled}
              // Keeps the focus, and with it the selection, in the field.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => apply(item.mark)}
            >
              {item.letter}
            </Button>
          ))}
        </div>
        {hasTextMarks(value) ? (
          // The field holds the marks as tags; this is how the text reads with them applied.
          <p className="line-clamp-3 min-w-0 flex-1 pt-0.5 text-xs whitespace-pre-wrap wrap-break-word text-muted-foreground" data-text-marks-preview="" title="Así se ve el texto con su formato">
            <span className="text-foreground">{markedRuns(value)}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
