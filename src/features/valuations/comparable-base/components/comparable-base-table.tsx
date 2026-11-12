"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, Columns3, Copy, Eye, EyeOff, FileSpreadsheet, GripVertical, ImageOff, Loader2, MoreHorizontal, Pencil, Trash2, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OPERATION_TYPE_LABELS, formatComparableId, formatDay } from "@/features/valuations/calculation/comparable-card";
import { COMPARABLE_TYPE_LABELS, isRentComparableType } from "@/features/valuations/calculation/market-types";
import { ValidityBadge } from "@/features/valuations/components/calculation/comparable-validity-badge";
import { api, SessionExpiredError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ComparableBaseItem } from "../comparable-base.service";
import { ComparableColumnsMenuItems } from "./comparable-columns-menu";
import { buildComparableListHref, type ComparableListParams } from "../comparable-list-params";
import {
  COMPARABLE_COLUMN_LABELS,
  canMoveColumnBy,
  columnLayoutStorageKey,
  columnSortDirection,
  defaultColumnLayout,
  isSortableColumn,
  moveColumn,
  moveColumnBy,
  nextColumnSort,
  parseColumnLayout,
  resizeColumn,
  serializeColumnLayout,
  toggleColumn,
  visibleColumns,
  type ColumnLayout,
  type ColumnSetting,
  type ComparableColumn,
} from "../column-layout";

const money = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const area = (value: number | null) => (value === null ? null : `${value.toLocaleString("es-MX", { maximumFractionDigits: 2 })} m²`);
const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo completar la acción.";

/** Land, built and rooms in one line: "Terreno 250 m² · Const. 180 m² · 3 rec. · 2.5 baños". */
function sizeLine(item: ComparableBaseItem) {
  return [
    item.landArea !== null ? `Terreno ${area(item.landArea)}` : null,
    item.builtArea !== null ? `${item.type === "INMUEBLE_RENTA" ? "Rentable" : "Const."} ${area(item.builtArea)}` : null,
    item.bedrooms !== null ? `${item.bedrooms} rec.` : null,
    item.bathrooms !== null ? `${item.bathrooms} ${item.bathrooms === 1 ? "baño" : "baños"}` : null,
  ].filter(Boolean).join(" · ") || "—";
}

const subscribeToNothing = () => () => {};

/** The width of the selection and actions columns, which are not in the layout. */
const FIXED_WIDTH = 44;

function cellOf(column: ComparableColumn, item: ComparableBaseItem): ReactNode {
  const id = formatComparableId(item.folio);
  switch (column) {
    case "numero":
      return (
        <Link href={`/comparables/${item.id}`} className="font-mono font-medium text-primary underline-offset-2 hover:underline">
          {id ?? "Sin número"}
        </Link>
      );
    case "ubicacion":
      return (
        <div className="flex items-center gap-2">
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbnailUrl} alt="" className="size-10 shrink-0 rounded object-cover" />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted" aria-hidden="true">
              <ImageOff className="size-4 text-muted-foreground" />
            </span>
          )}
          <div className="min-w-0">
            <Link href={`/comparables/${item.id}`} className="line-clamp-2 font-medium hover:underline">
              {item.location || "Sin ubicación"}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{[item.landUse, item.constructionType].filter(Boolean).join(" · ") || " "}</p>
          </div>
        </div>
      );
    case "tipo":
      return (
        <>
          <p>{COMPARABLE_TYPE_LABELS[item.type]}</p>
          <p className="text-xs text-muted-foreground">{OPERATION_TYPE_LABELS[item.operationType]}</p>
        </>
      );
    case "superficies":
      return <span className="text-xs text-muted-foreground">{sizeLine(item)}</span>;
    case "precio":
      return (
        <div className="text-right tabular-nums">
          <p className="font-medium">{money(item.price)}</p>
          <p className="text-xs text-muted-foreground">
            {item.unitValue !== null ? `${money(item.unitValue)}/m²${isRentComparableType(item.type) ? "/mes" : ""}` : ""}
          </p>
        </div>
      );
    case "fuente":
      return <span className="truncate">{item.sourceName ?? "—"}</span>;
    case "fecha":
      return <time dateTime={item.validity.updatedOn} className="text-muted-foreground">{formatDay(item.validity.updatedOn)}</time>;
    case "vigencia":
      return (
        <div className="grid justify-items-start gap-1">
          <ValidityBadge validity={item.validity} />
          <span className="text-xs text-muted-foreground">hasta {formatDay(item.validity.validUntil)}</span>
        </div>
      );
    case "usado":
      return (
        <ul className="flex flex-wrap gap-1">
          {item.uses.map((use) => (
            <li key={use.valuationId}>
              <Link href={`/workspace?id=${use.valuationId}`} title={[use.title, use.client ? `cliente ${use.client}` : null].filter(Boolean).join(" · ")}>
                <Badge variant="outline" className="font-mono">{use.folio}</Badge>
              </Link>
            </li>
          ))}
          {!item.uses.length ? <li className="text-xs text-muted-foreground">—</li> : null}
        </ul>
      );
  }
}

