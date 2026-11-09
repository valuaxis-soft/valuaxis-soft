"use client";

import { Link2, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * "Vinculado con…" / "Desvinculado de…": what a calculation writes on its own,
 * with the way to stop it ("Desvincular") and to take it up again. The same
 * control for the construction types linked to the cost approach and for the
 * concepts the conclusion fills. The caller confirms the unlinking.
 */
export function CalculationLinkBadge({
  linked,
  labels,
  description,
  notice,
  readOnly,
  busy = false,
  disabled = false,
  onUnlink,
  onRelink,
}: {
  linked: boolean;
  labels: { linked: string; unlinked: string; title: { linked: string; unlinked: string }; relink: string };
  description: string;
  /** In place of the button: why the link cannot change yet. */
  notice?: ReactNode;
  readOnly: boolean;
  busy?: boolean;
  disabled?: boolean;
  onUnlink: () => void;
  onRelink: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={<Badge variant={linked ? "secondary" : "outline"} className="cursor-pointer" data-calculation-link={linked ? "linked" : "unlinked"} />}
      >
        <Link2 /> {linked ? labels.linked : labels.unlinked}
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-2 p-3 text-xs">
        <p className="text-sm font-medium">{linked ? labels.title.linked : labels.title.unlinked}</p>
        <p className="text-muted-foreground">{description}</p>
        {notice ? (
          <p className="text-muted-foreground">{notice}</p>
        ) : !readOnly ? (
          <Button type="button" size="sm" variant={linked ? "outline" : "default"} className="w-fit" disabled={busy || disabled} onClick={linked ? onUnlink : onRelink}>
            {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {linked ? "Desvincular" : labels.relink}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
