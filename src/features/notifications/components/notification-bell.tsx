"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { unreadBadgeLabel, type NotificationDto } from "../notification-types";
import { NotificationList } from "./notification-list";
import { useNotifications } from "./use-notifications";

/**
 * The bell in the header: how many notices are unread and, on click, the
 * latest ones grouped «Hoy» / «Anteriores». Opening one marks it read and
 * goes to its valuation or page; «Ver todas» opens the «Notificaciones» page.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data, refresh, markRead } = useNotifications();
  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  const openItem = (item: NotificationDto) => {
    if (!item.read) void markRead({ ids: [item.id] });
    if (item.link) setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void refresh();
      }}
    >
      <PopoverTrigger
        aria-label={unread ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
        data-notification-bell
        className="relative flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted aria-expanded:text-foreground lg:size-10"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread ? (
          <span
            data-notification-count
            className="absolute top-1 right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[11px] leading-none font-semibold text-primary-foreground tabular-nums ring-2 ring-background"
            aria-hidden="true"
          >
            {unreadBadgeLabel(unread)}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-2rem))] gap-0 rounded-xl p-0 shadow-lift">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold">
            Notificaciones
            {unread ? <span className="ml-1.5 hidden font-normal text-muted-foreground tabular-nums sm:inline">{unread} sin leer</span> : null}
          </p>
          <Button variant="ghost" size="sm" disabled={!unread} onClick={() => void markRead({ all: true })} data-mark-all-read>
            <CheckCheck />
            Marcar todas como leídas
          </Button>
        </div>
        <div className="max-h-[min(70vh,30rem)] overflow-y-auto overscroll-contain p-1.5">
          {items.length ? (
            <NotificationList items={items} onOpen={openItem} dense />
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {data ? "No tienes notificaciones. Aquí verás cuando te asignen un avalúo, se concluya o alguien se una al despacho." : "Cargando…"}
            </p>
          )}
        </div>
        <div className="border-t border-border p-1.5">
          <Link
            href="/notificaciones"
            onClick={() => setOpen(false)}
            className="flex h-9 items-center justify-center rounded-lg text-sm font-medium text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Ver todas
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
