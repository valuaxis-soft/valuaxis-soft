import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DictamenPages } from "../src/features/valuations/components/dictamen/valuation-dictamen";

const classesOf = (markup: string) => (markup.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);

test("the column of dictamen pages is an upright page wide in print, so a landscape page does not shrink the PDF", () => {
  const classes = classesOf(renderToStaticMarkup(createElement(DictamenPages, null, "páginas")));
  // On screen it grows with its widest page, so a landscape page scrolls sideways.
  assert.ok(classes.includes("w-fit"));
  // In print it must not: Chromium scaled every page to 816/1056 (≈77 %) to fit a column 1056 px wide.
  assert.ok(classes.includes("print:w-full"), classes.join(" "));
  assert.ok(!classes.some((name) => /^print:(w-(fit|max)|min-w-(fit|max))$/.test(name)));
});

test("a landscape page prints on a Letter sheet lying on its side, the others upright", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /@page\s*\{\s*size:\s*letter;\s*margin:\s*0;/);
  assert.match(css, /@page landscape\s*\{\s*size:\s*letter landscape;\s*margin:\s*0;/);
  assert.match(css, /article\[data-page-orientation="landscape"\]\s*\{\s*page:\s*landscape;/);
});
