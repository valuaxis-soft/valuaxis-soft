"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  applyTextMark,
  hasTextMarks,
  rawSelectionOf,
  stripTextMarks,
  TEXT_MARK_EVENT,
  textMarkOfShortcut,
  textSelectionOf,
  withMarkedText,
  type TextMark,
  type TextMarkEventDetail,
} from "@/features/valuations/services/text-marks";
import { markedRuns } from "../document-concept-value";

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
 * Bold, italic and underline for a word of the text field it wraps, without
 * buttons under the field (video 7.3, 3:10: the N/K/S under every concept
 * read as the per-concept controls that had been taken away). Ctrl+B, Ctrl+I
 * and Ctrl+U (⌘ in a Mac) mark the text selected in the field, or the whole
 * value when nothing is selected, and remove the mark when that text already
 * has it; with only the caret in a marked stretch, they remove the mark from
 * that stretch. The right-click menu of the concept does the same with the
 * text selected when it opened (TEXT_MARK_EVENT). The whole value of several
 * concepts gets N/K/S from «Seleccionar conceptos». A value with marks shows
 * under the field the way it prints.
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
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  /** The input or textarea the marks apply to. */
  children: ReactNode | ((field: MarkedTextField) => ReactNode);
  className?: string;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const showsText = typeof children === "function";
  const field = () => fieldRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea") ?? null;

  /** Marks `range` of the field (as the field counts it), or the whole value; the selection follows the text it was on. */
  const apply = (mark: TextMark, fieldRange: FieldSelection | null) => {
    if (disabled) return;
    // The field counts in the text when it shows it; the marks are worked in the value as written.
    const raw = fieldRange ? (showsText ? rawSelectionOf(value, fieldRange.start, fieldRange.end) : fieldRange) : null;
    const next = applyTextMark(value, mark, raw?.start, raw?.end);
    if (next.value === value) return;
    onChange(next.value);
    const element = field();
    if (!element || !fieldRange) return;
    const rawRange = fieldRange.start === fieldRange.end
      ? { start: next.selectionEnd, end: next.selectionEnd }
      : { start: next.selectionStart, end: next.selectionEnd };
    const range = showsText ? textSelectionOf(next.value, rawRange.start, rawRange.end) : rawRange;
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(range.start, range.end);
    });
  };
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });

  // «Negrita» of the right-click menu, on the text that was selected when it opened.
  useEffect(() => {
    const node = fieldRef.current;
    if (!node) return;
    const onMark = (event: Event) => {
      const detail = (event as CustomEvent<TextMarkEventDetail>).detail;
      if (detail) applyRef.current(detail.mark, { start: detail.start, end: detail.end });
    };
    node.addEventListener(TEXT_MARK_EVENT, onMark);
    return () => node.removeEventListener(TEXT_MARK_EVENT, onMark);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const mark = textMarkOfShortcut(event);
    const element = field();
    if (!mark || !element || event.target !== element) return;
    event.preventDefault();
    event.stopPropagation();
    const focused = element.selectionStart !== null && element.selectionEnd !== null;
    apply(mark, focused ? { start: element.selectionStart!, end: element.selectionEnd! } : null);
  };

  return (
    <div className={cn("grid min-w-0 gap-1", className)} ref={fieldRef} data-text-marks-field="" onKeyDown={onKeyDown}>
      {typeof children === "function"
        ? children({ text: stripTextMarks(value), valueOf: (text) => withMarkedText(value, text) })
        : children}
      {hasTextMarks(value) ? (
        // The field holds the marks as tags; this is how the text reads with them applied.
        <p className="line-clamp-3 min-w-0 pt-0.5 text-xs whitespace-pre-wrap wrap-break-word text-muted-foreground" data-text-marks-preview="" title="Así se ve el texto con su formato">
          <span className="text-foreground">{markedRuns(value)}</span>
        </p>
      ) : null}
    </div>
  );
}
