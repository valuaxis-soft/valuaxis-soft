import { requireSession } from "@/security/guards/require-session";
import { ExternalValuationPreviewWindow } from "@/features/valuations/components/workspace/external-valuation-preview-window";

export default async function WorkspacePreviewWindowPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  // An expired session comes back to this same window, not to the editor.
  await requireSession(`/workspace/preview-window?id=${encodeURIComponent(params.id ?? "draft")}`);

  return <ExternalValuationPreviewWindow valuationId={params.id ?? null} />;
}
