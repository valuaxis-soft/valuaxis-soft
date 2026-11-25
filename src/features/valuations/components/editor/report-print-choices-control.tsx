"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { AppSection } from "@/features/valuations/model";
import { AI_TOOLS_LEGEND } from "@/features/valuations/legal-notices";
import { ADVERTISER_DATA_HINT, ADVERTISER_DATA_LABEL } from "@/features/valuations/services/advertiser-data";

export const AI_TOOLS_LEGEND_LABEL = "Imprimir la leyenda de uso de herramientas e inteligencia artificial";

/**
 * Two choices of what the report prints, kept on the carátula section and
 * saved with the document; both off by default (matrix 1.5 bis and 1.7): the
 * advertisers' name and phone, and the legend of software and AI tools.
 */
export function ReportPrintChoicesControl({
  section,
  readOnly,
  onUpdateSection,
}: {
  section: AppSection;
  readOnly: boolean;
  onUpdateSection: (sectionId: string, patch: Partial<AppSection>) => void;
}) {
  return (
    <section className="grid gap-3 rounded-md border bg-background p-3" data-report-print-choices="">
      <h4 className="text-sm font-medium">Qué más imprime el reporte</h4>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={section.advertiserData === true}
          disabled={readOnly}
          onCheckedChange={(checked) => onUpdateSection(section.id, { advertiserData: checked === true ? true : undefined })}
          data-advertiser-data-toggle=""
        />
        <span className="grid gap-0.5">
          <span>{ADVERTISER_DATA_LABEL}</span>
          <span className="text-xs text-muted-foreground">{ADVERTISER_DATA_HINT}</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={section.aiToolsLegend === true}
          disabled={readOnly}
          onCheckedChange={(checked) => onUpdateSection(section.id, { aiToolsLegend: checked === true ? true : undefined })}
          data-ai-tools-legend-toggle=""
        />
        <span className="grid gap-0.5">
          <span>{AI_TOOLS_LEGEND_LABEL}</span>
          <span className="text-xs text-muted-foreground">Se imprime en la carátula, antes de las firmas: «{AI_TOOLS_LEGEND}»</span>
        </span>
      </label>
    </section>
  );
}
