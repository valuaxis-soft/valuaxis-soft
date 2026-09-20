import { redirect } from "next/navigation";

import { getCurrentUser } from "@/features/auth/session";
import { ExternalValuationPreviewWindow } from "@/features/valuations/components/workspace/external-valuation-preview-window";

export default async function WorkspacePreviewWindowPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?reason=required");

  const params = await searchParams;
  return <ExternalValuationPreviewWindow valuationId={params.id ?? null} />;
}
