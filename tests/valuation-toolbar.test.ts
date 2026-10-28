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
import {
  SECTION_DRAG_ACTIVATION,
  isPinnedSection,
  sectionCollisionDetection,
} from "../src/features/valuations/components/workspace/section-dnd-container";

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
    onCalculationMemory: noop,
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

test("el toolbar entrega los callbacks existentes a las acciones", () => {
  const onExit = () => {};
  const onSave = () => {};
  const onExport = () => {};
  const onCalculationMemory = () => {};
  const tree = ValuationTopBar({ ...topBarProps(), onExit, onSave, onExport, onCalculationMemory });
  const buttons = elements(tree).filter((element) => element.type === Button);

  assert.equal(buttons.find((button) => button.props["aria-label"] === "Volver al dashboard")?.props.onClick, onExit);
  assert.equal(buttons.find((button) => button.props.onClick === onSave)?.props.onClick, onSave);
  assert.equal(buttons.find((button) => button.props.onClick === onExport)?.props.onClick, onExport);
  // The calculation memory sits beside "Generar avalúo".
  assert.equal(buttons.find((button) => button.props.onClick === onCalculationMemory)?.props.disabled, false);
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

/** A strip 300 px wide over six tabs of 100 px, scrolled by `scrollLeft`. */
function strip(scrollLeft: number) {
  const calls: ScrollToOptions[] = [];
  const tabs = [0, 1, 2, 3, 4, 5].map((index) => ({
    getBoundingClientRect: () => ({ left: index * 100 - scrollLeft, right: index * 100 + 100 - scrollLeft }),
  }));
  const container = {
    clientWidth: 300,
    scrollBy: (options: ScrollToOptions) => calls.push(options),
    getBoundingClientRect: () => ({ left: 0, right: 300 }),
    querySelectorAll: () => tabs,
  };
  return { calls, container: container as unknown as Parameters<typeof scrollSectionContainer>[0] };
}

test("las flechas traen solo la siguiente pestaña oculta de ese lado, sin saltarse ninguna", () => {
  const { calls, container } = strip(150);
  scrollSectionContainer(container, 1);
  scrollSectionContainer(container, -1);
  // Scrolled 150 px: the fifth tab (250-350 on screen) is cut on the right, the second (-50-50) on the left.
  assert.deepEqual(calls, [
    { left: 58, behavior: "smooth" },
    { left: -58, behavior: "smooth" },
  ]);
});

test("pasada la última pestaña, la flecha avanza media barra", () => {
  const { calls, container } = strip(300);
  scrollSectionContainer(container, 1);
  assert.deepEqual(calls, [{ left: 150, behavior: "smooth" }]);
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

function renderTopBar(overrides: Partial<ComponentProps<typeof ValuationTopBar>> = {}) {
  return renderToStaticMarkup(
    createElement(Tabs, { defaultValue: sections[0].id }, createElement(ValuationTopBar, { ...topBarProps(), ...overrides })),
  );
}

/** Markup of the radiogroup with the given accessible name. */
function radioGroup(html: string, label: string) {
  const start = html.indexOf(`role="radiogroup" aria-label="${label}"`);
  assert.ok(start >= 0, `missing radiogroup ${label}`);
  const end = html.indexOf("</div>", start);
  return html.slice(start, end);
}

function checkedValues(groupHtml: string) {
  return [...groupHtml.matchAll(/<input type="radio"[^>]*?checked=""[^>]*?value="([^"]+)"/g)].map((match) => match[1]);
}

test("el selector de modo de escritorio usa radios nativos siempre visibles", () => {
  const html = renderTopBar({ workspaceMode: "preview" });
  const group = radioGroup(html, "Modo de vista del espacio de trabajo");
  assert.equal((group.match(/<input type="radio"/g) ?? []).length, 3);
  assert.deepEqual(checkedValues(group), ["preview"]);
  assert.match(group, /Solo formulario/);
  assert.match(group, /Formulario y vista/);
  assert.match(group, /Solo vista/);
  assert.doesNotMatch(group, /opacity-0/);
});

test("el diseño dividido solo aparece en modo split y dentro del bloque de escritorio", () => {
  assert.doesNotMatch(renderTopBar({ workspaceMode: "form" }), /Diseño de formulario y vista/);
  const html = renderTopBar({ workspaceMode: "split", splitLayout: "vertical" });
  const group = radioGroup(html, "Diseño de formulario y vista");
  assert.deepEqual(checkedValues(group), ["vertical"]);
  assert.match(group, /Vista en 2 pantallas/);
  // The desktop-only wrapper (hidden below lg) holds both desktop selectors.
  const desktopWrapper = html.lastIndexOf('class="hidden flex-none items-center gap-2 pl-1 lg:flex"', html.indexOf("Diseño de formulario y vista"));
  assert.ok(desktopWrapper >= 0);
});

test("en pantallas chicas hay un conmutador Editar / Vista previa", () => {
  for (const [mode, expected] of [["form", "form"], ["split", "form"], ["preview", "preview"]] as const) {
    const group = radioGroup(renderTopBar({ workspaceMode: mode }), "Vista del avalúo");
    assert.match(group, /Editar/);
    assert.match(group, /Vista previa/);
    assert.doesNotMatch(group, /2 pantallas/);
    assert.deepEqual(checkedValues(group), [expected]);
  }
});

test("en pantallas chicas Guardar sigue visible y lo secundario va al menú de acciones", () => {
  const html = renderTopBar();
  assert.match(html, /class="ml-auto flex flex-none items-center gap-2 lg:hidden"/);
  assert.match(html, /aria-label="Más acciones"/);
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-label="Guardar cambios"/);
  assert.match(renderTopBar({ saveStatus: "dirty" }), /aria-label="Guardar cambios pendientes"/);

  // One Guardar for small screens (icon + aria-label) and the desktop one.
  const onSave = () => {};
  const tree = ValuationTopBar({ ...topBarProps(), onSave });
  const saveButtons = elements(tree).filter((element) => element.type === Button && element.props.onClick === onSave);
  assert.equal(saveButtons.length, 2);
  assert.ok(saveButtons.some((button) => button.props["aria-label"] === "Guardar cambios"));
});

test("las pestañas de sección conservan su semántica de tab y describen el arrastre", () => {
  const html = renderTopBar();
  assert.match(html, /role="tab"/);
  assert.doesNotMatch(html, /role="button"[^>]*data-slot="tabs-trigger"/);
  assert.match(html, /aria-roledescription="sortable"/);
  const readOnlyHtml = renderTopBar({ readOnly: true });
  assert.doesNotMatch(readOnlyHtml, /aria-roledescription="sortable"/);
  assert.doesNotMatch(readOnlyHtml, /data-slot="tabs-trigger"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-slot="tabs-trigger"/);
});

test("el arrastre de secciones se activa con mouse, toque prolongado y teclado", () => {
  assert.deepEqual(SECTION_DRAG_ACTIVATION.mouse, { distance: 8 });
  assert.ok(SECTION_DRAG_ACTIVATION.touch.delay >= 200);
  assert.ok(SECTION_DRAG_ACTIVATION.touch.tolerance > 0);
  // Enter keeps selecting the tab; Space picks it up.
  assert.deepEqual(SECTION_DRAG_ACTIVATION.keyboardCodes.start, ["Space"]);
  assert.ok(SECTION_DRAG_ACTIVATION.keyboardCodes.cancel.includes("Escape"));
});

test("la carátula se queda primera: su pestaña no se arrastra ni recibe otra antes", () => {
  assert.equal(isPinnedSection("caratula", 0), true);
  assert.equal(isPinnedSection("caratula", 4), false, "una carátula guardada en otro lugar se puede regresar");
  assert.equal(isPinnedSection("datos", 0), false);
  const html = renderTopBar();
  const caratulaTab = /<button[^>]*data-slot="tabs-trigger"[^>]*>(?:(?!<\/button>).)*CARATULA/.exec(html)?.[0] ?? "";
  assert.ok(caratulaTab, "la pestaña de la carátula se pinta");
  assert.doesNotMatch(caratulaTab, /aria-roledescription="sortable"|cursor-grab/);
  assert.match(html, /aria-roledescription="sortable"/, "las demás se siguen ordenando");
});

test("soltar la pestaña lejos de la barra no la mueve; sobre otra pestaña, sí", () => {
  const rect = (left: number) => ({ left, right: left + 100, top: 0, bottom: 30, width: 100, height: 30 });
  const droppableRects = new Map([["datos", rect(0)], ["terreno", rect(110)]]);
  const droppableContainers = [...droppableRects.keys()].map((id) => ({ id, rect: { current: droppableRects.get(id) } }));
  const args = (pointerCoordinates: { x: number; y: number } | null) => ({
    active: { id: "costos" }, collisionRect: rect(400), droppableRects, droppableContainers, pointerCoordinates,
  }) as unknown as Parameters<typeof sectionCollisionDetection>[0];
  assert.deepEqual(sectionCollisionDetection(args({ x: 600, y: 500 })).map((item) => item.id), [], "sobre la vista previa");
  assert.deepEqual(sectionCollisionDetection(args({ x: 150, y: 10 })).map((item) => item.id), ["terreno"]);
  assert.equal(sectionCollisionDetection(args(null)).length > 0, true, "con el teclado, la más cercana");
});
