"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { useFormulaEditing } from "@/features/valuations/components/editor/formula-editing";
import {
  formulaWithLastValues,
  hasLiveReferences,
  liveFormulaWarning,
  readableFormulaText,
  resolveLiveFormula,
} from "@/features/valuations/services/live-formulas";
import { useLiveFormulaOwner } from "./formula-input";

/**
 * The live formula of a cell of a capture table (the homologation, the
 * comparables' characteristics, the alternative methods), as a field of the
 * panels (formula-input.tsx): the references are read again against the
 * document; when what they read changes, the cell sends the formula with the
 * new numbers (`onFollow`), once, while it is not being edited. A reference
 * deleted or circular keeps its last number and says why (`warning`).
 */
export function useLiveCell(props: {
  /** What the cell keeps: a formula with its tags, a number or a text. */
  value: string;
  /** The cell takes formulas; without them nothing is read. */
  enabled: boolean;
  /** Disabled or read only: shown, never sent. */
  fixed: boolean;
  /** Being edited or written: nothing is sent and no warning shows. */
  busy: boolean;
  onFollow: (text: string) => void;
}) {
  const { index } = useFormulaEditing();
  const owner = useLiveFormulaOwner();
  const stored = props.value.trim();
  const live = useMemo(
    () => (props.enabled && hasLiveReferences(stored) ? resolveLiveFormula(stored, index, owner) : null),
    [props.enabled, stored, index, owner],
  );
  // Sent once per change: the cell waits for its table to hold the new formula.
  const sentRef = useRef<string | null>(null);
  const { onFollow } = props;
  useEffect(() => {
    if (!live?.changed || props.fixed || props.busy || sentRef.current === live.text) return;
    sentRef.current = live.text;
    onFollow(live.text);
  });
  const readable = live ? readableFormulaText(stored, index) : null;
  const warning = live && !props.busy ? liveFormulaWarning(live.problems) : null;
  const formulaTitle = readable ? `Fórmula: ${readable} (con los valores ${formulaWithLastValues(stored)})` : null;
  return {
    /** The formula as the appraiser reads and corrects it, "=[Superficie]*2"; null without references. */
    readable,
    warning,
    /** What the tooltip says of the formula and its references. */
    title: formulaTitle ? `${formulaTitle}${warning ? `. ${warning}` : ""}` : null,
  };
}

/** Classes of a cell whose references could not be read: marked in amber, as a panel's field. */
export const LIVE_WARNING_CLASS = "bg-amber-50 text-amber-800 ring-1 ring-amber-400 dark:bg-amber-950/40 dark:text-amber-300";

/** The mark inside a cell whose references could not be read, with the reason for screen readers. */
export function LiveCellMark({ id, warning }: { id: string; warning: string }) {
  return (
    <>
      <AlertTriangle aria-hidden className="pointer-events-none absolute top-1/2 left-0.5 size-3 -translate-y-1/2 text-amber-600 dark:text-amber-400" data-formula-warning-mark="" />
      <span id={id} className="sr-only">{warning}</span>
    </>
  );
}
