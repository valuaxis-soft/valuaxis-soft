"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import Link from "next/link";
import { LogOut, Menu, Moon, Plus, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";

import { ValuaxisLogo } from "@/components/brand/valuaxis-logo";
import { logoutAction } from "@/features/auth/actions/logout.action";
import { NAV_ICONS } from "@/features/dashboard/components/nav-icons";
import { Avatar, roleLabel } from "@/features/dashboard/components/user-menu";
import { NEW_VALUATION_HREF, type AppNavigation, type NavItem, type NavKey } from "@/features/dashboard/navigation";
import { cn } from "@/lib/utils";

/**
 * The menu of phones and tablets (below lg): a panel from the left with every
 * destination, "Nuevo avalúo", the theme and "Cerrar sesión".
 */
export function MobileNav({
  navigation,
  active,
  name,
  email,
  role,
  initials,
}: {
  navigation: AppNavigation;
  active?: NavKey;
  name: string;
  email: string;
  role: string;
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  const link = (item: NavItem) => {
    const Icon = NAV_ICONS[item.key];
    const current = active === item.key;
    return (
      <Link
        key={item.key}
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          current ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted",
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block">{item.label}</span>
          <span className={cn("block truncate text-xs font-normal", current ? "text-primary/80" : "text-muted-foreground")}>{item.description}</span>
        </span>
      </Link>
    );
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        aria-label="Abrir menú"
        className="inline-flex size-11 items-center justify-center rounded-lg text-foreground transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <DialogPrimitive.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-3rem))] flex-col bg-background shadow-2xl outline-none transition-transform duration-200 ease-out data-ending-style:-translate-x-full data-starting-style:-translate-x-full motion-reduce:transition-none">
          <div className="flex h-16 items-center justify-between border-b border-border px-4">
            <DialogPrimitive.Title render={<div />}>
              <ValuaxisLogo markClassName="size-8" />
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Cerrar menú"
              className="inline-flex size-11 items-center justify-center rounded-lg outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <nav aria-label="Menú" className="flex-1 overflow-y-auto px-3 py-4">
            {navigation.canCreateValuation ? (
              <Link
                href={NEW_VALUATION_HREF}
                onClick={() => setOpen(false)}
                className="mb-4 flex h-12 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors duration-150 outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Plus className="size-4" aria-hidden="true" />
                Nuevo avalúo
              </Link>
            ) : null}
            <div className="grid gap-1">{navigation.primary.map(link)}</div>
            {navigation.organization.length ? (
              <>
                <p className="mt-5 mb-1 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Despacho</p>
                <div className="grid gap-1">{navigation.organization.map(link)}</div>
              </>
            ) : null}
            <p className="mt-5 mb-1 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Tu cuenta</p>
            <div className="grid gap-1">
              {link(navigation.account)}
              <button
                type="button"
                onClick={() => setTheme(dark ? "light" : "dark")}
                className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Sun className="size-5 shrink-0 dark:hidden" aria-hidden="true" />
                <Moon className="hidden size-5 shrink-0 dark:block" aria-hidden="true" />
                <span>
                  <span className="dark:hidden">Usar tema oscuro</span>
                  <span className="hidden dark:inline">Usar tema claro</span>
                </span>
              </button>
            </div>
          </nav>

          <div className="flex items-center gap-3 border-t border-border p-4">
            <Avatar initials={initials} className="size-10 text-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {roleLabel(role)} · {email}
              </p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="inline-flex size-11 items-center justify-center rounded-lg text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <LogOut className="size-5" aria-hidden="true" />
              </button>
            </form>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
