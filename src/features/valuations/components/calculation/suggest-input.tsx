"use client";

import { useId, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The props a field takes to offer a list while it is typed (the combobox of WAI-ARIA). */
export type SuggestFieldProps = {
  role: "combobox";
  "aria-autocomplete": "list";
  "aria-expanded": boolean;
  "aria-controls": string;
  "aria-activedescendant"?: string;
  onFocus: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur: (event: FocusEvent<HTMLInputElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};

const plain = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** The options that contain what is typed (without accents or case), the typed value itself left out. */
export function matchingOptions(options: readonly string[], typed: string): string[] {
  const wanted = plain(typed);
  return options.filter((option) => plain(option) !== wanted && (!wanted || plain(option).includes(wanted)));
}

/**
 * A field that offers values while it is typed: the firm's own (municipios,
 * colonias, zonas…) and the fixed lists of the form. It never refuses another
 * value. Drawn by the page and not by the browser (a `datalist` is drawn by
 * Chrome's autofill, which this form keeps off), so it looks the same in every
 * browser. `children` renders the field with the props it receives.
 */
export function SuggestInput(props: {
  value: string;
  options: readonly string[];
  onPick: (value: string) => void;
  /** Accessible name of the list. */
  label: string;
  children: (field: SuggestFieldProps) => ReactNode;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const shown = open ? matchingOptions(props.options, props.value).slice(0, 50) : [];
  const expanded = shown.length > 0;
  const optionId = (index: number) => `${listId}-${index}`;

  const pick = (value: string) => {
    props.onPick(value);
    setOpen(false);
    setActive(-1);
  };

  const field: SuggestFieldProps = {
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": expanded,
    "aria-controls": listId,
    ...(expanded && active >= 0 ? { "aria-activedescendant": optionId(active) } : {}),
    onFocus: () => setOpen(true),
    onBlur: () => { setOpen(false); setActive(-1); },
    onKeyDown: (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!open) { setOpen(true); return; }
        if (!shown.length) return;
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((current) => (current + step + shown.length) % shown.length);
        return;
      }
      if (event.key === "Enter" && expanded && active >= 0) {
        // Picks the option instead of sending the form.
        event.preventDefault();
        pick(shown[active]);
        return;
      }
      if (event.key === "Escape" && expanded) {
        // Closes the list, not the dialog the field is in.
        event.preventDefault();
        event.nativeEvent.stopPropagation();
        setOpen(false);
        setActive(-1);
        return;
      }
      if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete") {
        setOpen(true);
        setActive(-1);
      }
    },
  };

  return (
    <div className="relative" data-suggest-field>
      {props.children(field)}
      <ul
        id={listId}
        role="listbox"
        aria-label={props.label}
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-soft"
      >
        {shown.map((option, index) => (
          <li
            key={option}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            className={cn("cursor-pointer rounded-sm px-2 py-1", index === active ? "bg-accent text-accent-foreground" : "hover:bg-muted")}
            // Before the field's blur, so the click reaches the option.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(option)}
          >
            {option}
          </li>
        ))}
      </ul>
    </div>
  );
}
