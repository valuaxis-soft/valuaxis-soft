import type { LucideIcon } from "lucide-react";
import { Ban, CheckCircle2, Clock, Eye, FilePen, FileText, RotateCcw, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getStatusPresentation } from "@/features/dashboard/valuation-status";

type Stats = {
  total: number;
  /** Count per lowercase status key, in display order. */
  byStatus: Record<string, number>;
};

const statusStyle: Record<string, { icon: LucideIcon; color: string }> = {
  nuevo: { icon: Sparkles, color: "from-sky-500/20 to-sky-500/5 text-sky-600 dark:text-sky-400" },
  en_edicion: { icon: FilePen, color: "from-amber-500/20 to-amber-500/5 text-amber-600 dark:text-amber-400" },
  en_revision: { icon: Eye, color: "from-blue-500/20 to-blue-500/5 text-blue-600 dark:text-blue-400" },
  terminado: { icon: CheckCircle2, color: "from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-400" },
  reabierto: { icon: RotateCcw, color: "from-violet-500/20 to-violet-500/5 text-violet-600 dark:text-violet-400" },
  cancelado: { icon: Ban, color: "from-rose-500/20 to-rose-500/5 text-rose-600 dark:text-rose-400" },
};

const fallbackStyle = { icon: Clock, color: "from-muted-foreground/20 to-muted-foreground/5 text-muted-foreground" };

export function StatsCards({ stats }: { stats: Stats }) {
  const cards = [
    { key: "total", label: "Total de avalúos", value: stats.total, icon: FileText, color: "from-primary/20 to-primary/5 text-primary" },
    ...Object.entries(stats.byStatus).map(([key, value]) => ({
      key,
      label: getStatusPresentation(key).pluralLabel,
      value,
      ...(statusStyle[key] ?? fallbackStyle),
    })),
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 2xl:grid-cols-7">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.key} className="overflow-hidden rounded-2xl border-0 bg-card shadow-md shadow-primary/[0.03]">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${card.color}`}>
                <Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-bold tracking-tight">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
