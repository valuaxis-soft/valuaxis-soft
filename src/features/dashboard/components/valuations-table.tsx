"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, CircleCheck, Columns3, EyeOff, FileSpreadsheet, GripVertical, MapPin } from "lucide-react";
import { useContext, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { timeAgo } from "@/features/dashboard/attention";
import { ValuationRowActions, type ValuationRowPermissions, type ValuationRowView } from "@/features/dashboard/components/valuation-row-actions";
import { ValuationStatusBadge } from "@/features/dashboard/components/valuation-status-badge";
import {
  VALUATION_COLUMN_LABELS,
  VALUATION_COLUMN_SORT,
  columnsParam,
  defaultColumnWidth,
  defaultValuationColumns,
  moveValuationColumn,
  resizeValuationColumn,
  toggleValuationColumn,
  valuationColumnNeighbor,
  visibleValuationColumns,
  type ValuationColumn,
  type ValuationColumnLayout,
  type ValuationColumnSetting,
} from "@/features/dashboard/valuation-columns";
import { buildValuationSortHref, valuationListQuery, type ValuationListParams } from "@/features/dashboard/valuation-list-params";
import type { ValuationPageItem } from "@/features/valuations/repositories/valuation-list.repository";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });
const dayFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" });

/** "hace 2 días", with the exact date and time on hover. */
function Moment({ date, now }: { date: Date; now?: Date }) {
  return (
    <time dateTime={date.toISOString()} title={dateFormatter.format(date)}>
      {now ? timeAgo(date, now) : dateFormatter.format(date)}
    </time>
  );
}

/** The width of the actions column, which is not in the layout. */
const ACTIONS_WIDTH = 96;
/** «Eliminado», shown only in the trash, after the chosen columns. */
const DELETED_WIDTH = 170;

function StatusCell({ item }: { item: ValuationPageItem }) {
  return (
    <div className="grid justify-items-start gap-0.5">
      <ValuationStatusBadge status={item.status} fallbackName={item.statusName} />
      {item.status === "en_revision" && item.reviewApprovedAt ? (
        <span className="inline-flex items-center gap-1 text-xs text-success-strong" data-review-approved="">
          <CircleCheck className="size-3.5 text-success" aria-hidden="true" />
          Aprobado: listo para concluir
        </span>
      ) : null}
    </div>
  );
}

function cellOf(column: ValuationColumn, item: ValuationPageItem, now: Date | undefined, linkFolio: boolean): ReactNode {
  switch (column) {
    case "folio":
      return linkFolio ? (
        <Link href={`/workspace?id=${item.id}`} className="inline-flex min-h-8 items-center rounded-sm font-medium outline-none hover:text-primary hover:underline hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50">
          {item.folio}
        </Link>
      ) : (
        <span className="font-medium">{item.folio}</span>
      );
    case "titulo":
      return <p className="truncate font-medium" title={item.title}>{item.title || "Sin título"}</p>;
    case "cliente":
      return <p className={cn("truncate", !item.client && "text-muted-foreground/70")} title={item.client}>{item.client || "Sin cliente"}</p>;
    case "ubicacion":
      return item.location ? (
        <p className="flex items-center gap-1.5 truncate text-muted-foreground" title={item.location}>
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{item.location}</span>
        </p>
      ) : (
        <p className="text-muted-foreground/70">Sin ubicación</p>
      );
    case "tipo":
      return <p className="truncate">{item.propertyKindName}</p>;
    case "tipoAvaluo":
      return <p className="truncate">{item.appraisalKindName}</p>;
    case "estado":
      return <StatusCell item={item} />;
    case "valuador":
      return <p className="truncate">{item.appraiserName || "—"}</p>;
    case "creacion":
      return <time dateTime={item.createdAt.toISOString()} className="text-muted-foreground tabular-nums">{dayFormatter.format(item.createdAt)}</time>;
    case "modificacion":
      return <span className="text-muted-foreground"><Moment date={item.updatedAt} now={now} /></span>;
    case "conclusion":
      return item.concludedAt
        ? <time dateTime={item.concludedAt.toISOString()} className="tabular-nums">{dayFormatter.format(item.concludedAt)}</time>
        : <span className="text-muted-foreground/70">—</span>;
    case "version":
      return <span className="font-mono tabular-nums">{`V${item.version}`}</span>;
  }
}

