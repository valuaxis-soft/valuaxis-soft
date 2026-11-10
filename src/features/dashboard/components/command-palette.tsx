"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { LucideIcon } from "lucide-react";
import { CornerDownLeft, Keyboard, Moon, Plus, Search, Sun } from "lucide-react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useTheme } from "next-themes";
import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { NAV_ICONS } from "@/features/dashboard/components/nav-icons";
import { NEW_VALUATION_HREF, type AppNavigation, type NavItem } from "@/features/dashboard/navigation";
import { cn } from "@/lib/utils";

/** Any component can open the palette: window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT, { detail: { mode } })). */
export const OPEN_COMMAND_PALETTE_EVENT = "valuaxis:open-command-palette";

type PaletteMode = "commands" | "shortcuts";

type Command = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  keys?: string[];
  run: () => void;
};

/** Lowercase without accents, so "avaluos" finds "Avalúos". */
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const subscribeNothing = () => () => {};
/** "⌘" on Apple devices, "Ctrl" elsewhere; the server and the first render say "Ctrl". */
function useModifierLabel() {
  return useSyncExternalStore(
    subscribeNothing,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

export function openCommandPalette(mode: PaletteMode = "commands") {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT, { detail: { mode } }));
}

/** The "Buscar o ir a…" button of the top bar. */
export function CommandPaletteTrigger({ className }: { className?: string }) {
  const modifier = useModifierLabel();
  return (
    <button
      type="button"
      onClick={() => openCommandPalette()}
      aria-label="Buscar o ir a… (atajo: Ctrl o ⌘ más K)"
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        "group inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition-colors duration-150 outline-none hover:border-ring/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-9",
        className,
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span className="hidden xl:inline">Buscar o ir a…</span>
      <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 font-sans text-[11px] font-medium text-muted-foreground xl:inline">
        {modifier} K
      </kbd>
    </button>
  );
}

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["Ctrl/⌘", "K"], label: "Abrir buscar o ir a…" },
  { keys: ["/"], label: "Buscar en la página (o abrir este cuadro)" },
  { keys: ["N"], label: "Nuevo avalúo" },
  { keys: ["G", "I"], label: "Ir a Inicio" },
  { keys: ["G", "A"], label: "Ir a Avalúos" },
  { keys: ["G", "C"], label: "Ir a Comparables" },
  { keys: ["G", "P"], label: "Ir a Plantillas" },
  { keys: ["G", "E"], label: "Ir a Equipo" },
  { keys: ["G", "D"], label: "Ir a Datos del despacho" },
  { keys: ["G", "F"], label: "Ir a Plan y facturación" },
  { keys: ["G", "M"], label: "Ir a Mi cuenta" },
  { keys: ["?"], label: "Ver estos atajos" },
];

/**
 * "Buscar o ir a…": a command palette (Ctrl/⌘ K) with the destinations the
 * person can open, "Nuevo avalúo", the theme and a search in avalúos or
 * comparables; plus the keyboard shortcuts of the private area. Shortcuts never
 * fire while typing in a field or with another dialog open.
 */
