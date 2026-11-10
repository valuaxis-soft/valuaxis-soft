import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ATTENTION_LABEL, attentionReasons, buildAttentionList, greetingFor, timeAgo } from "../src/features/dashboard/attention";
import { DashboardHeader } from "../src/features/dashboard/components/header";
import { StatsCards } from "../src/features/dashboard/components/stats-cards";
import { buildNavigation, initialsOf } from "../src/features/dashboard/navigation";
import type { AuthUser } from "../src/features/auth/model";

const base: AuthUser = {
  id: 1,
  name: "Valuador Inventado",
  email: "valuador@example.test",
  role: "VALUADOR",
  permissions: [],
  active: true,
  organizationId: 1,
  organizationName: "Despacho Ficticio",
};

const keys = (items: Array<{ key: string }>) => items.map((item) => item.key);

test("the navigation offers only what the role allows", () => {
  const reader = buildNavigation({ ...base, role: "CONSULTA", permissions: ["AVALUO_VER"] });
  assert.deepEqual(keys(reader.primary), ["dashboard", "avaluos", "comparables"]);
  assert.deepEqual(reader.organization, []);
  assert.equal(reader.canCreateValuation, false);

  const nobody = buildNavigation(base);
  assert.deepEqual(keys(nobody.primary), ["dashboard"], "without AVALUO_VER only the dashboard");

  const admin = buildNavigation({
    ...base,
    role: "ADMINISTRADOR",
    permissions: ["AVALUO_VER", "AVALUO_CREAR", "AVALUO_EDITAR", "USUARIO_ADMINISTRAR", "FACTURACION_VER"],
  });
  assert.deepEqual(keys(admin.primary), ["dashboard", "avaluos", "comparables", "plantillas"]);
  assert.deepEqual(keys(admin.organization), ["equipo", "despacho", "facturacion"]);
  assert.equal(admin.canCreateValuation, true);
  assert.equal(admin.account.href, "/cuenta");

  const billingOnly = buildNavigation({ ...base, permissions: ["SUSCRIPCION_ADMINISTRAR"] });
  assert.deepEqual(keys(billingOnly.organization), ["facturacion"]);

  // Every "g" shortcut is unique.
  const shortcuts = [...admin.primary, ...admin.organization, admin.account].map((item) => item.shortcut);
  assert.equal(new Set(shortcuts).size, shortcuts.length);
});

test("the header marks the current page, groups the firm's settings and offers a skip link", () => {
  const html = renderToString(
    createElement(DashboardHeader, {
      user: { ...base, role: "ADMINISTRADOR", permissions: ["AVALUO_VER", "USUARIO_ADMINISTRAR"] },
      active: "avaluos",
    }),
  );
  assert.match(html, /href="#contenido"[^>]*>Saltar al contenido/);
  assert.match(html, /aria-current="page"[^>]*href="\/avaluos"|href="\/avaluos"[^>]*aria-current="page"/);
  assert.match(html, />Despacho</, "Equipo and Datos del despacho live under Despacho");
  assert.match(html, /Abrir menú/, "the side menu for phones");
  assert.match(html, /Buscar o ir a/);
  assert.doesNotMatch(html, /Plantillas/, "no AVALUO_EDITAR, no Plantillas");
});

test("initials take the first two words", () => {
  assert.equal(initialsOf("Ana Robles Pérez"), "AR");
  assert.equal(initialsOf("  luis "), "L");
  assert.equal(initialsOf(""), "?");
});

const now = new Date("2026-11-09T18:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const candidate = (status: string, days: number, comparables: number) => ({
  id: `${status}-${days}-${comparables}`,
  folio: `F-${status}`,
  title: "Casa inventada",
  client: "",
  status,
  updatedAt: daysAgo(days),
  comparables,
});

test("attention: in review is to conclude, capturing without comparables, drafts idle a month", () => {
  assert.deepEqual(attentionReasons(candidate("en_revision", 1, 3), now), ["to-conclude"]);
  assert.deepEqual(attentionReasons(candidate("en_revision", 1, 0), now), ["to-conclude", "no-comparables"]);
  assert.deepEqual(attentionReasons(candidate("en_edicion", 2, 0), now), ["no-comparables"]);
  assert.deepEqual(attentionReasons(candidate("en_edicion", 30, 4), now), ["stale-draft"]);
  assert.deepEqual(attentionReasons(candidate("en_edicion", 29, 4), now), []);
  assert.deepEqual(attentionReasons(candidate("nuevo", 2, 0), now), [], "a new one is not expected to have comparables yet");
  assert.deepEqual(attentionReasons(candidate("nuevo", 45, 0), now), ["stale-draft"]);
  assert.deepEqual(attentionReasons(candidate("terminado", 90, 0), now), [], "closed work never needs attention");
  assert.deepEqual(attentionReasons(candidate("cancelado", 90, 0), now), []);
  assert.equal(ATTENTION_LABEL["to-conclude"], "Por concluir");
});

test("attention list: to conclude first, then the longest idle, capped", () => {
  const list = buildAttentionList(
    [candidate("en_edicion", 3, 0), candidate("en_edicion", 60, 2), candidate("en_revision", 1, 2), candidate("terminado", 5, 0), candidate("nuevo", 40, 0)],
    now,
    3,
  );
  assert.deepEqual(list.map((item) => item.status), ["en_revision", "en_edicion", "nuevo"]);
  assert.equal(list[1].idleDays, 60);
});

test("greeting and relative dates read in Mexico City time and Spanish", () => {
  assert.equal(greetingFor(new Date("2026-11-09T15:00:00Z")), "Buenos días", "9:00 in Mexico City");
  assert.equal(greetingFor(new Date("2026-11-09T21:00:00Z")), "Buenas tardes", "15:00");
  assert.equal(greetingFor(new Date("2026-11-10T03:00:00Z")), "Buenas noches", "21:00");
  assert.equal(timeAgo(daysAgo(3), now), "hace 3 días");
  assert.equal(timeAgo(daysAgo(1), now), "ayer");
  assert.equal(timeAgo(new Date(now.getTime() - 30_000), now), "justo ahora");
});

test("the portfolio links each status to the filtered list", () => {
  const html = renderToString(createElement(StatsCards, { stats: { total: 3, byStatus: { nuevo: 1, en_revision: 2 } } }));
  assert.match(html, /href="\/avaluos\?estado=en_revision"/);
  assert.match(html, /Total de avalúos/);
});
