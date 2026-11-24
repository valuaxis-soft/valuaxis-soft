/**
 * 24 Nov 2026: scrolling the «Ficha del comparable» with the wheel, the map of
 * «Ubicación» zoomed when the pointer crossed it instead of the dialog
 * scrolling. The guard runs ahead of Leaflet's wheel handler on the container.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { guardWheelZoom } from "../src/features/valuations/comparable-base/components/wheel-zoom-guard";

function wheel(keys: { ctrlKey?: boolean; metaKey?: boolean } = {}) {
  return Object.assign(new Event("wheel", { cancelable: true }), keys);
}

function setup() {
  const container = new EventTarget();
  let blocked = 0;
  const release = guardWheelZoom(container, () => { blocked += 1; });
  // Stands for Leaflet's scrollWheelZoom, registered after the guard on the same element.
  let zoomed = 0;
  container.addEventListener("wheel", () => { zoomed += 1; });
  return { container, release, counts: () => ({ zoomed, blocked }) };
}

test("the wheel over the map scrolls the page and shows the hint; it does not zoom", () => {
  const { container, counts } = setup();
  const event = wheel();
  container.dispatchEvent(event);
  assert.deepEqual(counts(), { zoomed: 0, blocked: 1 });
  assert.equal(event.defaultPrevented, false, "the page or the dialog still scrolls");
});

test("Ctrl or ⌘ with the wheel zooms the map", () => {
  const { container, counts } = setup();
  container.dispatchEvent(wheel({ ctrlKey: true }));
  container.dispatchEvent(wheel({ metaKey: true }));
  assert.deepEqual(counts(), { zoomed: 2, blocked: 0 });
});

test("after a click on the map the wheel zooms, until the pointer leaves it", () => {
  const { container, counts } = setup();
  container.dispatchEvent(new Event("pointerdown"));
  container.dispatchEvent(wheel());
  assert.deepEqual(counts(), { zoomed: 1, blocked: 0 });
  container.dispatchEvent(new Event("pointerleave"));
  container.dispatchEvent(wheel());
  assert.deepEqual(counts(), { zoomed: 1, blocked: 1 });
});

test("released, the map takes the wheel as Leaflet does by itself", () => {
  const { container, release, counts } = setup();
  release();
  container.dispatchEvent(wheel());
  assert.deepEqual(counts(), { zoomed: 1, blocked: 0 });
});
