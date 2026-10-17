import type {
  AppSection,
  CaratulaFormData,
  ImageContent,
  Letterhead,
  PrincipalCoverImage,
  ValuationMeta,
} from "@/features/valuations/model";
import type { NumberPresentation } from "@/features/valuations/services/number-presentation";
import type { PagePresentation } from "@/features/valuations/services/page-presentation";

export type ExternalPreviewPayload = {
  activeSection: AppSection;
  caratula: CaratulaFormData;
  letterhead: Letterhead;
  documentHeaderImage?: ImageContent | null;
  meta: ValuationMeta;
  principalCoverImage: PrincipalCoverImage | null;
  /** How the document writes its numbers; a main tab on an older version sends none. */
  numberPresentation?: NumberPresentation;
  /** How the document lays out its pages; a main tab on an older version sends none. */
  pagePresentation?: PagePresentation;
};

export type ExternalPreviewMessage =
  | { type: "preview-ready" }
  | { type: "main-ready" }
  | { payload: ExternalPreviewPayload; type: "preview-state" };

export function getExternalPreviewChannelName(valuationId: string | null) {
  return `valuation-preview:${valuationId ?? "draft"}`;
}
