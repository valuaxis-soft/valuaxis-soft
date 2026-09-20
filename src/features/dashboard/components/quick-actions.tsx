import Link from "next/link";
import { Plus, FileText, Search, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const actions = [
  {
    label: "Nuevo avaluo",
    description: "Crear un nuevo dictamen desde cero",
    icon: Plus,
    href: "/workspace?action=new",
    color: "from-primary/20 to-primary/5 text-primary hover:from-primary/30 hover:to-primary/10",
  },
  {
    label: "Mis avaluos",
    description: "Ver y gestionar avaluos existentes",
    icon: FileText,
    href: "/workspace",
    color: "from-accent/30 to-accent/5 text-accent-foreground hover:from-accent/40 hover:to-accent/10",
  },
  {
    label: "Buscar comparables",
    description: "Localizar ofertas por codigo postal",
    icon: Search,
    href: "/workspace?tab=comparables",
    color: "from-chart-2/20 to-chart-2/5 text-chart-2 hover:from-chart-2/30 hover:to-chart-2/10",
  },
  {
    label: "Guia de uso",
    description: "Documentacion del sistema de avaluos",
    icon: BookOpen,
    href: "#",
    color: "from-muted-foreground/20 to-muted-foreground/5 text-muted-foreground hover:from-muted-foreground/30 hover:to-muted-foreground/10",
  },
];

export function QuickActions() {
  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-primary/[0.03]">
      <CardHeader className="px-6 pt-6 pb-4">
        <CardTitle className="text-lg font-semibold">Acciones rapidas</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-6 pb-6">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "h-auto justify-start gap-4 rounded-xl p-4",
              )}
            >
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${action.color}`}
              >
                <Icon className="size-4" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">{action.label}</p>
                <p className="text-xs text-muted-foreground/60">{action.description}</p>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