/**
 * A header the user drags to reorder (or its grip with the keyboard), clicks
 * to sort, drags on its edge to widen and right-clicks to move or hide, as in
 * Comparables.
 */
function ColumnHead({ column, params, menu, onResize, onSort }: {
  column: ValuationColumnSetting;
  params: ValuationListParams;
  menu: { canMoveLeft: boolean; canMoveRight: boolean; canHide: boolean; onMove: (direction: -1 | 1) => void; onHide: () => void };
  onResize: (key: ValuationColumn, width: number) => void;
  onSort: (href: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: column.key });
  const sortKey = VALUATION_COLUMN_SORT[column.key];
  const direction = sortKey && params.sort === sortKey ? params.direction : null;
  const sortHref = sortKey ? buildValuationSortHref(params, sortKey) : "";
  const label = VALUATION_COLUMN_LABELS[column.key];
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition, width: column.width };

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
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
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : sortKey ? "none" : undefined}
      data-column={column.key}
      className={cn(
        "group/head sticky top-0 z-10 h-10 border-b bg-background px-1 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground select-none",
        isDragging && "z-20 bg-muted opacity-90",
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger render={<div className="flex h-full cursor-grab items-center gap-0.5 active:cursor-grabbing" data-column-drag={column.key} {...listeners} />}>
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="cursor-grab touch-none rounded p-0.5 text-muted-foreground/40 group-hover/head:text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label={`Mover la columna ${label}`}
            title="Arrastra el encabezado para mover la columna; clic derecho para más opciones"
            {...attributes}
          >
            <GripVertical className="size-3.5" />
          </button>
          {sortKey ? (
            // A button, not a link: a link drags natively and a drag of the header ended as a click that sorted.
            <button
              type="button"
              className={cn("flex min-w-0 flex-1 items-center gap-1 truncate rounded px-1 py-1 text-left outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50", direction && "text-foreground")}
              title={`Ordenar por ${label.toLowerCase()}`}
              onClick={() => onSort(sortHref)}
              data-sort={sortKey}
              data-sort-active={direction ? true : undefined}
              data-href={sortHref}
            >
              <span className="truncate">{label}</span>
              <SortIcon className={cn("size-3.5 shrink-0", direction ? "text-foreground" : "text-muted-foreground/40")} aria-hidden="true" />
            </button>
          ) : (
            <span className="flex-1 truncate px-1 py-1" title="Esta columna no se ordena">{label}</span>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem disabled={!menu.canMoveLeft} onClick={() => menu.onMove(-1)}>
            <ArrowLeft /> Mover a la izquierda
          </ContextMenuItem>
          <ContextMenuItem disabled={!menu.canMoveRight} onClick={() => menu.onMove(1)}>
            <ArrowRight /> Mover a la derecha
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={!menu.canHide} onClick={menu.onHide}>
            <EyeOff /> Ocultar columna
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Ancho de la columna ${label}`}
        onPointerDown={startResize}
        onDoubleClick={() => onResize(column.key, defaultColumnWidth(column.key))}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-primary/40"
      />
    </th>
  );
}

type TableProps = {
  items: ValuationPageItem[];
  /** The current filters and order: with them the headers sort the list and the export reads the same rows. */
  params: ValuationListParams;
  permissions: ValuationRowPermissions;
  /** The person's columns (JPreferencias); the default layout when they never changed them. */
  initialLayout: ValuationColumnLayout;
  /** The moment the list was read: with it the dates read "hace 2 días". */
  now?: Date;
};

/**
 * The layout this tab used last. Sorting or filtering shows the list's
 * loading state, which mounts the table again with the layout the server read
 * before the change was saved: this one wins until the page reloads.
 */
let rememberedLayout: ValuationColumnLayout | null = null;

/** Saves the layout as the person's preference, a moment after the last change (at once if the table goes away first). */
function useSavedLayout(initialLayout: ValuationColumnLayout) {
  const [layout, setLayout] = useState<ValuationColumnLayout>(() => rememberedLayout ?? initialLayout);
  const saved = useRef(JSON.stringify(initialLayout));
  const pending = useRef<ValuationColumnLayout | null>(null);

  const flush = useRef(() => {
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    const serialized = JSON.stringify(next);
    api.preferences.update({ valuationListColumns: { columns: next } })
      .then(() => { saved.current = serialized; })
      .catch(() => toast.error("No se guardaron tus columnas. Se quedan así en esta pestaña; inténtalo de nuevo más tarde."));
  });

  useEffect(() => {
    rememberedLayout = layout;
    if (JSON.stringify(layout) === saved.current) return;
    pending.current = layout;
    const timer = window.setTimeout(flush.current, 700);
    return () => window.clearTimeout(timer);
  }, [layout]);

  useEffect(() => {
    const save = flush.current;
    return () => save();
  }, []);
  return [layout, setLayout] as const;
}

/**
 * The list of valuations as a spreadsheet from md up (the columns the person
 * chose, in their order and width, sorted by a click on the header), cards on
 * a phone. The folio opens the editor; the "···" menu is always there. In the
 * trash the rows do not open: they are restored or deleted for good.
 */
export function ValuationsTable({ items, params, permissions, initialLayout, now }: TableProps) {
  const [layout, setLayout] = useSavedLayout(initialLayout);
  // Inside the app the router sorts without reloading; a static render (tests) has none.
  const router = useContext(AppRouterContext);
  const view: ValuationRowView = params.trash ? "papelera" : params.archived ? "archivados" : "lista";
  const columns = visibleValuationColumns(layout);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) setLayout((current) => moveValuationColumn(current, active.id as ValuationColumn, over.id as ValuationColumn));
  };
  const exportQuery = valuationListQuery(params);
  exportQuery.set("columnas", columnsParam(layout));
  const exportHref = `/api/exportar/avaluos?${exportQuery.toString()}`;
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0) + ACTIONS_WIDTH + (params.trash ? DELETED_WIDTH : 0);
  const linkFolio = view !== "papelera";

  return (
    <>
      <ul className="grid gap-2 md:hidden" aria-label="Avalúos">
        {items.map((item) => (
          <li key={item.id} className="relative flex items-start gap-2 rounded-xl border border-border bg-card p-3 transition-colors duration-150 focus-within:border-ring/50 hover:border-ring/40">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {linkFolio ? (
                  <Link
                    href={`/workspace?id=${item.id}`}
                    className="text-sm font-semibold outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                  >
                    {item.folio}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold">{item.folio}</span>
                )}
                <StatusCell item={item} />
              </div>
              <p className="mt-1 truncate text-sm font-medium">{item.title || "Sin título"}</p>
              <p className="truncate text-sm text-muted-foreground">{item.client || "Sin cliente"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.propertyKindName} · {item.deletedAt ? <>Eliminado <Moment date={item.deletedAt} now={now} /></> : <Moment date={item.updatedAt} now={now} />}
              </p>
            </div>
            <div className="relative z-10 -mt-1 -mr-1">
              <ValuationRowActions id={item.id} folio={item.folio} view={view} permissions={permissions} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden gap-2 md:grid" data-valuation-grid="">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Clic en un encabezado para ordenar; arrástralo para moverlo (clic derecho: más opciones) y jala su borde para el ancho. Tus columnas se guardan en tu cuenta.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" className="h-8"><Columns3 data-icon="inline-start" /> Columnas</Button>} />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
                  {layout.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.key}
                      checked={column.visible}
                      closeOnClick={false}
                      onCheckedChange={() => setLayout((current) => toggleValuationColumn(current, column.key))}
                    >
                      {VALUATION_COLUMN_LABELS[column.key]}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLayout(defaultValuationColumns())}>Restablecer columnas</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <a
              href={exportHref}
              download
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1")}
              title="Descarga en Excel las columnas visibles, con los filtros y el orden de la lista (todas las páginas, hasta 5,000)"
              data-export-excel=""
            >
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              Exportar a Excel
            </a>
          </div>
        </div>

        <div className="relative max-h-[70vh] overflow-auto rounded-lg border">
          <DndContext id="valuation-list-columns" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm" style={{ minWidth: totalWidth }}>
              <colgroup>
                {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
                {params.trash ? <col style={{ width: DELETED_WIDTH }} /> : null}
                <col style={{ width: ACTIONS_WIDTH }} />
              </colgroup>
              <thead>
                <tr>
                  <SortableContext items={columns.map((column) => column.key)} strategy={horizontalListSortingStrategy}>
                    {columns.map((column) => (
                      <ColumnHead
                        key={column.key}
                        column={column}
                        params={params}
                        onResize={(key, width) => setLayout((current) => resizeValuationColumn(current, key, width))}
                        onSort={(href) => (router ? router.push(href) : window.location.assign(href))}
                        menu={{
                          canMoveLeft: valuationColumnNeighbor(layout, column.key, -1) !== null,
                          canMoveRight: valuationColumnNeighbor(layout, column.key, 1) !== null,
                          canHide: columns.length > 1,
                          onMove: (direction) => setLayout((current) => {
                            const neighbor = valuationColumnNeighbor(current, column.key, direction);
                            return neighbor ? moveValuationColumn(current, column.key, neighbor) : current;
                          }),
                          onHide: () => setLayout((current) => toggleValuationColumn(current, column.key)),
                        }}
                      />
                    ))}
                  </SortableContext>
                  {params.trash ? (
                    <th scope="col" className="sticky top-0 z-10 h-10 border-b bg-background px-2 text-left align-middle text-xs font-medium text-muted-foreground">
                      <Link href={buildValuationSortHref(params, "eliminacion")} className="hover:text-foreground">Eliminado</Link>
                    </th>
                  ) : null}
                  <th scope="col" className="sticky top-0 z-10 h-10 border-b bg-background px-1 align-middle">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-muted/40">
                {items.map((item) => (
                  <tr key={item.id} className="group/row h-14 transition-colors duration-150 hover:bg-muted/60" data-valuation-row={item.folio}>
                    {columns.map((column) => (
                      <td key={column.key} data-column={column.key} className="border-b px-2 py-2 align-middle">
                        {cellOf(column.key, item, now, linkFolio)}
                      </td>
                    ))}
                    {params.trash ? (
                      <td className="border-b px-2 py-2 align-middle text-muted-foreground">
                        {item.deletedAt ? <Moment date={item.deletedAt} now={now} /> : "—"}
                      </td>
                    ) : null}
                    <td className="border-b px-1 py-2 text-right align-middle">
                      <div className="inline-flex items-center gap-1">
                        {linkFolio ? (
                          <Link
                            href={`/workspace?id=${item.id}`}
                            aria-label={`Abrir avalúo ${item.folio}`}
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "gap-1 rounded-lg transition-opacity duration-150 focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100",
                            )}
                          >
                            Abrir
                            <ArrowRight className="size-3.5" aria-hidden="true" />
                          </Link>
                        ) : null}
                        <ValuationRowActions id={item.id} folio={item.folio} view={view} permissions={permissions} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DndContext>
        </div>
      </div>
    </>
  );
}
