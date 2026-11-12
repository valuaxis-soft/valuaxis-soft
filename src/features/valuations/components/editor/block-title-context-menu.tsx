"use client";

import { Fragment, useState, type RefObject } from "react";

import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import type { AppSection, Block } from "@/features/valuations/model";
import { blockCopyLockReason, blockDestinationSections, blockMoveLockReason } from "@/features/valuations/services/structure-transfer";
import { tableContextMenu, type BlockMenuTarget, type TableMenuAction } from "@/features/valuations/services/table-context-menu";
import { sectionDisplayName } from "../workspace/model/section-numbering";
import { useStructureTransfer } from "../workspace/structure-transfer-context";
import { deleteConfirmation, useConfirmDelete } from "./delete-confirm";
import { DestinationPicker, type PickerOption } from "./structure-transfer-actions";

const NO_TRANSFER = "No se puede copiar ni mover.";

/**
 * The right-click menu of a block's title, with the actions its toolbar
 * already offers: rename, copy, duplicate, move to another section, hide in
 * the dictamen, a page break before it and deleting it (asking first with the
 * same dialog as the trash can, and undone with "Deshacer").
 */
export function BlockTitleContextMenu({ section, block, label, name, titleRef, canRename, visibility, pageBreak, onDelete, lock, hints }: {
  section: AppSection;
  block: Block;
  /** "el bloque" or "la sección", as the toolbar names it. */
  label: string;
  /** The name the delete dialog gives it; absent, its title. */
  name?: string;
  /** The title's field, entered to rename it. */
  titleRef: RefObject<HTMLInputElement | null>;
  canRename: boolean;
  visibility?: { visible: boolean; onChange: (visible: boolean) => void };
  pageBreak?: { before: boolean; onChange: (before: boolean) => void };
  onDelete?: () => void;
  /** Why the block can be neither copied nor moved, over what the section says (a block the calculation writes). */
  lock?: string | null;
  /** Why each disabled item is disabled, as the toolbar says it. */
  hints?: BlockMenuTarget["hints"];
}) {
  const transfer = useStructureTransfer();
  const confirmDelete = useConfirmDelete();
  const [moving, setMoving] = useState(false);
  const available = transfer && !transfer.readOnly;
  const copyLock = available ? lock ?? blockCopyLockReason(section, block.id) : NO_TRANSFER;
  const moveLock = available ? lock ?? blockMoveLockReason(section, block.id) : NO_TRANSFER;
  const groups = tableContextMenu("editable", {
    kind: "block",
    canRename,
    canTransfer: !copyLock,
    canMove: !copyLock && !moveLock,
    hidden: visibility ? !visibility.visible : false,
    canHide: Boolean(visibility),
    pageBreakBefore: pageBreak?.before ?? false,
    canPageBreak: Boolean(pageBreak),
    canDelete: Boolean(onDelete),
    hints: { ...hints, transfer: copyLock ?? undefined, move: copyLock ?? moveLock ?? undefined },
  });
  const options: PickerOption[] = moving && transfer
    ? blockDestinationSections(transfer.sections, section.id, block).map((destination) => ({
        key: destination.id,
        group: "Secciones",
        label: sectionDisplayName(destination),
        onPick: () => transfer.moveBlock(section.id, block.id, destination.id),
      }))
    : [];
  const run = (action: TableMenuAction) => {
    switch (action) {
      case "block-rename":
        // The menu gives the focus back when it closes; the title is entered after that.
        window.setTimeout(() => {
          titleRef.current?.focus();
          titleRef.current?.select();
        }, 80);
        return;
      case "block-copy": transfer?.copyBlock(block); return;
      case "block-duplicate": transfer?.duplicateBlock(section.id, block.id); return;
      case "block-move": setMoving(true); return;
      case "block-hide": visibility?.onChange(false); return;
      case "block-show": visibility?.onChange(true); return;
      case "block-page-break": pageBreak?.onChange(!pageBreak.before); return;
      case "block-delete":
        // The same dialog as the trash can of the toolbar; the block comes back with "Deshacer".
        if (onDelete) confirmDelete({ ...deleteConfirmation("block", name ?? block.title), onConfirm: onDelete });
        return;
      default:
        return;
    }
  };
  return (
    <>
      <ContextMenuContent className="w-60" data-block-title-menu={block.id}>
        {groups.map((group, index) => (
          <Fragment key={index}>
            {index > 0 ? <ContextMenuSeparator /> : null}
            {group.map((item) => {
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
      <DestinationPicker
        open={moving}
        onOpenChange={setMoving}
        title={`Mover ${label} a otra sección`}
        description="Va al final de la sección que elijas, con todo lo que tiene."
        options={options}
      />
    </>
  );
}