/**
 * A header the user drags to reorder (anywhere on it, or its grip with the
 * keyboard), clicks to sort, drags on its edge to widen, and right-clicks to
 * move it left or right or hide it, as the editor's tables.
 */
function SortableHead({ column, sort, onSort, onResize, menu }: {
  column: ColumnSetting;
  sort: ComparableListParams["sort"];
  onSort: (key: ComparableColumn) => void;
  onResize: (key: ComparableColumn, width: number) => void;
  menu: { canMoveLeft: boolean; canMoveRight: boolean; canHide: boolean; onMove: (direction: -1 | 1) => void; onHide: () => void };
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: column.key });
  const direction = columnSortDirection(column.key, sort);
  const sortable = isSortableColumn(column.key);
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition, width: column.width };

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = column.width;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => onResize(column.key, startWidth + moveEvent.clientX - startX);
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };

  const SortIcon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th
      ref={setNodeRef}
      style={style}
      scope="col"
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : sortable ? "none" : undefined}
      data-column={column.key}
      className={cn(
        "group/head sticky top-0 z-10 h-10 border-b bg-background px-1 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground select-none",
        column.key === "precio" && "text-right",
        isDragging && "z-20 bg-muted opacity-90",
      )}
    >
      <ContextMenu>
      <ContextMenuTrigger
        render={<div className={cn("flex h-full cursor-grab items-center gap-0.5 active:cursor-grabbing", column.key === "precio" && "flex-row-reverse")} data-column-drag={column.key} {...listeners} />}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="cursor-grab touch-none rounded p-0.5 text-muted-foreground/40 group-hover/head:text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Mover la columna ${COMPARABLE_COLUMN_LABELS[column.key]}`}
          title="Arrastra el encabezado para mover la columna; clic derecho para más opciones"
          {...attributes}
        >
          <GripVertical className="size-3.5" />
        </button>
        {sortable ? (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 truncate rounded px-1 py-1 text-left hover:text-foreground"
            onClick={() => onSort(column.key)}
            title={`Ordenar por ${COMPARABLE_COLUMN_LABELS[column.key].toLowerCase()}`}
          >
            <span className="truncate">{COMPARABLE_COLUMN_LABELS[column.key]}</span>
            <SortIcon className={cn("size-3.5 shrink-0", direction ? "text-foreground" : "text-muted-foreground/40")} aria-hidden="true" />
          </button>
        ) : (
          <span className="flex-1 truncate px-1 py-1">{COMPARABLE_COLUMN_LABELS[column.key]}</span>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <div title={menu.canMoveLeft ? undefined : "La columna ya es la primera."}>
          <ContextMenuItem disabled={!menu.canMoveLeft} onClick={() => menu.onMove(-1)}>
            <ArrowLeft /> Mover a la izquierda
          </ContextMenuItem>
        </div>
        <div title={menu.canMoveRight ? undefined : "La columna ya es la última."}>
          <ContextMenuItem disabled={!menu.canMoveRight} onClick={() => menu.onMove(1)}>
            <ArrowRight /> Mover a la derecha
          </ContextMenuItem>
        </div>
        <ContextMenuSeparator />
        <div title={menu.canHide ? undefined : "La lista no puede quedarse sin columnas."}>
          <ContextMenuItem disabled={!menu.canHide} onClick={menu.onHide}>
            <EyeOff /> Ocultar columna
          </ContextMenuItem>
        </div>
      </ContextMenuContent>
      </ContextMenu>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Ancho de la columna ${COMPARABLE_COLUMN_LABELS[column.key]}`}
        onPointerDown={startResize}
        onDoubleClick={() => onResize(column.key, defaultColumnLayout().find((item) => item.key === column.key)?.width ?? column.width)}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-primary/40"
      />
    </th>
  );
}

type RowAction = { key: string; label: string; icon: typeof Eye; destructive?: boolean; run: () => void };

/**
 * The firm's comparables as a spreadsheet: the columns the user chose, in
 * their order and width (kept per user in this browser), sorted by a click on
 * the header; rows with alternating colors, a sticky header, a menu and a
 * right click per row, and a selection with actions in bulk.
 */
export function ComparableBaseTable({ items, params, userId, canEdit }: {
  items: ComparableBaseItem[];
  params: ComparableListParams;
  /** Keys the layout per user of the browser. */
  userId: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const storageKey = columnLayoutStorageKey(userId);
  const [layout, setLayout] = useState<ColumnLayout>(defaultColumnLayout);
  const [restored, setRestored] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  // The layout of this user, restored once in the browser, adjusted during render: the server and the hydration
  // render use the default (`isClient` is false there), so nothing mismatches.
  const isClient = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  if (isClient && !restored) {
    setRestored(true);
    setLayout(parseColumnLayout(window.localStorage.getItem(storageKey)));
  }
  useEffect(() => {
    if (restored) window.localStorage.setItem(storageKey, serializeColumnLayout(layout));
  }, [layout, restored, storageKey]);

  const columns = visibleColumns(layout);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) setLayout((current) => moveColumn(current, active.id as ComparableColumn, over.id as ComparableColumn));
  };
  const sortBy = (key: ComparableColumn) => {
    const next = nextColumnSort(key, params.sort);
    if (next) router.push(buildComparableListHref({ ...params, sort: next, page: 1 }));
  };

  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const someSelected = ids.some((id) => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(ids));
  const toggleOne = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const selectedIds = [...selected].filter((id) => ids.includes(id));
  const exportSelectionHref = `/api/comparables/exportar?ids=${encodeURIComponent(selectedIds.join(","))}`;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const duplicate = (item: ComparableBaseItem) => run(async () => {
    const copy = await api.comparableBase.duplicate(item.id);
    toast.success(`Comparable duplicado como ${formatComparableId(copy.folio) ?? "uno nuevo"}.`);
    router.refresh();
  });
  const confirmDelete = () => {
    const targets = deleting ?? [];
    setDeleting(null);
    void run(async () => {
      const outcome = targets.length === 1 ? await api.comparableBase.remove(targets[0]) : await api.comparableBase.removeMany(targets);
      if (outcome.deleted) toast.success(`${outcome.deleted} comparable${outcome.deleted === 1 ? "" : "s"} eliminado${outcome.deleted === 1 ? "" : "s"} de la base.`);
      for (const kept of outcome.kept) {
        toast.info(`${formatComparableId(kept.folio) ?? "Un comparable"} se capturó en el avalúo ${kept.valuationFolio}: se quita desde su mercado.`);
      }
      setSelected(new Set());
      router.refresh();
    });
  };

  const actionsOf = (item: ComparableBaseItem): RowAction[] => [
    { key: "view", label: "Ver", icon: Eye, run: () => router.push(`/comparables/${item.id}`) },
    ...(canEdit ? [
      { key: "edit", label: "Editar", icon: Pencil, run: () => router.push(`/comparables/${item.id}?editar=1`) },
      { key: "duplicate", label: "Duplicar", icon: Copy, run: () => void duplicate(item) },
      { key: "delete", label: "Eliminar", icon: Trash2, destructive: true, run: () => setDeleting([item.id]) },
    ] : []),
  ];

  const totalWidth = FIXED_WIDTH * 2 + columns.reduce((sum, column) => sum + column.width, 0);

  return (
    <div className="grid gap-2" data-comparable-table>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {selectedIds.length ? (
          <div className="flex flex-wrap items-center gap-2 text-sm" role="toolbar" aria-label="Acciones de la selección">
            <span className="font-medium">{selectedIds.length} seleccionado{selectedIds.length === 1 ? "" : "s"}</span>
            <a className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted" href={exportSelectionHref} download>
              <FileSpreadsheet className="size-3.5" /> Exportar selección
            </a>
            {canEdit ? (
              <Button type="button" size="sm" variant="outline" className="h-8 text-destructive" disabled={busy} onClick={() => setDeleting(selectedIds)}>
                <Trash2 data-icon="inline-start" /> Eliminar
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())}>
              <X data-icon="inline-start" /> Quitar selección
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Haz clic en un encabezado para ordenar, arrástralo para moverlo (o clic derecho: «Mover a la izquierda/derecha») y jala su borde para cambiar el ancho. Clic derecho en un renglón para sus acciones.
          </p>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" className="h-8"><Columns3 data-icon="inline-start" /> Columnas</Button>} />
          <DropdownMenuContent align="end">
            <ComparableColumnsMenuItems
              layout={layout}
              onToggle={(key) => setLayout((current) => toggleColumn(current, key))}
              onReset={() => setLayout(defaultColumnLayout())}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative max-h-[70vh] overflow-auto rounded-lg border">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm" style={{ minWidth: totalWidth }}>
            <colgroup>
              <col style={{ width: FIXED_WIDTH }} />
              {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
              <col style={{ width: FIXED_WIDTH }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="sticky top-0 z-10 h-10 border-b bg-background px-2 text-left align-middle">
                  <Checkbox
                    aria-label={allSelected ? "Quitar la selección de la página" : "Seleccionar todos los de la página"}
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <SortableContext items={columns.map((column) => column.key)} strategy={horizontalListSortingStrategy}>
                  {columns.map((column) => (
                    <SortableHead
                      key={column.key}
                      column={column}
                      sort={params.sort}
                      onSort={sortBy}
                      onResize={(key, width) => setLayout((current) => resizeColumn(current, key, width))}
                      menu={{
                        canMoveLeft: canMoveColumnBy(layout, column.key, -1),
                        canMoveRight: canMoveColumnBy(layout, column.key, 1),
                        canHide: columns.length > 1,
                        onMove: (direction) => setLayout((current) => moveColumnBy(current, column.key, direction)),
                        onHide: () => setLayout((current) => toggleColumn(current, column.key)),
                      }}
                    />
                  ))}
                </SortableContext>
                <th scope="col" className="sticky top-0 z-10 h-10 border-b bg-background px-1 align-middle">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-muted/40">
              {items.map((item) => {
                const id = formatComparableId(item.folio);
                const actions = actionsOf(item);
                const isSelected = selected.has(item.id);
                return (
                  <ContextMenu key={item.id}>
                    <ContextMenuTrigger
                      render={(
                        <tr
                          data-comparable-row={id ?? item.id}
                          data-selected={isSelected || undefined}
                          aria-selected={isSelected}
                          className={cn("border-b transition-colors hover:bg-muted/60", isSelected && "bg-primary/5! hover:bg-primary/10!")}
                        />
                      )}
                    >
                      <td className="border-b px-2 py-2 align-middle">
                        <Checkbox aria-label={`Seleccionar ${id ?? item.location}`} checked={isSelected} onCheckedChange={() => toggleOne(item.id)} />
                      </td>
                      {columns.map((column) => (
                        <td key={column.key} data-column={column.key} className={cn("border-b px-2 py-2 align-middle", column.key === "precio" && "text-right")}>
                          {cellOf(column.key, item)}
                        </td>
                      ))}
                      <td className="border-b px-1 py-2 align-middle">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={(
                              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Acciones de ${id ?? item.location}`} disabled={busy}>
                                <MoreHorizontal />
                              </Button>
                            )}
                          />
                          <DropdownMenuContent align="end">
                            {actions.map((action) => (
                              <DropdownMenuItem key={action.key} variant={action.destructive ? "destructive" : "default"} onClick={action.run}>
                                <action.icon /> {action.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      {actions.map((action, index) => (
                        <div key={action.key}>
                          {action.destructive && index > 0 ? <ContextMenuSeparator /> : null}
                          <ContextMenuItem variant={action.destructive ? "destructive" : "default"} onClick={action.run}>
                            <action.icon /> {action.label}
                          </ContextMenuItem>
                        </div>
                      ))}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </tbody>
          </table>
        </DndContext>
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting && deleting.length > 1 ? `¿Eliminar ${deleting.length} comparables de la base?` : "¿Eliminar el comparable de la base?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminan los comparables guardados en la base sin avalúo. Los que se capturaron en un avalúo se conservan: se quitan desde el
              mercado de ese avalúo. Las imágenes no se borran del almacenamiento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction type="button" disabled={busy} onClick={confirmDelete}>
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
