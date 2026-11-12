"use client";

import { Fragment, useState, type MouseEvent, type ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { Concept, ConceptDateFormat, ConceptValueFormat } from "@/features/valuations/model";
import {
  conceptContextMenu,
  spacingChoices,
  type ConceptMenuAction,
  type ConceptMenuItem,
  type ConceptMenuTarget,
} from "@/features/valuations/services/concept-context-menu";
import { CONCEPT_CREATION_OPTIONS, conceptDataTypePatch, conceptDataTypeValue } from "@/features/valuations/services/concept-types";
import {
  NUMERIC_VALUE_FORMAT_OPTIONS,
  resolveConceptValueFormat,
  resolveEffectiveSourceUnit,
} from "@/features/valuations/services/concept-value-format";
import type { ContainerAddress } from "@/features/valuations/services/structure-transfer";
import type { TextMark } from "@/features/valuations/services/text-marks";
import { findCustomUnit } from "@/features/firm/custom-units";
import { TAG_STYLE_CHOICES, useConceptContainerActions } from "./concept-selection";
import { useCustomUnits } from "./custom-units-context";
import { useDeleteConcepts } from "./delete-confirm";
import { MoveConceptPicker } from "./structure-transfer-actions";
import { firmUnitOptionValue } from "./value-format-select";

const MARKS: Partial<Record<ConceptMenuAction, TextMark>> = { bold: "bold", italic: "italic", underline: "underline" };

const DATE_FORMATS: Array<{ value: ConceptDateFormat; label: string }> = [
  { value: "short", label: "Corta (12/02/2024)" },
  { value: "long", label: "Larga (12 de febrero de 2024)" },
];

/** The patch "Formato del valor" writes, as the ⋮ menu writes it. */
function valueFormatPatch(concept: Concept, format: ConceptValueFormat, customUnit?: string): Partial<Concept> {
  const patch: Partial<Concept> = { valueFormat: format, customUnit: format === "custom" ? customUnit ?? concept.customUnit : undefined };
  const current = resolveConceptValueFormat(concept);
  if (concept.sourceUnit === undefined && resolveEffectiveSourceUnit(concept) === current) patch.sourceUnit = current;
  return patch;
}

/** The text selected in a field keeps the browser's menu (copy, paste, spelling), as in a spreadsheet's formula bar. */
function keepsBrowserMenu(event: MouseEvent<HTMLDivElement>) {
  const target = event.target as Node;
  // A popover or dialog opened from the row (its ⋮, a draft) bubbles through React to here: it keeps its own menu.
  if (!event.currentTarget.contains(target)) return true;
  const field = (target as HTMLElement).closest?.("input, textarea");
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    try {
      return document.activeElement === field && field.selectionStart !== field.selectionEnd;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * The right-click menu of a concept, around its row: the actions of its ⋮
 * menu and of "Seleccionar conceptos" (N/K/S, formato del valor, tipo de
 * dato, renglón, espacios, duplicar, mover, eliminar), with what
 * cannot apply disabled and explained, the same in every section and in the
 * blocks the calculation writes.
 */
export function ConceptContextMenu({
  children,
  concept,
  name,
  target,
  onPatch,
  onTextMark,
  onJoinLines,
  onMove,
  onDuplicate,
  moveSource,
  onRemove,
}: {
  children: ReactNode;
  /** The concept as it shows (a linked one, as its source). */
  concept: Concept;
  /** Its name in the delete dialog. */
  name: string;
  target: Omit<ConceptMenuTarget, "canRowStyle" | "canSelect" | "canMoveTo">;
  /** Format, type, date format and spacing of the concept. */
  onPatch: (patch: Partial<Concept>) => void;
  onTextMark?: (mark: TextMark) => void;
  onJoinLines?: () => void;
  onMove?: (direction: -1 | 1) => void;
  onDuplicate?: () => void;
  moveSource?: ContainerAddress;
  onRemove?: () => void;
}) {
  const container = useConceptContainerActions();
  const deleteConcepts = useDeleteConcepts();
  const { units: firmUnits } = useCustomUnits();
  const [moving, setMoving] = useState(false);
  const groups = conceptContextMenu({
    ...target,
    canRowStyle: Boolean(container?.applyTagStyle),
    canSelect: Boolean(container),
    canMoveTo: Boolean(moveSource),
  });

  const run = (action: ConceptMenuAction) => {
    const mark = MARKS[action];
    if (mark) {
      onTextMark?.(mark);
      return;
    }
    switch (action) {
      case "join-lines": onJoinLines?.(); return;
      case "move-up": onMove?.(-1); return;
      case "move-down": onMove?.(1); return;
      case "duplicate": onDuplicate?.(); return;
      case "move-to": setMoving(true); return;
      case "select": container?.startSelection(concept.id); return;
      case "delete":
        // As the trash can of the ⋮ menu: one concept goes at once and comes back with "Deshacer".
        if (onRemove) deleteConcepts({ count: 1, name, onDelete: onRemove });
        return;
      default:
        return;
    }
  };

  const valueFormat = resolveConceptValueFormat(concept);
  const knownUnit = valueFormat === "custom" ? findCustomUnit(firmUnits, concept.customUnit ?? "") : undefined;
  const selectedFormat = knownUnit ? firmUnitOptionValue(knownUnit) : valueFormat;

  const submenu = (item: ConceptMenuItem): ReactNode => {
    switch (item.action) {
      case "value-format":
        return (
          <ContextMenuRadioGroup value={selectedFormat}>
            {NUMERIC_VALUE_FORMAT_OPTIONS.map((option) => (
              <ContextMenuRadioItem key={option.value} value={option.value} onClick={() => onPatch(valueFormatPatch(concept, option.value))}>
                {option.label}
              </ContextMenuRadioItem>
            ))}
            {firmUnits.map((unit) => (
              <ContextMenuRadioItem key={unit} value={firmUnitOptionValue(unit)} onClick={() => onPatch(valueFormatPatch(concept, "custom", unit))}>
                {unit} · del despacho
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
        );
      case "data-type":
        return (
          <ContextMenuRadioGroup value={conceptDataTypeValue(concept)}>
            {CONCEPT_CREATION_OPTIONS.map((option) => (
              <ContextMenuRadioItem key={option.kind} value={option.kind} onClick={() => onPatch(conceptDataTypePatch(concept, option.kind))}>
                {option.label}
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
        );
      case "date-format":
        return (
          <ContextMenuRadioGroup value={concept.dateFormat === "short" ? "short" : "long"}>
            {DATE_FORMATS.map((option) => (
              <ContextMenuRadioItem key={option.value} value={option.value} onClick={() => onPatch({ dateFormat: option.value })}>
                {option.label}
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
        );
      case "row-style":
        return TAG_STYLE_CHOICES.map((option) => (
          <ContextMenuItem key={option.label} onClick={() => container?.applyTagStyle?.([concept.id], option.value === "" ? undefined : option.value)}>
            {option.label}
          </ContextMenuItem>
        ));
      case "spacing-before":
      case "spacing-after": {
        const field = item.action === "spacing-before" ? "spacingBefore" : "spacingAfter";
        return (
          <ContextMenuRadioGroup value={String(concept[field] ?? 0)}>
            {spacingChoices(concept[field]).map((lines) => (
              <ContextMenuRadioItem key={lines} value={String(lines)} onClick={() => onPatch({ [field]: lines })}>
                {lines === 0 ? "Sin espacio" : lines === 1 ? "1 renglón" : `${lines} renglones`}
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
        );
      }
      default:
        return null;
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          className="block w-full min-w-0 select-auto"
          onContextMenuCapture={(event) => {
            if (keepsBrowserMenu(event)) event.stopPropagation();
          }}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-60" data-concept-menu={concept.id}>
          {groups.map((group, index) => (
            <Fragment key={index}>
              {index > 0 ? <ContextMenuSeparator /> : null}
              {group.map((item) => {
                if (item.submenu && !item.disabled) {
                  return (
                    <ContextMenuSub key={item.action}>
                      <ContextMenuSubTrigger>{item.label}</ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-56">{submenu(item)}</ContextMenuSubContent>
                    </ContextMenuSub>
                  );
                }
                const node = (
                  <ContextMenuItem key={item.action} variant={item.destructive ? "destructive" : undefined} disabled={item.disabled} onClick={() => run(item.action)}>
                    {item.label}
                  </ContextMenuItem>
                );
                return item.disabled && item.hint ? <div key={item.action} title={item.hint}>{node}</div> : node;
              })}
            </Fragment>
          ))}
        </ContextMenuContent>
      </ContextMenu>
      {moveSource ? <MoveConceptPicker source={moveSource} conceptId={concept.id} open={moving} onOpenChange={setMoving} /> : null}
    </>
  );
}
