import { Alert, AlertDescription } from "@/components/ui/alert";
import type React from "react";
import type { AuthFeedbackSeverity } from "../constants/auth-errors";

const severityClassName = {
  info: "",
  success: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 *:data-[slot=alert-description]:text-emerald-700/90 dark:*:data-[slot=alert-description]:text-emerald-400/90",
  warning: "border-amber-500/50 text-amber-700 dark:text-amber-400 *:data-[slot=alert-description]:text-amber-700/90 dark:*:data-[slot=alert-description]:text-amber-400/90",
  error: "",
} satisfies Record<AuthFeedbackSeverity, string>;

export function AuthFeedback({
  message,
  severity = "error",
  children,
}: {
  message?: string;
  severity?: AuthFeedbackSeverity;
  children?: React.ReactNode;
}) {
  if (!message) return null;
  return (
    <Alert variant={severity === "error" ? "destructive" : "default"} className={severityClassName[severity]} aria-live="polite">
      <AlertDescription>
        <p>{message}</p>
        {children ? <div className="mt-2 flex flex-wrap gap-3">{children}</div> : null}
      </AlertDescription>
    </Alert>
  );
}
