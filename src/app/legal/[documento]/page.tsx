import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalComingSoon, LegalDocumentView } from "@/features/legal/components/legal-document-view";
import { findCurrentLegalVersion, listPublishedLegalVersions } from "@/features/legal/legal-document.repository";
import { LEGAL_DOCUMENT_TITLES, canShowDraftPublicly, isLegalDocumentKey } from "@/features/legal/legal-documents";

// Read on each visit: a version published with `pnpm legal:publish` shows at once.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ documento: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { documento } = await params;
  if (!isLegalDocumentKey(documento)) return {};
  const current = await findCurrentLegalVersion(documento);
  return {
    title: LEGAL_DOCUMENT_TITLES[documento],
    alternates: { canonical: `/legal/${documento}` },
    // A draft is reachable from sign-up, never indexed.
    robots: current?.published ? undefined : { index: false, follow: false },
  };
}

/**
 * The version in force of a legal document. While it has never been published: the
 * privacy notices show their draft, marked; any other document, «Se publicará próximamente».
 */
export default async function LegalDocumentPage({ params }: Params) {
  const { documento } = await params;
  if (!isLegalDocumentKey(documento)) notFound();
  const [current, history] = await Promise.all([findCurrentLegalVersion(documento), listPublishedLegalVersions(documento)]);
  if (!current) notFound();
  if (!current.published && !canShowDraftPublicly(documento)) return <LegalComingSoon title={LEGAL_DOCUMENT_TITLES[documento]} />;
  return <LegalDocumentView version={current} history={history} />;
}