export function CommandPalette({ navigation }: { navigation: AppNavigation }) {
  // Rendered inside the app the router navigates; in a static render, the page does.
  const router = useContext(AppRouterContext);
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>("commands");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const destinations = useMemo<NavItem[]>(
    () => [...navigation.primary, ...navigation.organization, navigation.account],
    [navigation],
  );

  const show = useCallback((nextMode: PaletteMode) => {
    setMode(nextMode);
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      if (router) router.push(href);
      else window.location.assign(href);
    },
    [router],
  );

  useEffect(() => {
    let pendingG = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (openRef.current) setOpen(false);
        else show("commands");
        return;
      }
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

      const key = event.key.toLowerCase();
      if (pendingG && Date.now() - pendingG < 1500) {
        pendingG = 0;
        const target = destinations.find((item) => item.shortcut === key);
        if (target) {
          event.preventDefault();
          go(target.href);
        }
        return;
      }
      if (key === "g") {
        pendingG = Date.now();
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        const search = document.querySelector<HTMLInputElement>("[data-page-search]");
        if (search) {
          search.focus();
          search.select();
        } else show("commands");
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        show("shortcuts");
        return;
      }
      if (key === "n" && navigation.canCreateValuation) {
        event.preventDefault();
        go(NEW_VALUATION_HREF);
      }
    };
    const onOpen = (event: Event) => show((event as CustomEvent<{ mode?: PaletteMode }>).detail?.mode ?? "commands");
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, [destinations, go, navigation.canCreateValuation, show]);

  const commands = useMemo<Command[]>(() => {
    const text = query.trim();
    const list: Command[] = [];
    if (navigation.canCreateValuation) {
      list.push({ id: "new", group: "Acciones", label: "Nuevo avalúo", hint: "Empieza un avalúo desde una plantilla", icon: Plus, keys: ["N"], run: () => go(NEW_VALUATION_HREF) });
    }
    const dark = resolvedTheme === "dark";
    list.push({
      id: "theme",
      group: "Acciones",
      label: dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro",
      hint: "Modo de la pantalla",
      icon: dark ? Sun : Moon,
      run: () => {
        setTheme(dark ? "light" : "dark");
        setOpen(false);
      },
    });
    list.push({ id: "shortcuts", group: "Acciones", label: "Ver atajos de teclado", icon: Keyboard, keys: ["?"], run: () => show("shortcuts") });
    for (const item of destinations) {
      list.push({
        id: item.key,
        group: "Ir a",
        label: item.label,
        hint: item.description,
        icon: NAV_ICONS[item.key],
        keys: item.shortcut ? ["G", item.shortcut.toUpperCase()] : undefined,
        run: () => go(item.href),
      });
    }

    const needle = fold(text);
    const matches = needle ? list.filter((command) => fold(`${command.label} ${command.hint ?? ""}`).includes(needle)) : list;
    if (text && destinations.some((item) => item.key === "avaluos")) {
      matches.push({
        id: "search-valuations",
        group: "Buscar",
        label: `Buscar «${text}» en avalúos`,
        hint: "Por folio, título o cliente",
        icon: Search,
        run: () => go(`/avaluos?q=${encodeURIComponent(text)}`),
      });
      matches.push({
        id: "search-comparables",
        group: "Buscar",
        label: `Buscar «${text}» en comparables`,
        hint: "Por ubicación, uso, fuente o número",
        icon: Search,
        run: () => go(`/comparables?q=${encodeURIComponent(text)}`),
      });
    }
    return matches;
  }, [destinations, go, navigation.canCreateValuation, query, resolvedTheme, setTheme, show]);

  const activeIndex = Math.min(active, Math.max(commands.length - 1, 0));
  const optionId = (index: number) => `${listId}-option-${index}`;

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((activeIndex + 1) % Math.max(commands.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((activeIndex - 1 + commands.length) % Math.max(commands.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commands[activeIndex]?.run();
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/25 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none supports-backdrop-filter:backdrop-blur-[2px]" />
        <DialogPrimitive.Popup
          initialFocus={mode === "commands" ? inputRef : true}
          className="fixed top-[10dvh] left-1/2 z-50 flex max-h-[80dvh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none transition-[opacity,scale] duration-200 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none"
        >
          {mode === "shortcuts" ? (
            <div className="grid gap-4 p-5">
              <div>
                <DialogPrimitive.Title className="text-base font-semibold">Atajos de teclado</DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  Funcionan fuera de los campos de texto. «G» y luego la letra, una tras otra.
                </DialogPrimitive.Description>
              </div>
              <dl className="grid gap-1">
                {SHORTCUTS.map((shortcut) => (
                  <div key={shortcut.label} className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm odd:bg-muted/50">
                    <dt>{shortcut.label}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd key={key} className="min-w-6 rounded border border-border bg-background px-1.5 text-center font-sans text-xs font-medium">
                          {key}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="flex justify-end">
                <DialogPrimitive.Close className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:h-9">
                  Listo
                </DialogPrimitive.Close>
              </div>
            </div>
          ) : (
            <>
              <DialogPrimitive.Title className="sr-only">Buscar o ir a</DialogPrimitive.Title>
              <div className="flex items-center gap-2 border-b border-border px-4">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onInputKeyDown}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-activedescendant={commands.length ? optionId(activeIndex) : undefined}
                  aria-autocomplete="list"
                  aria-label="Escribe a dónde quieres ir o qué buscar"
                  placeholder="Escribe a dónde ir o un folio, cliente, colonia…"
                  className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
                  maxLength={100}
                />
              </div>
              <div id={listId} role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto p-2">
                {commands.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">No encontramos nada con eso. Prueba con otra palabra.</p>
                ) : (
                  commands.map((command, index) => {
                    const heading = index === 0 || commands[index - 1].group !== command.group ? command.group : null;
                    const Icon = command.icon;
                    const selected = index === activeIndex;
                    return (
                      <div key={command.id} role="presentation">
                        {heading ? (
                          <p role="presentation" className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground first:pt-1">
                            {heading}
                          </p>
                        ) : null}
                        <div
                          id={optionId(index)}
                          role="option"
                          aria-selected={selected}
                          onMouseMove={() => setActive(index)}
                          onClick={() => command.run()}
                          className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-100",
                            selected ? "bg-muted text-foreground" : "text-foreground/90",
                          )}
                        >
                          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background", selected && "border-primary/30 text-primary")}>
                            <Icon className="size-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{command.label}</span>
                            {command.hint ? <span className="block truncate text-xs text-muted-foreground">{command.hint}</span> : null}
                          </span>
                          {command.keys ? (
                            <span className="hidden shrink-0 gap-1 sm:flex" aria-hidden="true">
                              {command.keys.map((key) => (
                                <kbd key={key} className="min-w-5 rounded border border-border bg-background px-1 text-center font-sans text-[11px] text-muted-foreground">
                                  {key}
                                </kbd>
                              ))}
                            </span>
                          ) : selected ? (
                            <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="hidden items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground sm:flex">
                <span>↑ ↓ para moverte</span>
                <span>Enter para abrir</span>
                <span>Esc para cerrar</span>
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
