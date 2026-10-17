"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

/**
 * A cell of a capture table, as in a spreadsheet: it shows `display` (the
 * value with its decimals), and while focused the text as typed (`value`: a
 * number, a formula such as =0.9/1.05, or a text). What was typed is sent
 * once, when the cell is left or Enter is pressed; Escape gives up the edit.
 */
export function CommitCell(props: {
  value: string;
  display?: string;
  onCommit: (text: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Figures align right and keep their width. */
  numeric?: boolean;
  /** The display is the formula's result, not something typed: shown muted. */
  computed?: boolean;
  title?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  // Escape leaves the cell without sending: the blur that follows must know.
  const cancelled = useRef(false);

  const finish = () => {
    if (!cancelled.current && editing !== null && editing !== props.value) props.onCommit(editing);
    cancelled.current = false;
    setEditing(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      cancelled.current = true;
      event.currentTarget.blur();
    }
  };

  return (
    <input
      aria-label={props.ariaLabel}
      title={props.title}
      disabled={props.disabled}
      placeholder={props.placeholder}
      inputMode={props.numeric ? "decimal" : undefined}
      className={cn(
        "h-7 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 text-sm outline-none",
        "hover:border-input focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30 disabled:cursor-default disabled:hover:border-transparent",
        props.numeric && "text-right tabular-nums",
        props.computed && editing === null && "text-muted-foreground italic",
        props.className,
      )}
      value={editing ?? props.display ?? props.value}
      onFocus={() => setEditing(props.value)}
      onChange={(event) => setEditing(event.target.value)}
      onBlur={finish}
      onKeyDown={onKeyDown}
    />
  );
}
