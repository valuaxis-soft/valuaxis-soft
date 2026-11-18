/**
 * V7.3-08 (17 nov 2026): after a navigation inside the app (Inicio → avalúo,
 * Comparables Lista → Mapa) the pages rendered a `<style nonce>` with the
 * nonce of the navigation's request, which is not in the document's CSP.
 * Google copies the nonce of the first `<style nonce>` onto its own styles,
 * so in production they were blocked: the card of a pin came out
 * transparent and without its close button, the controls without style.
 * The loader now takes the document's nonce and puts its `<style>` first.
 * tests/e2e/maps-style-nonce.e2e.ts checks it in a browser on a production build.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { MAPS_STYLE_NONCE_ATTRIBUTE, documentNonce, ensureMapsStyleNonce, type NonceDocument } from "../src/features/maps/google-maps-loader";

type FakeElement = {
  tag: string;
  nonce: string;
  attributes: Map<string, string>;
  parent: FakeHead | null;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  remove(): void;
};
type FakeHead = { children: FakeElement[]; readonly firstChild: FakeElement | null; insertBefore(node: FakeElement, before: FakeElement | null): FakeElement };

function element(tag: string, nonce = ""): FakeElement {
  const el: FakeElement = {
    tag,
    nonce,
    attributes: new Map(),
    parent: null,
    setAttribute(name, value) { el.attributes.set(name, value); },
    getAttribute(name) { return el.attributes.get(name) ?? null; },
    hasAttribute(name) { return el.attributes.has(name); },
    remove() {
      if (!el.parent) return;
      el.parent.children = el.parent.children.filter((child) => child !== el);
      el.parent = null;
    },
  };
  // Browsers hide the attribute once the element is in the document; the property keeps it.
  if (nonce) el.attributes.set("nonce", "");
  return el;
}

/** A document whose head holds `children`, in order; querySelector finds the first match in that order. */
function fakeDocument(children: FakeElement[]) {
  const head: FakeHead = {
    children: [],
    get firstChild() { return head.children[0] ?? null; },
    insertBefore(node, before) {
      node.remove();
      node.parent = head;
      const at = before ? head.children.indexOf(before) : -1;
      if (at < 0) head.children.push(node);
      else head.children.splice(at, 0, node);
      return node;
    },
  };
  for (const child of children) head.insertBefore(child, null);
  const doc = {
    head,
    createElement: (tag: string) => element(tag),
    querySelector(selector: string) {
      const match = /^(\w+)\[([\w-]+)\]$/.exec(selector);
      if (!match) throw new Error(`Unsupported selector ${selector}`);
      return head.children.find((child) => child.tag === match[1] && child.attributes.has(match[2])) ?? null;
    },
  };
  return doc as unknown as NonceDocument & { head: FakeHead };
}

test("the document's nonce is the one of the scripts it was served with, not a page's", () => {
  // The page navigated to rendered a style with its request's nonce, after the document's scripts.
  const doc = fakeDocument([element("script", "DOCUMENTO"), element("style", "NAVEGACION")]);
  assert.equal(documentNonce(doc), "DOCUMENTO");
});

test("the first <style nonce> of the document, the one Google copies, carries the document's nonce", () => {
  const stale = element("style", "NAVEGACION");
  const doc = fakeDocument([element("script", "DOCUMENTO"), stale]);
  const style = ensureMapsStyleNonce(doc);
  assert.ok(style);
  const first = doc.querySelector("style[nonce]") as unknown as FakeElement;
  assert.equal(first.nonce, "DOCUMENTO", "Google would copy a nonce the CSP does not allow");
  assert.equal(first.hasAttribute(MAPS_STYLE_NONCE_ATTRIBUTE), true);
  assert.equal(doc.head.firstChild, first);
  // A second map of the same document does not add another one.
  assert.equal(ensureMapsStyleNonce(doc), style);
  assert.equal(doc.head.children.filter((child) => child.hasAttribute(MAPS_STYLE_NONCE_ATTRIBUTE)).length, 1);
});

test("without a nonce in the document (no CSP) nothing is added", () => {
  const doc = fakeDocument([element("script")]);
  assert.equal(ensureMapsStyleNonce(doc), null);
  assert.equal(doc.head.children.length, 1);
});

test("the pages with maps no longer render a <style nonce> of their request", () => {
  for (const page of ["src/app/(private)/workspace/page.tsx", "src/app/(private)/comparables/page.tsx", "src/app/(private)/demo/mapas-k7q2vx/page.tsx"]) {
    assert.doesNotMatch(readFileSync(page, "utf8"), /<style\s+nonce=\{/, page);
  }
});
