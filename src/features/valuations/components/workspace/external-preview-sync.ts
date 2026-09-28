import type {
  AppSection,
  CaratulaFormData,
  Comparable,
  ImageContent,
  Letterhead,
  PrincipalCoverImage,
  ValuationMeta,
} from "@/features/valuations/model";

export type ExternalPreviewPayload = {
  activeSection: AppSection;
  caratula: CaratulaFormData;
  letterhead: Letterhead;
  documentHeaderImage?: ImageContent | null;
  meta: ValuationMeta;
  principalCoverImage: PrincipalCoverImage | null;
  selectedComparables: Comparable[];
};

export type ExternalPreviewMessage =
  | { type: "preview-ready" }
  | { type: "main-ready" }
  | { payload: ExternalPreviewPayload; type: "preview-state" };

export function getExternalPreviewChannelName(valuationId: string | null) {
  return `valuation-preview:${valuationId ?? "draft"}`;
}
