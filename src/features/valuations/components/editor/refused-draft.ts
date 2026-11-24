"use client";

import { useState } from "react";
import { toast } from "sonner";

/**
 * A name the document refuses (a concluded value named after intangibles):
 * while it is typed it stays in the field, said why under it, and is never
 * written to the document; leaving the field takes back the last name kept.
 * Checked on each keystroke, so «marca» on the way to «marcador» is only a
 * moment in the field, never a refusal.
 */
export function useRefusedDraft(refusal: ((text: string) => string | null) | null | undefined) {
  const [draft, setDraft] = useState<string | null>(null);
  const reason = draft !== null && refusal ? refusal(draft) : null;
  return {
    /** The refused text in the field, or null. */
    draft: reason ? draft : null,
    reason,
    change(text: string, commit: (text: string) => void) {
      if (refusal?.(text)) {
        setDraft(text);
        return;
      }
      setDraft(null);
      commit(text);
    },
    /** Leaving the field: a refused text goes, with why. True when it did. */
    leave(): boolean {
      if (!reason) return false;
      toast.error(reason);
      setDraft(null);
      return true;
    },
  };
}
