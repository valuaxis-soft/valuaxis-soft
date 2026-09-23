import { useState } from "react";
import { toast } from "sonner";

import { api, SessionExpiredError } from "@/lib/api-client";
import { REOPEN_ACCEPTANCE_TEXT } from "@/features/valuations/components/workspace/valuation-lifecycle-dialogs";

/** Conclude and reopen: dialog state and the requests that change the valuation's lifecycle. */
export function useValuationLifecycle({
  handleSave,
  hasUnsavedChanges,
  onSessionExpired,
  valuationId,
}: {
  handleSave: () => Promise<boolean>;
  hasUnsavedChanges: boolean;
  onSessionExpired: () => void;
  valuationId: string | null;
}) {
  const [concludeOpen, setConcludeOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [lifecyclePending, setLifecyclePending] = useState(false);

  const runLifecycleAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setLifecyclePending(true);
    try {
      await action();
      toast.success(successMessage);
      // The loaded document belongs to a version that just changed state: load it again.
      window.location.reload();
    } catch (err) {
      if (err instanceof SessionExpiredError) onSessionExpired();
      else toast.error(err instanceof Error ? err.message : "No se pudo completar la acción.");
      setLifecyclePending(false);
    }
  };

  const handleConclude = async () => {
    if (!valuationId) return;
    if (hasUnsavedChanges && !(await handleSave())) return;
    setConcludeOpen(false);
    await runLifecycleAction(() => api.valuations.conclude(valuationId), "Avalúo concluido.");
  };

  const handleReopen = async (reason: string) => {
    if (!valuationId) return;
    setReopenOpen(false);
    await runLifecycleAction(
      () => api.valuations.reopen(valuationId, { reason, acceptedText: REOPEN_ACCEPTANCE_TEXT }),
      "Avalúo reabierto. Ya puedes editar la nueva versión.",
    );
  };

  return {
    concludeOpen,
    handleConclude,
    handleReopen,
    lifecyclePending,
    reopenOpen,
    setConcludeOpen,
    setReopenOpen,
  };
}
