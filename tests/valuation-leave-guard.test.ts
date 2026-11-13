import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { exitDialogDescription, leavingLinkHref } from "../src/features/valuations/components/workspace/model/navigation-guard";

const location = { origin: "https://valuaxissoft.com", pathname: "/workspace", search: "?id=abc" };
const click = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const anchor = (href: string, attributes: { target?: string; download?: boolean } = {}) => ({
  href: new URL(href, location.origin).href,
  target: attributes.target ?? "",
  hasAttribute: (name: string) => name === "download" && Boolean(attributes.download),
});

test("a link of the app that leaves the editor is held while there are changes not saved (V6.2-09)", () => {
  assert.equal(leavingLinkHref(click, anchor("/dashboard"), location), "/dashboard");
  assert.equal(leavingLinkHref(click, anchor("/cuenta#autoguardado"), location), "/cuenta#autoguardado");
  assert.equal(leavingLinkHref(click, anchor("/workspace?id=otro"), location), "/workspace?id=otro", "another valuation leaves this one");
});

test("what does not leave the editor is not held", () => {
  assert.equal(leavingLinkHref(click, null, location), null);
  assert.equal(leavingLinkHref(click, anchor("/workspace?id=abc#anexo"), location), null, "a jump within the page");
  assert.equal(leavingLinkHref(click, anchor("/dashboard", { target: "_blank" }), location), null, "another tab");
  assert.equal(leavingLinkHref(click, anchor("/api/archivo.pdf", { download: true }), location), null, "a download");
  assert.equal(leavingLinkHref({ ...click, ctrlKey: true }, anchor("/dashboard"), location), null, "Ctrl+clic opens a tab");
  assert.equal(leavingLinkHref({ ...click, metaKey: true }, anchor("/dashboard"), location), null);
  assert.equal(leavingLinkHref({ ...click, button: 1 }, anchor("/dashboard"), location), null, "the middle button");
  assert.equal(leavingLinkHref({ ...click, defaultPrevented: true }, anchor("/dashboard"), location), null);
  assert.equal(leavingLinkHref(click, anchor("https://www.google.com/maps"), location), null, "another site: beforeunload asks");
});

test("the exit dialog says where the appraiser was going", () => {
  assert.match(exitDialogDescription({ kind: "push", href: "/dashboard" }), /guardarlos y volver al dashboard, salir sin guardar o seguir editando/);
  assert.match(exitDialogDescription({ kind: "back" }), /guardarlos y salir del avalúo/);
  assert.match(exitDialogDescription({ kind: "push", href: "/comparables" }), /^Si sales ahora se pierden los cambios que no se han guardado\./);
});

test("the editor guards the browser's Atrás, the app's links and closing the tab, and offers the three choices", () => {
  const hook = readFileSync("src/features/valuations/components/workspace/hooks/use-valuation-save.ts", "utf8");
  assert.match(hook, /addEventListener\("beforeunload"/, "closing or reloading the tab");
  assert.match(hook, /addEventListener\("popstate"/, "the browser's or the installed app's Atrás");
  assert.match(hook, /history\.pushState\(window\.history\.state, "", window\.location\.href\)/, "a copy of the page on top of the history");
  assert.match(hook, /document\.addEventListener\("click", listener, true\)/, "links, before the router sees them");
  const dialogs = readFileSync("src/features/valuations/components/workspace/valuation-workspace-dialogs.tsx", "utf8");
  assert.match(dialogs, /Seguir editando/);
  assert.match(dialogs, /Salir sin guardar/);
  assert.match(dialogs, /Guardar y salir/);
});
