import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { ValuationDictamen } from "@/features/valuations/components/dictamen/valuation-dictamen";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Dictamen" };

export default async function DictamenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession(`/avaluos/${id}/dictamen`);
  if (!hasPermission(user, AUTH_PERMISSIONS.exportValuations)) redirect(`/workspace?id=${id}`);

  const valuation = await getValuationByPublicId(id, user.organizationId);
  if (!valuation) redirect("/avaluos");

  const requestHeaders = await headers();
  await auditValuation({
    action: "EXPORT",
    user,
    valuationPublicId: id,
    request: new Request(`http://internal/avaluos/${id}/dictamen`, { headers: requestHeaders }),
    metadata: { format: "dictamen" },
  });

  return <ValuationDictamen companyName={user.organizationName} initialValuation={valuation} valuationId={id} />;
}
