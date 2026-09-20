import { Card, CardContent } from "@/components/ui/card";
import { FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";

type Stats = {
  total: number;
  borrador: number;
  revision: number;
  terminado: number;
};

const cards = [
  { label: "Total avaluos", key: "total" as const, icon: FileText, color: "from-primary/20 to-primary/5 text-primary" },
  { label: "Borradores", key: "borrador" as const, icon: Clock, color: "from-amber-500/20 to-amber-500/5 text-amber-600 dark:text-amber-400" },
  { label: "En revision", key: "revision" as const, icon: AlertCircle, color: "from-blue-500/20 to-blue-500/5 text-blue-600 dark:text-blue-400" },
  { label: "Terminados", key: "terminado" as const, icon: CheckCircle2, color: "from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-400" },
];

export function StatsCards({ stats }: { stats: Stats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.key} className="overflow-hidden rounded-2xl border-0 bg-card shadow-md shadow-primary/[0.03]">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${card.color}`}>
                <Icon className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-bold tracking-tight">{stats[card.key]}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
