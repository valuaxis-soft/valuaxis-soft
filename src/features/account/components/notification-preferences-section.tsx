"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api, SessionExpiredError } from "@/lib/api-client";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationPreferences,
} from "@/features/notifications/notification-types";

/** «Notificaciones» in the user's account: which notices reach their bell, one switch per group. */
export function NotificationPreferencesSection({ initial }: { initial: NotificationPreferences }) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(initial);
  const [busy, setBusy] = useState<NotificationCategory | null>(null);

  const change = async (key: NotificationCategory, on: boolean) => {
    const previous = preferences;
    setPreferences({ ...preferences, [key]: on });
    setBusy(key);
    try {
      const saved = await api.preferences.update({ notifications: { [key]: on } });
      setPreferences(saved.notifications);
      const label = NOTIFICATION_CATEGORIES.find((category) => category.key === key)?.label ?? "";
      toast.success(on ? `Te llegarán las notificaciones de «${label}».` : `Ya no te llegarán las notificaciones de «${label}».`);
    } catch (error) {
      setPreferences(previous);
      toast.error(
        error instanceof SessionExpiredError
          ? "Tu sesión expiró. Vuelve a iniciar sesión."
          : error instanceof Error ? error.message : "No se pudo guardar la preferencia.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card id="notificaciones" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-5" />
          Notificaciones
        </CardTitle>
        <CardDescription>
          Qué avisos llegan a la campana del encabezado. Lo que apagues deja de llegarte desde ahora; lo que ya recibiste se queda.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1">
        {NOTIFICATION_CATEGORIES.map((category) => (
          <div key={category.key} className="flex items-start gap-3 rounded-lg px-1 py-2" data-notification-preference={category.key}>
            <Checkbox
              id={`notificaciones-${category.key}`}
              checked={preferences[category.key]}
              disabled={busy === category.key}
              onCheckedChange={(checked) => void change(category.key, checked === true)}
              className="mt-0.5"
            />
            <div className="grid gap-0.5">
              <Label htmlFor={`notificaciones-${category.key}`} className="text-sm font-medium">
                {category.label}
              </Label>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
