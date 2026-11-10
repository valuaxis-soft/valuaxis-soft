import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, FileText, LayoutTemplate, MapPinned, Plus } from "lucide-react";
import { NEW_VALUATION_HREF } from "@/features/dashboard/navigation";
import { cn } from "@/lib/utils";

type QuickAction = {
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
  /** Key of the shortcut, shown as a hint. */
  keys: string;
  primary?: boolean;
};

/** "Accesos rápidos": the next thing to do, only what the person's role allows. */
export function QuickActions({
  canCreateValuation,
  canViewValuations = false,
  canEditValuations = false,
}: {
  canCreateValuation: boolean;
  canViewValuations?: boolean;
  canEditValuations?: boolean;
}) {
  const actions: QuickAction[] = [
    ...(canCreateValuation
      ? [{ label: "Nuevo avalúo", description: "Empieza desde una plantilla", icon: Plus, href: NEW_VALUATION_HREF, keys: "N", primary: true }]
      : []),
    { label: "Mis avalúos", description: "Busca, filtra y continúa", icon: FileText, href: "/avaluos", keys: "G A" },
    ...(canViewValuations
      ? [{ label: "Comparables", description: "La base del despacho, en lista o mapa", icon: MapPinned, href: "/comparables", keys: "G C" }]
      : []),
    ...(canEditValuations
      ? [{ label: "Plantillas", description: "Estructuras guardadas", icon: LayoutTemplate, href: "/organizacion/plantillas", keys: "G P" }]
      : []),
  ];

  return (
    <section aria-labelledby="accesos-title" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 id="accesos-title" className="text-base font-semibold">
        Accesos rápidos
      </h2>
      <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <li key={action.href}>
              <Link
                href={action.href}
                className={cn(
                  "group flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 transition-[background-color,border-color,box-shadow] duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  action.primary
                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border-border hover:border-primary/30 hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    action.primary ? "bg-primary-foreground/15" : "bg-primary/10 text-primary",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{action.label}</span>
                  <span className={cn("block truncate text-xs", action.primary ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {action.description}
                  </span>
                </span>
                <kbd
                  aria-hidden="true"
                  className={cn(
                    "hidden rounded border px-1.5 font-sans text-[11px] lg:inline",
                    action.primary ? "border-primary-foreground/30 text-primary-foreground/80" : "border-border text-muted-foreground",
                  )}
                >
                  {action.keys}
                </kbd>
                <ArrowUpRight
                  className="size-4 shrink-0 opacity-60 transition-transform duration-150 motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5 lg:hidden"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
