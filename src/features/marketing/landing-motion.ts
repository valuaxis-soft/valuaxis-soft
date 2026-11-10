import { HERO_CYCLE, HERO_LAST_STEP, heroFrame } from "./hero-cycle";

/**
 * The public page's only client code (docs/DISENO.md, "Movimiento"). The page
 * is server-rendered in its final state; this wires the DOM after hydration:
 * the header's scrolled state and active link, the in-view triggers that the
 * CSS in `motion.css` animates, and the hero cycle. With reduced motion it only
 * does the header.
 */
export function startLandingMotion(): () => void {
  const stops = [watchHeader(), watchActiveLink()];
  const stopAll = () => stops.forEach((stop) => stop());

  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return stopAll;

  const triggers = Array.from(document.querySelectorAll<HTMLElement>('[data-vx="in"]'));
  // Without scroll-driven animations the plain entrances need the observer too.
  if (!CSS.supports("animation-timeline: view()")) triggers.push(...document.querySelectorAll<HTMLElement>(".vx-reveal"));

  // What is already on screen keeps its final state instead of replaying.
  const pending = triggers.filter((element) => {
    if (element.getBoundingClientRect().top < innerHeight) {
      element.dataset.on = "";
      return false;
    }
    return true;
  });
  const hero = document.querySelector<HTMLElement>("[data-vx-hero]");
  hero?.querySelectorAll<HTMLElement>('[data-vx="step"]').forEach((part) => (part.dataset.on = ""));

  document.documentElement.classList.add("vx-motion");

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.on = "";
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px" },
  );
  pending.forEach((element) => observer.observe(element));
  stops.push(() => observer.disconnect());
  if (hero) stops.push(runHeroCycle(hero));

  return () => {
    stopAll();
    document.documentElement.classList.remove("vx-motion");
  };
}

/** Compacts the header with a shadow once the page leaves the top. */
function watchHeader(): () => void {
  const header = document.querySelector<HTMLElement>("[data-vx-header]");
  if (!header) return () => {};
  let frame = 0;
  const update = () => {
    frame = 0;
    header.toggleAttribute("data-scrolled", scrollY > 12);
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  update();
  addEventListener("scroll", onScroll, { passive: true });
  return () => {
    removeEventListener("scroll", onScroll);
    cancelAnimationFrame(frame);
  };
}

/** Marks the header link of the section crossing the middle of the screen. */
function watchActiveLink(): () => void {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-vx-nav] a[href^="#"]'));
  if (!links.length || !("IntersectionObserver" in window)) return () => {};
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const href = `#${entry.target.id}`;
        for (const link of links) {
          if (link.getAttribute("href") === href) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        }
      }
    },
    { rootMargin: "-45% 0px -54% 0px" },
  );
  document.querySelectorAll("main section").forEach((section) => observer.observe(section));
  return () => observer.disconnect();
}

const HERO_LABELS = { playing: "Pausar la animación", paused: "Reanudar la animación", done: "Repetir la animación" } as const;

/**
 * Plays the hero timeline on a clock that only advances while the hero is on
 * screen, the tab is visible and the visitor has not paused it.
 */
function runHeroCycle(hero: HTMLElement): () => void {
  const parts = Array.from(hero.querySelectorAll<HTMLElement>('[data-vx="step"]'));
  const typed = hero.querySelector<HTMLElement>("[data-vx-typed]");
  const rest = hero.querySelector<HTMLElement>("[data-vx-rest]");
  const toggle = hero.querySelector<HTMLButtonElement>("[data-vx-hero-toggle]");
  const words = typed?.textContent ?? "";

  let elapsed = 0;
  let last = 0;
  let frame = 0;
  let onScreen = true;
  let userPaused = false;
  let done = false;
  let shown: { step: number; typed: number } = { step: HERO_LAST_STEP, typed: words.length };

  const render = () => {
    const next = heroFrame(elapsed, words.length);
    done = next.done;
    if (next.step !== shown.step) {
      for (const part of parts) part.toggleAttribute("data-on", Number(part.dataset.vxStep) <= next.step);
    }
    if (next.typed !== shown.typed && typed && rest) {
      typed.textContent = words.slice(0, next.typed);
      rest.textContent = words.slice(next.typed);
    }
    shown = next;
  };

  const sync = () => {
    const running = onScreen && !document.hidden && !userPaused && !done;
    hero.toggleAttribute("data-vx-paused", !running);
    if (toggle) {
      const state = done ? "done" : userPaused ? "paused" : "playing";
      toggle.dataset.state = state;
      toggle.setAttribute("aria-label", HERO_LABELS[state]);
    }
    if (running && !frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    } else if (!running && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  const tick = (now: number) => {
    elapsed += Math.min(now - last, 100);
    last = now;
    render();
    frame = 0;
    if (done) sync();
    else frame = requestAnimationFrame(tick);
  };

  const onToggle = () => {
    if (done) {
      done = false;
      elapsed = HERO_CYCLE.leadIn; // straight to clearing the table
      userPaused = false;
    } else {
      userPaused = !userPaused;
    }
    sync();
  };

  const observer = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  });
  observer.observe(hero);
  document.addEventListener("visibilitychange", sync);
  toggle?.addEventListener("click", onToggle);
  if (toggle) toggle.hidden = false;
  sync();

  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", sync);
    toggle?.removeEventListener("click", onToggle);
    cancelAnimationFrame(frame);
  };
}
