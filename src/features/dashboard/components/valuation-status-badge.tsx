import { STATUS_TONE_CLASSES, getStatusPresentation } from "@/features/dashboard/valuation-status";
import { cn } from "@/lib/utils";

/** The status of a valuation: a colored dot plus its name, on a tint of the same color. */
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
  const tone = STATUS_TONE_CLASSES[presentation.tone];
  return (
    <span
      data-slot="badge"
      data-status={status.toLowerCase()}
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        tone.soft,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", tone.dot)} />
      {presentation.label}
    </span>
  );
}
