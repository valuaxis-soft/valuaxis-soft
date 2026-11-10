/**
 * Timeline of the hero mockup "working by itself": the table clears, the
 * comparables come in row by row, the statistics and the adopted value fill
 * in, the range marker slides, "Calculado" appears, the concluded value rolls
 * up and its amount in words is typed. Pure, so it can be tested; the DOM
 * side lives in `landing-motion.ts`.
 */
export const HERO_CYCLE = {
  /** The finished state shows this long before the first replay. */
  leadIn: 1000,
  /** From clearing the table to the first row. */
  clear: 350,
  /** `[step, ms after the first row]`; parts carry `data-vx-step`. */
  steps: [
    [1, 0],
    [2, 180],
    [3, 360],
    [4, 540],
    [5, 1150],
    [6, 1450],
    [7, 1850],
    [8, 2000],
  ] as const,
  /** The amount in words starts typing here, one character per `typeEvery` ms. */
  typeAt: 2600,
  typeEvery: 12,
  /** One build plus the time the finished state stays on screen. */
  length: 7000,
  /** It plays twice and stops on the finished state (WCAG 2.2.2). */
  loops: 2,
} as const;

export const HERO_LAST_STEP = HERO_CYCLE.steps[HERO_CYCLE.steps.length - 1][0];

export type HeroFrame = { step: number; typed: number; done: boolean };

/** What the hero shows `elapsed` ms after the cycle started, for a text of `chars` characters. */
export function heroFrame(elapsed: number, chars: number): HeroFrame {
  const finished = { step: HERO_LAST_STEP, typed: chars, done: false };
  if (elapsed < HERO_CYCLE.leadIn) return finished;

  const sinceLeadIn = elapsed - HERO_CYCLE.leadIn;
  const loop = Math.floor(sinceLeadIn / HERO_CYCLE.length);
  const within = sinceLeadIn - loop * HERO_CYCLE.length;
  const buildEnd = HERO_CYCLE.clear + HERO_CYCLE.typeAt + chars * HERO_CYCLE.typeEvery;
  if (loop >= HERO_CYCLE.loops || (loop === HERO_CYCLE.loops - 1 && within >= buildEnd + 400)) {
    return { ...finished, done: true };
  }

  const local = within - HERO_CYCLE.clear;
  let step = 0;
  for (const [number, at] of HERO_CYCLE.steps) if (local >= at) step = number;
  const typed = Math.min(chars, Math.max(0, Math.floor((local - HERO_CYCLE.typeAt) / HERO_CYCLE.typeEvery)));
  return { step, typed, done: false };
}
