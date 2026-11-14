"use client";

import Link from "next/link";
import {
  BadgeCheck,
  BadgeX,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  FileUser,
  RotateCcw,
  Undo2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNotificationTime, groupNotificationsByDay, type NotificationDto, type NotificationType } from "../notification-types";

const TYPE_ICON: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  MIEMBRO_NUEVO: { icon: UserPlus, tone: "bg-primary/10 text-primary" },
  AVALUO_ASIGNADO: { icon: FileUser, tone: "bg-primary/10 text-primary" },
  AVALUO_CONCLUIDO: { icon: CheckCircle2, tone: "bg-success/15 text-success-strong" },
  AVALUO_REABIERTO: { icon: RotateCcw, tone: "bg-chart-4/15 text-chart-4" },
  AVALUO_EN_REVISION: { icon: ClipboardCheck, tone: "bg-primary/10 text-primary" },
  AVALUO_APROBADO: { icon: CheckCircle2, tone: "bg-success/15 text-success-strong" },
  AVALUO_REGRESADO: { icon: Undo2, tone: "bg-highlight/15 text-highlight-strong" },
  CREDITOS_POR_AGOTARSE: { icon: Coins, tone: "bg-highlight/15 text-highlight-strong" },
  ACREDITACION_APROBADA: { icon: BadgeCheck, tone: "bg-success/15 text-success-strong" },
  ACREDITACION_RECHAZADA: { icon: BadgeX, tone: "bg-destructive/10 text-destructive" },
};

/**
 * The notices grouped in «Hoy» and «Anteriores», newest first. An unread one
 * has a dot and a tinted background. One with a page is a link to it (it can
 * open in another tab); a click also calls `onOpen`, which marks it read.
 */
export function NotificationList({
  items,
  onOpen,
  dense = false,
}: {
  items: readonly NotificationDto[];
  onOpen: (item: NotificationDto) => void;
  /** In the bell's panel: tighter rows. */
  dense?: boolean;
}) {
  const now = new Date();
  const groups = groupNotificationsByDay(items, now);
  return (
    <div className="grid gap-3" data-notification-list>
      {(
        [
          ["Hoy", groups.today],
          ["Anteriores", groups.earlier],
        ] as const
      ).map(([label, group]) =>
        group.length ? (
          <section key={label} aria-label={label}>
            <h3 className="px-2 pb-1 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</h3>
            <ul className="grid gap-0.5">
              {group.map((item) => {
                const { icon: Icon, tone } = TYPE_ICON[item.type];
                const rowProps = {
                  onClick: () => onOpen(item),
                  "data-notification": item.type,
                  "data-unread": item.read ? undefined : "",
                  className: cn(
                    "flex w-full items-start gap-3 rounded-lg text-left transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    dense ? "px-2 py-2" : "px-3 py-3",
                    !item.read && "bg-primary/[0.04]",
                  ),
                };
                const content = (
                  <>
                      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", tone)} aria-hidden="true">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm text-pretty", item.read ? "font-normal" : "font-semibold")}>
                          {item.title}
                          {item.read ? null : <span className="sr-only"> (sin leer)</span>}
                        </span>
                        {item.body ? (
                          <span className={cn("mt-0.5 block text-sm text-pretty text-muted-foreground", dense && "line-clamp-2")}>{item.body}</span>
                        ) : null}
                        <time dateTime={item.createdAt} suppressHydrationWarning className="mt-1 block text-xs text-muted-foreground tabular-nums">
                          {formatNotificationTime(item.createdAt, now)}
                        </time>
                      </span>
                      {item.read ? null : <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.link ? (
                      <Link href={item.link} {...rowProps}>
                        {content}
                      </Link>
                    ) : (
                      <button type="button" {...rowProps}>
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
