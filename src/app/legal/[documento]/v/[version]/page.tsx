import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/features/legal/components/legal-document-view";
import { findLegalVersion, listPublishedLegalVersions } from "@/features/legal/legal-document.repository";
import { LEGAL_DOCUMENT_TITLES, isLegalDocumentKey } from "@/features/legal/legal-documents";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ documento: string; version: string }> };

const versionNumber = (value: string) => (/^\d{1,6}$/.test(value) ? Number(value) : null);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { documento, version } = await params;
  if (!isLegalDocumentKey(documento)) return {};
  return {
    title: `${LEGAL_DOCUMENT_TITLES[documento]}, versión ${version}`,
    alternates: { canonical: `/legal/${documento}` },
    robots: { index: false, follow: true },
  };
}

/**
 * A given version of a legal document: every published one stays available
 * (Terms 15.2; matrix 3.1). A draft only while nothing of the document is published.
 */
export default async function LegalDocumentVersionPage({ params }: Params) {
  const { documento, version } = await params;
  const number = versionNumber(version);
  if (!isLegalDocumentKey(documento) || number === null) notFound();
  const [found, history] = await Promise.all([findLegalVersion(documento, number), listPublishedLegalVersions(documento)]);
  if (!found) notFound();
  return <LegalDocumentView version={found} history={history} />;
}
