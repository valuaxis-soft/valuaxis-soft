import { Badge } from "@/components/ui/badge";
import { getStatusPresentation } from "@/features/dashboard/valuation-status";
import { cn } from "@/lib/utils";

export function ValuationStatusBadge({
  status,
  fallbackName,
  className,
}: {
  status: string;
  fallbackName?: string;
  className?: string;
}) {
  const presentation = getStatusPresentation(status, fallbackName);
  return (
    <Badge variant={presentation.variant} className={cn("text-[10px] font-medium", className)}>
      {presentation.label}
    </Badge>
  );
}
