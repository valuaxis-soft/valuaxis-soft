import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ValuaxisLogo } from "@/components/brand/valuaxis-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AuthUser } from "@/features/auth/model";
import { CommandPalette, CommandPaletteTrigger } from "@/features/dashboard/components/command-palette";
import { MobileNav } from "@/features/dashboard/components/mobile-nav";
import { NAV_ICONS } from "@/features/dashboard/components/nav-icons";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { OrganizationScopeSelector } from "@/features/dashboard/components/organization-scope-selector";
import { UserMenu } from "@/features/dashboard/components/user-menu";
import { MAIN_CONTENT_ID, buildNavigation, initialsOf, type NavKey } from "@/features/dashboard/navigation";
import { cn } from "@/lib/utils";

const navLinkClass = (current: boolean) =>
  cn(
    "relative inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    "after:pointer-events-none after:absolute after:inset-x-3 after:-bottom-[14px] after:h-0.5 after:rounded-full after:transition-colors after:duration-200",
    current ? "text-foreground after:bg-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground after:bg-transparent",
  );

/**
 * The top bar of the private area: the logo, the destinations the person can
 * open (with the firm's settings under "Despacho"), "Buscar o ir a…" (Ctrl/⌘ K),
 * the active firm, the notifications bell and the account menu. Below lg the destinations move to the
 * side menu.
 */
export function DashboardHeader({ user, active }: { user: AuthUser; active?: NavKey }) {
  const navigation = buildNavigation(user);
  const initials = initialsOf(user.name);
  const organizationActive = navigation.organization.some((item) => item.key === active);
  const OrganizationIcon = NAV_ICONS.despacho;

  return (
    <>
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only z-[60] rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex h-16 max-w-[1760px] items-center gap-1 px-2 sm:px-4 lg:gap-2 lg:px-6">
          <MobileNav navigation={navigation} active={active} name={user.name} email={user.email} role={user.role} initials={initials} />
          <Link
            href="/dashboard"
            aria-label="Valuaxis, ir al inicio"
            className="flex h-11 shrink-0 items-center rounded-lg px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ValuaxisLogo markClassName="size-8" className="text-base" />
          </Link>

          <nav aria-label="Navegación principal" className="ml-4 hidden items-center gap-0.5 lg:flex">
            {navigation.primary.map((item) => {
              const Icon = NAV_ICONS[item.key];
              const current = active === item.key;
              return (
                <Link key={item.key} href={item.href} aria-current={current ? "page" : undefined} className={navLinkClass(current)}>
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
            {navigation.organization.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger className={cn(navLinkClass(organizationActive), "aria-expanded:bg-muted aria-expanded:text-foreground")}>
                  <OrganizationIcon className="size-4" aria-hidden="true" />
                  Despacho
                  <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 rounded-xl p-1.5">
                  {navigation.organization.map((item) => {
                    const Icon = NAV_ICONS[item.key];
                    const current = active === item.key;
                    return (
                      <DropdownMenuItem
                        key={item.key}
                        className={cn("items-start gap-3 px-2.5 py-2", current && "bg-muted")}
                        render={<Link href={item.href} aria-current={current ? "page" : undefined} />}
                      >
                        <Icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block font-medium">{item.label}</span>
                          <span className="block text-xs text-muted-foreground">{item.description}</span>
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
            <CommandPaletteTrigger className="w-11 justify-center px-0 xl:w-64 xl:justify-start xl:px-3" />
            <OrganizationScopeSelector key={user.organizationName} activeOrganizationName={user.organizationName} />
            <NotificationBell />
            <UserMenu name={user.name} email={user.email} organizationName={user.organizationName} role={user.role} initials={initials} />
          </div>
        </div>
        <CommandPalette navigation={navigation} />
      </header>
    </>
  );
}
