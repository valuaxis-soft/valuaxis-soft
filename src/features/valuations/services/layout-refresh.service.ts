import { prisma } from "@/infrastructure/database/prisma-client";
import { initialSectionsFor } from "@/features/valuations/components/workspace/model/initial-hydration";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";
import {
  describeLayoutChanges,
  layoutStepsFor,
  layoutVersionOf,
  refreshDocumentLayout,
  type LayoutChange,
  type LayoutRefreshPolicy,
} from "./layout-refresh";

export type LayoutRefreshPlan = {
  organizationId: number;
  publicId: string;
  folio: string;
  /** The version of the format the document was brought up to (0: never). */
  version: number;
  /** What opening it would change, as the policy says. */
  onOpen: LayoutChange[];
  /** What «Actualizar formato» would change (every step). */
  withButton: LayoutChange[];
  /** The same, in sentences of the format (never captured data). */
  summary: string[];
};

/**
 * What the change of format would do to each valuation that is not concluded,
 * without writing anything (`pnpm valuations:refresh-layout`). The document
 * is read as the editor reads it and the same steps run over it; concluded
 * valuations (`BBloqueado`) are not read.
 */
export async function planLayoutRefreshes(options: { policy: LayoutRefreshPolicy; organizationId?: number | null; publicIds?: string[] }): Promise<{ plans: LayoutRefreshPlan[]; concluded: number }> {
  const where = {
    BActivo: true,
    DFechaEliminacion: null,
    ...(options.organizationId ? { IdOrganizacion: options.organizationId } : {}),
    ...(options.publicIds ? { UIdentificadorPublico: { in: options.publicIds } } : {}),
  };
  const [valuations, concluded] = await Promise.all([
    prisma.avaluo.findMany({
      where: { ...where, BBloqueado: false },
      orderBy: [{ IdOrganizacion: "asc" }, { SFolio: "asc" }],
      select: { UIdentificadorPublico: true, IdOrganizacion: true },
    }),
    prisma.avaluo.count({ where: { ...where, BBloqueado: true } }),
  ]);

  const plans: LayoutRefreshPlan[] = [];
  for (const valuation of valuations) {
    const detail = await getValuationByPublicId(valuation.UIdentificadorPublico, valuation.IdOrganizacion);
    if (!detail || detail.locked) continue;
    const sections = initialSectionsFor(detail);
    const version = layoutVersionOf(sections);
    const onOpen = refreshDocumentLayout(sections, layoutStepsFor({ policy: options.policy, version, createdAt: detail.createdAt })).changes;
    const withButton = refreshDocumentLayout(sections, layoutStepsFor({ policy: options.policy, version, force: true })).changes;
    plans.push({
      organizationId: valuation.IdOrganizacion,
      publicId: detail.id,
      folio: detail.folio,
      version,
      onOpen,
      withButton,
      summary: describeLayoutChanges(withButton),
    });
  }
  return { plans, concluded };
}
