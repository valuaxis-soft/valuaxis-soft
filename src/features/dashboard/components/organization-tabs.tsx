import Link from "next/link";
import type { AuthUser } from "@/features/auth/model";
import { NAV_ICONS } from "@/features/dashboard/components/nav-icons";
import { buildNavigation, type NavKey } from "@/features/dashboard/navigation";
import { cn } from "@/lib/utils";

/** The firm's settings as tabs, so it is clear where you are and what is next to it. Hidden with fewer than two. */
export function OrganizationTabs({ user, active }: { user: AuthUser; active: NavKey }) {
  const items = buildNavigation(user).organization;
  if (items.length < 2) return null;
  return (
    <nav aria-label="Ajustes del despacho" className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/50 p-1 [scrollbar-width:none] sm:w-fit">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.key];
        const current = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9",
              current ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
