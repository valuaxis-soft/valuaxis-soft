import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { valuationRequiresUnaccreditedNotice } from "@/features/accreditation/accreditation.service";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { getLetterhead } from "@/features/firm/firm.service";
import { isInternalRender } from "@/infrastructure/pdf/internal-render";
import { ValuationDictamen } from "@/features/valuations/components/dictamen/valuation-dictamen";
import { getValuationByPublicId, getValuationVersionByPublicId } from "@/features/valuations/repositories/valuation.repository";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Dictamen" };

/** `?version=2`: that version as it was saved, read-only, from the valuation's «Historial». */
function versionParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^\d{1,4}$/.test(raw) ? Number.parseInt(raw, 10) : null;
}

export default async function DictamenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const version = versionParam((await searchParams).version);
  const user = await requireSession(`/avaluos/${id}/dictamen${version ? `?version=${version}` : ""}`);
  if (!hasPermission(user, AUTH_PERMISSIONS.exportValuations)) redirect(`/workspace?id=${id}`);

  const valuation = version
    ? await getValuationVersionByPublicId(id, user.organizationId, version)
    : await getValuationByPublicId(id, user.organizationId);
  if (!valuation) redirect(version ? `/workspace?id=${id}` : "/avaluos");

  const requestHeaders = await headers();
  // The server's PDF renderer opening this page is not a separate export: the PDF route audits it.
  if (!isInternalRender(requestHeaders)) {
    await auditValuation({
      action: "EXPORT",
      user,
      valuationPublicId: id,
      request: new Request(`http://internal/avaluos/${id}/dictamen`, { headers: requestHeaders }),
      metadata: version ? { format: "dictamen", version } : { format: "dictamen" },
    });
  }

  const [letterhead, unaccreditedNotice] = await Promise.all([
    getLetterhead(user.organizationId),
    valuationRequiresUnaccreditedNotice(id, user.organizationId),
  ]);
  return (
    <ValuationDictamen
      letterhead={letterhead}
      initialValuation={valuation}
      valuationId={id}
      canShare={hasPermission(user, AUTH_PERMISSIONS.shareValuations)}
      unaccreditedNotice={unaccreditedNotice}
      readOnlyVersion={version}
    />
  );
}
