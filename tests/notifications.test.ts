import assert from "node:assert/strict";
import test from "node:test";

import { userPreferencesPatchSchema } from "../src/features/account/user-preferences";
import { lowCreditsText, valuationEventText } from "../src/features/notifications/notification-texts";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  categoryOf,
  formatNotificationTime,
  groupNotificationsByDay,
  markNotificationsReadSchema,
  notificationPreferencesPatchSchema,
  resolveNotificationPreferences,
  safeNotificationLink,
  unreadBadgeLabel,
  wantsNotification,
} from "../src/features/notifications/notification-types";

test("every kind of notice belongs to exactly one group that «Mi cuenta» can turn off", () => {
  const grouped = NOTIFICATION_CATEGORIES.flatMap((category) => category.types as readonly string[]);
  assert.deepEqual([...grouped].sort(), [...NOTIFICATION_TYPES].sort());
  assert.equal(new Set(grouped).size, grouped.length);
  assert.equal(categoryOf("AVALUO_REGRESADO"), "revision");
  assert.equal(categoryOf("CREDITOS_POR_AGOTARSE"), "creditos");
});

test("everything is on until the person turns it off; only an explicit false turns a group off", () => {
  const all = resolveNotificationPreferences(null);
  assert.ok(Object.values(all).every(Boolean));
  assert.deepEqual(resolveNotificationPreferences({ autosaveSeconds: 15 }), all);
  const stored = resolveNotificationPreferences({ notifications: { estados: false, equipo: "no", desconocido: false } });
  assert.equal(stored.estados, false);
  assert.equal(stored.equipo, true, "a value that is not a boolean is on");
  assert.equal(wantsNotification(stored, "AVALUO_CONCLUIDO"), false);
  assert.equal(wantsNotification(stored, "AVALUO_REABIERTO"), false);
  assert.equal(wantsNotification(stored, "AVALUO_ASIGNADO"), true);
});

test("the preferences route accepts the autosave, notification groups or both, and nothing unknown", () => {
  assert.equal(userPreferencesPatchSchema.safeParse({ notifications: { estados: false } }).success, true);
  assert.equal(userPreferencesPatchSchema.safeParse({ autosaveSeconds: 30, notifications: { equipo: true } }).success, true);
  assert.equal(userPreferencesPatchSchema.safeParse({ notifications: { spam: true } }).success, false);
  assert.equal(userPreferencesPatchSchema.safeParse({ notifications: { estados: "false" } }).success, false);
  assert.equal(userPreferencesPatchSchema.safeParse({}).success, false);
  assert.equal(notificationPreferencesPatchSchema.safeParse({}).success, true);
});

test("marking read takes some ids (uuid, up to 100) or all of them", () => {
  assert.equal(markNotificationsReadSchema.safeParse({ all: true }).success, true);
  assert.equal(markNotificationsReadSchema.safeParse({ all: false }).success, false);
  assert.equal(markNotificationsReadSchema.safeParse({ ids: ["0f8fad5b-d9cb-469f-a165-70867728950e"] }).success, true);
  assert.equal(markNotificationsReadSchema.safeParse({ ids: [] }).success, false);
  assert.equal(markNotificationsReadSchema.safeParse({ ids: ["1"] }).success, false);
  assert.equal(markNotificationsReadSchema.safeParse({ ids: Array.from({ length: 101 }, () => "0f8fad5b-d9cb-469f-a165-70867728950e") }).success, false);
});

test("a click only opens pages of the app", () => {
  assert.equal(safeNotificationLink("/workspace?id=abc"), "/workspace?id=abc");
  assert.equal(safeNotificationLink("https://example.test"), null);
  assert.equal(safeNotificationLink("//example.test"), null);
  assert.equal(safeNotificationLink("/\\example.test"), null);
  assert.equal(safeNotificationLink(null), null);
});

test("«Hoy» is the day in Mexico City, newest first", () => {
  // 13 nov 2026, 01:00 in Mexico City is 07:00 UTC.
  const now = new Date("2026-11-13T07:00:00.000Z");
  const items = [
    { id: "a", createdAt: "2026-11-13T06:30:00.000Z" }, // 00:30 today in Mexico
    { id: "b", createdAt: "2026-11-13T05:30:00.000Z" }, // 23:30 yesterday in Mexico, though the 13th in UTC
    { id: "c", createdAt: "2026-11-13T06:50:00.000Z" },
  ];
  const groups = groupNotificationsByDay(items, now);
  assert.deepEqual(groups.today.map((item) => item.id), ["c", "a"]);
  assert.deepEqual(groups.earlier.map((item) => item.id), ["b"]);
});

test("times read as «Hace …» the same day and as a date after", () => {
  const now = new Date("2026-11-13T18:00:00.000Z");
  assert.equal(formatNotificationTime("2026-11-13T17:59:40.000Z", now), "Hace un momento");
  assert.equal(formatNotificationTime("2026-11-13T17:48:00.000Z", now), "Hace 12 min");
  assert.equal(formatNotificationTime("2026-11-13T15:00:00.000Z", now), "Hace 3 h");
  assert.match(formatNotificationTime("2026-11-04T15:15:00.000Z", now), /^4 nov\.?, 9:15/);
  assert.equal(unreadBadgeLabel(3), "3");
  assert.equal(unreadBadgeLabel(12), "9+");
});

test("the texts name the folio, who did it and, when reopened or returned, why", () => {
  assert.deepEqual(valuationEventText("asignado", { folio: "AV-0001", title: "Casa en Zapopan", actorName: "Laura Pérez" }), {
    title: "Te asignaron el avalúo AV-0001",
    body: "Laura Pérez te dejó como responsable de «Casa en Zapopan».",
  });
  assert.equal(
    valuationEventText("reabierto", { folio: "AV-0001", title: "Casa", actorName: "Laura", reason: "Corregir la superficie" }).body,
    "Laura reabrió «Casa»: Corregir la superficie",
  );
  assert.equal(valuationEventText("regresado", { folio: "AV-2", title: "", actorName: "Ana" }).body, "Ana regresó el avalúo.");
  assert.equal(valuationEventText("enviado_revision", { folio: "AV-2", title: "Casa", actorName: "Ana" }).title, "El avalúo AV-2 espera tu revisión");
  assert.equal(lowCreditsText(3).title, "Quedan 3 avalúos disponibles");
  assert.equal(lowCreditsText(1).title, "Queda 1 avalúo disponible");
  assert.equal(lowCreditsText(0).title, "Se agotaron los avalúos disponibles");
});
