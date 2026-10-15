import type {
  AppSection,
  CaratulaFormData,
  Comparable,
  ImageContent,
  Letterhead,
  PrincipalCoverImage,
  ValuationMeta,
} from "@/features/valuations/model";
import type { NumberPresentation } from "@/features/valuations/services/number-presentation";

export type ExternalPreviewPayload = {
  activeSection: AppSection;
  caratula: CaratulaFormData;
  letterhead: Letterhead;
  documentHeaderImage?: ImageContent | null;
  meta: ValuationMeta;
  principalCoverImage: PrincipalCoverImage | null;
  selectedComparables: Comparable[];
  /** How the document writes its numbers; a main tab on an older version sends none. */
  numberPresentation?: NumberPresentation;
};

export type ExternalPreviewMessage =
  | { type: "preview-ready" }
  | { type: "main-ready" }
  | { payload: ExternalPreviewPayload; type: "preview-state" };

export function getExternalPreviewChannelName(valuationId: string | null) {
  return `valuation-preview:${valuationId ?? "draft"}`;
}
