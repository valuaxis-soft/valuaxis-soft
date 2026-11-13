"use client";

import { BarChart3, Calculator } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type MarketSectionTab = "mercado" | "metodos";

/**
 * The market sections' two calculations, each in its own tab (videos 5.1 and
 * 6.3): the market approach and the alternative methods (regression and goal
 * programming). Both stay mounted, so switching keeps what was being typed.
 */
export function MarketSectionTabs(props: { market: ReactNode; methods: ReactNode }) {
  const [tab, setTab] = useState<MarketSectionTab>("mercado");
  const tabs: Array<{ id: MarketSectionTab; label: string; icon: ReactNode }> = [
    { id: "mercado", label: "Enfoque de mercado", icon: <Calculator className="size-4" /> },
    { id: "metodos", label: "Métodos alternativos", icon: <BarChart3 className="size-4" /> },
  ];
  return (
    <div className="grid gap-3">
      <div role="tablist" aria-label="Cálculos de la sección" className="flex flex-wrap gap-1 border-b">
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`market-section-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`market-section-panel-${item.id}`}
            className={cn(
              "-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none",
              tab === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab(item.id)}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>
      <div id="market-section-panel-mercado" role="tabpanel" aria-labelledby="market-section-tab-mercado" hidden={tab !== "mercado"}>{props.market}</div>
      <div id="market-section-panel-metodos" role="tabpanel" aria-labelledby="market-section-tab-metodos" hidden={tab !== "metodos"}>{props.methods}</div>
    </div>
  );
}
