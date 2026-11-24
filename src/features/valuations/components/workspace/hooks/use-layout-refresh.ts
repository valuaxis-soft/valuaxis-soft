import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import { toast } from "sonner";

import {
  describeLayoutChanges,
  layoutStepsFor,
  layoutVersionOf,
  refreshDocumentLayout,
  revertLayoutRefresh,
  type LayoutChange,
  type LayoutRefreshPolicy,
} from "@/features/valuations/services/layout-refresh";
import type { EditorState } from "./use-editor-state";

const NOTICE = "Este avalúo se actualizó con los cambios más recientes del formato";
const NOTICE_MS = 15_000;

/**
 * Brings the valuation up to the current format (services/layout-refresh.ts):
 * on opening, as the policy says, and with «Actualizar formato». A change is
 * one step of «Deshacer», and the notice says it once with its own
 * «Deshacer», which takes back only what the refresh added. Concluded
 * valuations and those the user cannot edit are never touched.
 */
export function useLayoutRefresh({
  canEdit,
  createdAt,
  policy,
  resyncCalculations,
  sections,
  updateSections,
  valuationId,
}: Pick<EditorState, "sections" | "updateSections"> & {
  canEdit: boolean;
  createdAt: Date | string | null;
  policy: LayoutRefreshPolicy;
  /** Every calculation writes its pages again with the current generators. */
  resyncCalculations: () => Promise<void>;
  valuationId: string | null;
}) {
  const apply = (force: boolean): LayoutChange[] => {
    let changes: LayoutChange[] = [];
    updateSections((current) => {
      const steps = layoutStepsFor({ policy, version: layoutVersionOf(current), createdAt, force });
      const result = refreshDocumentLayout(current, steps);
      changes = result.changes;
      return result.sections;
    }, { groupKey: "formato-reciente" });
    if (changes.length) {
      const applied = changes;
      toast.success(NOTICE, {
        description: describeLayoutChanges(applied).join(" "),
        duration: NOTICE_MS,
        action: { label: "Deshacer", onClick: () => updateSections((current) => revertLayoutRefresh(current, applied), { groupKey: "formato-reciente-deshacer" }) },
      });
    }
    return changes;
  };

  // Once per valuation opened: an effect run twice (React's development checks) must not refresh, and notify, twice.
  const refreshedFor = useRef<string | null>(null);
  const refreshOnOpen = useEffectEvent((id: string) => {
    if (refreshedFor.current === id) return;
    refreshedFor.current = id;
    apply(false);
  });
  useEffect(() => {
    if (canEdit && valuationId) refreshOnOpen(valuationId);
  }, [canEdit, valuationId]);

  /** «Actualizar formato»: every step, and the calculations write their pages again. */
  const refreshNow = async () => {
    if (!canEdit || !valuationId) return;
    const changes = apply(true);
    await resyncCalculations();
    if (!changes.length) toast.success("Este avalúo ya tiene el formato más reciente", { description: "Las páginas del cálculo se escribieron otra vez con el formato actual." });
  };

  // Something of the current format is still missing: the policy left it for the button, or the appraiser took it back.
  const pending = useMemo(() => canEdit && refreshDocumentLayout(sections).changes.length > 0, [canEdit, sections]);

  return { pending, refreshNow };
}
