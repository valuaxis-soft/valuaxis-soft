import { requireSession } from "@/security/guards/require-session";
import { ExternalValuationPreviewWindow } from "@/features/valuations/components/workspace/external-valuation-preview-window";

export default async function WorkspacePreviewWindowPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireSession("/workspace");

  const params = await searchParams;
  return <ExternalValuationPreviewWindow valuationId={params.id ?? null} />;
}
