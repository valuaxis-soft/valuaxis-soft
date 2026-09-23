import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const actions = [
  {
    label: "Nuevo avalúo",
    description: "Crear un nuevo dictamen desde cero",
    icon: Plus,
    href: "/workspace?action=new",
    color: "from-primary/20 to-primary/5 text-primary hover:from-primary/30 hover:to-primary/10",
    requiresCreate: true,
  },
  {
    label: "Mis avalúos",
    description: "Ver y gestionar avalúos existentes",
    icon: FileText,
    href: "/avaluos",
    color: "from-accent/30 to-accent/5 text-accent-foreground hover:from-accent/40 hover:to-accent/10",
    requiresCreate: false,
  },
];

export function QuickActions({ canCreateValuation }: { canCreateValuation: boolean }) {
  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-primary/[0.03]">
      <CardHeader className="px-6 pt-6 pb-4">
        <CardTitle className="text-lg font-semibold">Acciones rápidas</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-6 pb-6">
        {actions
          .filter((action) => canCreateValuation || !action.requiresCreate)
          .map((action) => {
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
