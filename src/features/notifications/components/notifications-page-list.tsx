"use client";

import Link from "next/link";
import { CheckCheck, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/features/dashboard/components/empty-state";
import { NOTIFICATION_RETENTION_DAYS, type NotificationDto, type NotificationListDto } from "../notification-types";
import { NotificationList } from "./notification-list";
import { useNotifications } from "./use-notifications";

/** The «Notificaciones» page: the same notices as the bell, with room to read them. */
export function NotificationsPageList({ initial }: { initial: NotificationListDto }) {
  const { data, markRead } = useNotifications(initial);
  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  const openItem = (item: NotificationDto) => {
    if (!item.read) void markRead({ ids: [item.id] });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums" data-unread-summary>
          {unread ? `${unread} sin leer` : "Todo leído"} · se guardan {NOTIFICATION_RETENTION_DAYS} días
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" render={<Link href="/cuenta#notificaciones" />} nativeButton={false}>
            <Settings2 />
            Elegir qué me llega
          </Button>
          <Button variant="outline" size="sm" disabled={!unread} onClick={() => void markRead({ all: true })} data-mark-all-read>
            <CheckCheck />
            Marcar todas como leídas
          </Button>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-2 sm:p-3">
        {items.length ? (
          <NotificationList items={items} onOpen={openItem} />
        ) : (
          <EmptyState
            illustration="all-clear"
            title="No tienes notificaciones"
            description="Aquí verás cuando te asignen un avalúo, cuando se concluya o reabra uno tuyo, cuando alguien se una al despacho y cuando se resuelva tu acreditación."
          />
        )}
      </div>
    </div>
  );
}
