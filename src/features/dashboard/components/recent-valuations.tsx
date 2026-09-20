import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ValuationItem = {
  id: string;
  folio: string;
  client: string;
  location: string;
  valuationKind: string;
  propertyKind: string;
  status: string;
  createdAt: Date;
};

const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "outline" }> = {
  borrador: { label: "Borrador", variant: "secondary" },
  revision: { label: "Revision", variant: "default" },
  terminado: { label: "Terminado", variant: "outline" },
};

export function RecentValuations({ valuations }: { valuations: ValuationItem[] }) {
  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-primary/[0.03]">
      <CardHeader className="flex flex-row items-center justify-between px-6 pt-6 pb-4">
        <CardTitle className="text-lg font-semibold">Avaluos recientes</CardTitle>
        <Link
          href="/workspace"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "gap-1.5 rounded-xl text-xs font-medium",
          )}
        >
          Ver todos
          <ArrowRight className="size-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        {valuations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <FileText className="size-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground/60">No hay avaluos aun</p>
            <p className="text-xs text-muted-foreground/40">Crea tu primer avaluo para empezar</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {valuations.slice(0, 5).map((v) => {
              const status = statusConfig[v.status] ?? { label: v.status, variant: "outline" as const };
              return (
                <Link
                  key={v.id}
                  href={`/workspace?id=${v.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-transparent bg-muted/30 p-4 transition-all hover:border-border hover:bg-muted/60"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{v.folio}</p>
                      <Badge variant={status.variant} className="text-[10px] font-medium">
                        {status.label}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {v.client} &middot; {v.location}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-xs font-medium capitalize">{v.propertyKind}</p>
                    <p className="text-[11px] text-muted-foreground/60">{v.valuationKind}</p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground/30 transition-all group-hover:text-foreground group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
