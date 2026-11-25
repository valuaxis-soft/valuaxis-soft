import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/features/legal/components/legal-document-view";
import { findCurrentLegalVersion, listPublishedLegalVersions } from "@/features/legal/legal-document.repository";
import { LEGAL_DOCUMENT_TITLES, isLegalDocumentKey } from "@/features/legal/legal-documents";

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

/** The version in force of a legal document; while it has never been published, its draft, marked as such. */
export default async function LegalDocumentPage({ params }: Params) {
  const { documento } = await params;
  if (!isLegalDocumentKey(documento)) notFound();
  const [current, history] = await Promise.all([findCurrentLegalVersion(documento), listPublishedLegalVersions(documento)]);
  if (!current) notFound();
  return <LegalDocumentView version={current} history={history} />;
}
