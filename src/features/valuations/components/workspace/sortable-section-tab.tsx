"use client";

import { useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { PencilLine, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { TabsTrigger } from "@/components/ui/tabs";
import { SECTION_TITLE_MAX } from "@/features/valuations/services/section-edit-operations";

/* ------------------------------------------------------------------ */
/*  Sortable Section tab wrapper                                       */
/* ------------------------------------------------------------------ */

/**
 * Wraps a TabsTrigger with sortable (drag-to-reorder) behavior for
 * Section reordering.
 *
 * The entire tab is the drag activator — tabs are small enough that
 * a separate grip handle would be visually cluttered.
 *
 * Uses the section.id as the sortable identifier.
 *
 * The active tab also renames the section: a pencil next to it (or a double
 * click on it) turns the tab into a text box; Enter or leaving it keeps the
 * new title, Escape drops it. While it is a text box the tab is not sortable.
 * Every section but the required ones also shows a trash can on its active
 * tab, which asks before deleting it.
 */
export function SortableSectionTab({
  sectionId,
  disabled,
  pinned = false,
  isActive,
  icon,
  label,
  rename,
  onRemove,
  children,
}: {
  sectionId: string;
  disabled: boolean;
  /** Stays in its place: not dragged, and no tab is dropped on it. It is still renamed. */
  pinned?: boolean;
  isActive: boolean;
  icon: LucideIcon;
  label: string;
  rename?: {
    /** The title the text box starts with. */
    title: string;
    editing: boolean;
    onStart: () => void;
    onCommit: (title: string) => void;
    onCancel: () => void;
  };
  /** Asks to delete the section: absent for a required one. */
  onRemove?: () => void;
  children?: ReactNode;
}) {
  const editing = Boolean(rename?.editing);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sectionId, disabled: disabled || editing || pinned });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const Icon = icon;
  // Base UI owns the tab semantics (role="tab", roving tabIndex, disabled
  // state); only the sortable description is taken from dnd-kit.
  const sortableAttributes = disabled || pinned
    ? {}
    : {
        "aria-roledescription": attributes["aria-roledescription"],
        "aria-describedby": attributes["aria-describedby"],
      };
  const canRename = Boolean(rename) && !disabled && isActive;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-section-tab={sectionId}
      className={cn(
        "inline-flex items-center",
        isDragging && "z-50",
      )}
    >
      {rename && editing ? (
        <SectionTitleInput title={rename.title} onCommit={rename.onCommit} onCancel={rename.onCancel} />
      ) : (
        <TabsTrigger
          value={sectionId}
          className={cn(
            "touch-manipulation select-none [-webkit-touch-callout:none] max-lg:min-h-10 max-lg:px-3",
            !disabled && !pinned && "cursor-grab active:cursor-grabbing",
            isActive && "data-active:bg-background data-active:shadow-sm",
          )}
          {...sortableAttributes}
          {...(pinned ? {} : listeners)}
          onDoubleClick={canRename ? rename?.onStart : undefined}
        >
          {Icon ? <Icon /> : null}
          {label}
          {children}
        </TabsTrigger>
      )}
      {canRename && !editing ? (
        <button
          type="button"
          className="ml-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
          aria-label={`Renombrar sección ${label}`}
          title="Renombrar sección"
          onClick={rename?.onStart}
        >
          <PencilLine className="size-3.5" />
        </button>
      ) : null}
      {onRemove && !disabled && isActive && !editing ? (
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-destructive"
          aria-label={`Eliminar sección ${label}`}
          title="Eliminar sección"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function SectionTitleInput({ title, onCommit, onCancel }: { title: string; onCommit: (title: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(title);
  // Enter and Escape settle the title once; the blur that follows is not a second answer.
  const settled = useRef(false);
  const settle = (action: () => void) => {
    if (settled.current) return;
    settled.current = true;
    action();
  };
  return (
    <input
      autoFocus
      aria-label="Título de la sección"
      className="h-7 w-44 rounded-full border border-ring bg-background px-3 text-sm font-medium uppercase outline-none"
      maxLength={SECTION_TITLE_MAX}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => settle(() => onCommit(value))}
      onKeyDown={(event) => {
        // The tab list and the drag sensors must not see these keys.
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          settle(() => onCommit(value));
        } else if (event.key === "Escape") {
          event.preventDefault();
          settle(onCancel);
        }
      }}
    />
  );
}
