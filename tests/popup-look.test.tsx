/**
 * One look for every popup (docs/DISENO.md): Dialog, AlertDialog, the command
 * palette and the side menu share the same surface, overlay and title, and a
 * confirmed deletion is solid red. And the cool paper of the interface never
 * reaches the printed document: a page, its measurement copy and the
 * calculation memory keep the warm neutrals they printed with.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AlertDialogAction } from "../src/components/ui/alert-dialog";
import { POPUP_OVERLAY_CLASS, POPUP_SURFACE_CLASS, POPUP_TITLE_CLASS } from "../src/components/ui/dialog";

test("la ventana emergente lleva la regla de marca, sombra y velo marinos", () => {
  assert.match(POPUP_SURFACE_CLASS, /brand-popup/);
  assert.match(POPUP_SURFACE_CLASS, /shadow-float/);
  assert.match(POPUP_SURFACE_CLASS, /ring-primary\/10/);
  assert.match(POPUP_OVERLAY_CLASS, /bg-primary\/30/);
  assert.match(POPUP_TITLE_CLASS, /font-display/);
  assert.match(POPUP_TITLE_CLASS, /text-primary/);
});

test("la paleta de comandos y el menú lateral usan el mismo velo y superficie", () => {
  const palette = readFileSync("src/features/dashboard/components/command-palette.tsx", "utf8");
  const mobileNav = readFileSync("src/features/dashboard/components/mobile-nav.tsx", "utf8");
  for (const name of ["POPUP_OVERLAY_CLASS", "POPUP_SURFACE_CLASS", "POPUP_TITLE_CLASS"]) assert.match(palette, new RegExp(name));
  assert.match(mobileNav, /POPUP_OVERLAY_CLASS/);
});

test("confirmar un borrado es rojo sólido; confirmar lo demás, azul de marca", () => {
  const destructive = renderToStaticMarkup(<AlertDialogAction variant="destructive">Eliminar</AlertDialogAction>);
  assert.match(destructive, /bg-destructive /);
  assert.match(destructive, /text-destructive-foreground/);
  assert.doesNotMatch(destructive, /bg-destructive\/10/);
  const confirm = renderToStaticMarkup(<AlertDialogAction>Concluir</AlertDialogAction>);
  assert.match(confirm, /bg-brand/);
});

test("el documento conserva el papel cálido aunque la interfaz sea azulada", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const root = css.slice(css.indexOf(":root,"), css.indexOf(".dark {"));
  assert.match(root, /--background: oklch\(0\.984 0\.006 255\)/);
  const pinStart = css.indexOf("article[data-document-page],");
  const pin = css.slice(pinStart, css.indexOf("}", pinStart));
  assert.match(pin, /\[data-print-memory\]/);
  for (const token of [
    "--background: oklch(0.982 0.006 85)",
    "--card: oklch(0.995 0.003 85)",
    "--muted: oklch(0.952 0.009 80)",
    "--muted-foreground: oklch(0.5 0.017 75)",
    "--border: oklch(0.895 0.012 80)",
    "--accent: oklch(0.95 0.025 255)",
  ]) {
    assert.ok(pin.includes(token), `${token} fijado en el documento`);
  }
});
