import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LucideIcon } from "lucide-react";

import { Button } from "../src/components/ui/button";
import { Tabs } from "../src/components/ui/tabs";
import { createInitialSections } from "../src/features/valuations/sections";
import { initialMeta } from "../src/features/valuations/services/valuation-constants";
import {
  scrollSectionContainer,
  ValuationNavigation,
} from "../src/features/valuations/components/workspace/valuation-navigation";
import { ValuationTopBar } from "../src/features/valuations/components/workspace/valuation-top-bar";

const sections = createInitialSections();
const iconMap: Record<string, LucideIcon> = {};
const noop = () => {};

function topBarProps(
  saveStatus: "idle" | "dirty" | "saving" | "saved" | "error" = "idle",
): ComponentProps<typeof ValuationTopBar> {
  return {
    activeSectionId: sections[0].id,
    canEdit: true,
    canExport: true,
    enabledSections: sections,
    iconMap,
    meta: { ...initialMeta, folio: "VLO-0001" },
    onExport: noop,
    onExit: noop,
    onReorderSections: noop,
    onRedo: noop,
    onSave: noop,
    onUndo: noop,
    onWorkspaceModeChange: noop,
    readOnly: false,
    redoAvailable: false,
    saving: saveStatus === "saving",
    saveStatus,
    undoAvailable: false,
    valuationId: "valuation-1",
    workspaceMode: "form",
  };
}

function elements(node: ReactNode): Array<React.ReactElement<Record<string, unknown>>> {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const descendants = Children.toArray(node.props.children as ReactNode).flatMap(elements);
  return [node, ...descendants];
}

test("el toolbar entrega los callbacks existentes a las tres acciones", () => {
  const onExit = () => {};
  const onSave = () => {};
  const onExport = () => {};
  const tree = ValuationTopBar({ ...topBarProps(), onExit, onSave, onExport });
  const buttons = elements(tree).filter((element) => element.type === Button);

  assert.equal(buttons.find((button) => button.props["aria-label"] === "Volver al dashboard")?.props.onClick, onExit);
  assert.equal(buttons.find((button) => button.props.onClick === onSave)?.props.onClick, onSave);
  assert.equal(buttons.find((button) => button.props.onClick === onExport)?.props.onClick, onExport);
});

test("dirty y error conservan el estado azul y el intercambio de copy por hover", () => {
  for (const status of ["dirty", "error"] as const) {
    const html = renderToStaticMarkup(
      createElement(Tabs, { defaultValue: sections[0].id }, createElement(ValuationTopBar, topBarProps(status))),
    );
    assert.match(html, /VLO-0001/);
    assert.match(html, /Cambios pendientes/);
    assert.match(html, /Guardar cambios/);
    assert.match(html, /group\/save/);
    assert.match(html, /bg-primary/);
  }
});

test("las flechas desplazan el contenedor en ambas direcciones", () => {
  const calls: ScrollToOptions[] = [];
  const container = { scrollBy: (options: ScrollToOptions) => calls.push(options) };
  scrollSectionContainer(container as Pick<HTMLDivElement, "scrollBy">, -1);
  scrollSectionContainer(container as Pick<HTMLDivElement, "scrollBy">, 1);
  assert.deepEqual(calls, [
    { left: -280, behavior: "smooth" },
    { left: 280, behavior: "smooth" },
  ]);
});

test("la navegación renderiza secciones y controles horizontales dentro de Tabs", () => {
  const html = renderToStaticMarkup(
    createElement(
      Tabs,
      { defaultValue: sections[0].id },
      createElement(ValuationNavigation, {
        activeSectionId: sections[0].id,
        enabledSections: sections,
        iconMap,
        onReorder: noop,
        readOnly: false,
      }),
    ),
  );
  assert.match(html, /Desplazar secciones a la izquierda/);
  assert.match(html, /Desplazar secciones a la derecha/);
  assert.match(html, /overflow-x-auto/);
  assert.match(html, /CARATULA/);
});
