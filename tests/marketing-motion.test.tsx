import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroMockup } from "../src/features/marketing/components/hero-mockup";
import { Odometer } from "../src/features/marketing/components/odometer";
import { HERO_CYCLE, HERO_LAST_STEP, heroFrame } from "../src/features/marketing/hero-cycle";

const WORDS = 64;

test("the odometer renders the final value for screen readers and one 0–9 strip per digit", () => {
  const html = renderToStaticMarkup(<Odometer value="$3,482,000.00" />);
  assert.match(html, /<span class="sr-only">\$3,482,000\.00<\/span>/);
  assert.equal(html.match(/class="vx-odo-strip"/g)?.length, 9);
  // Each strip sits on its digit by default, so without JavaScript the figure reads right.
  assert.match(html, /--vx-digit:3/);
  assert.match(html, /<span aria-hidden="true">/);
});

test("the hero mockup renders finished: full amount in words and the pause button hidden", () => {
  const html = renderToStaticMarkup(<HeroMockup />);
  assert.match(html, /data-vx-typed="">\(TRES MILLONES CUATROCIENTOS OCHENTA Y DOS MIL PESOS 00\/100 M\.N\.\)</);
  assert.match(html, /<button[^>]*hidden=""[^>]*data-vx-hero-toggle/);
  assert.equal(html.match(/data-vx-step="/g)?.length, 8);
});

test("the hero cycle shows the finished state, clears, rebuilds in order and types the amount", () => {
  assert.deepEqual(heroFrame(0, WORDS), { step: HERO_LAST_STEP, typed: WORDS, done: false });

  const cleared = heroFrame(HERO_CYCLE.leadIn + 10, WORDS);
  assert.equal(cleared.step, 0);
  assert.equal(cleared.typed, 0);

  const start = HERO_CYCLE.leadIn + HERO_CYCLE.clear;
  let previous = 0;
  for (const [step, at] of HERO_CYCLE.steps) {
    const frame = heroFrame(start + at, WORDS);
    assert.equal(frame.step, step);
    assert.ok(frame.step >= previous);
    previous = frame.step;
  }

  const halfway = heroFrame(start + HERO_CYCLE.typeAt + (WORDS / 2) * HERO_CYCLE.typeEvery, WORDS);
  assert.equal(halfway.typed, WORDS / 2);
  // The build fits in the cycle, with time to read the result.
  assert.ok(HERO_CYCLE.clear + HERO_CYCLE.typeAt + WORDS * HERO_CYCLE.typeEvery + 3000 < HERO_CYCLE.length);
});

test("the hero cycle stops on the finished state after its last loop (WCAG 2.2.2)", () => {
  const secondLoop = HERO_CYCLE.leadIn + HERO_CYCLE.length;
  assert.equal(heroFrame(secondLoop + 10, WORDS).done, false);
  const end = heroFrame(secondLoop + HERO_CYCLE.length - 1, WORDS);
  assert.deepEqual(end, { step: HERO_LAST_STEP, typed: WORDS, done: true });
  assert.equal(heroFrame(HERO_CYCLE.leadIn + HERO_CYCLE.loops * HERO_CYCLE.length + 5000, WORDS).done, true);
});
