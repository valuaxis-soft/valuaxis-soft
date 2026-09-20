import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { DashboardHeader } from "../src/features/dashboard/components/header";
import { ValuationNavigation } from "../src/features/valuations/components/workspace/valuation-navigation";
import { Tabs } from "../src/components/ui/tabs";
import type { AuthUser } from "../src/features/auth/model";
import type { AppSection } from "../src/features/valuations/model";

const user: AuthUser = {
  id: 1,
  name: "Usuario Prueba",
  email: "usuario@example.test",
  role: "ADMINISTRADOR",
  active: true,
  organizationId: 1,
  organizationName: "Organizacion Prueba",
};

const availableSection: AppSection = {
  id: "datos",
  label: "1",
  title: "Datos",
  sourceFile: "datos",
  enabled: true,
  required: false,
  blocks: [],
};

test("dashboard user menu trigger keeps dropdown trigger data slot on server render", () => {
  const html = renderToString(createElement(DashboardHeader, { user }));

  assert.match(html, /data-slot="dropdown-menu-trigger"/);
  assert.doesNotMatch(html, /data-slot="button"[^>]*Usuario Prueba/);
});

test("valuation navigation renders fixed sections without an add trigger", () => {
  const html = renderToString(
    createElement(
      Tabs,
      { value: "datos" },
      createElement(ValuationNavigation, {
        activeSectionId: "datos",
        enabledSections: [availableSection],
        iconMap: {},
        onReorder: () => {},
        readOnly: true,
      }),
    ),
  );

  assert.match(html, /Datos/);
  assert.doesNotMatch(html, /Agregar seccion/);
});
