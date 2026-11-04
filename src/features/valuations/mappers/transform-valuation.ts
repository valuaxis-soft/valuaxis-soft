import type { ValuationMeta } from "@/features/valuations/model";

export function valuationMetaFromDb(v: {
  folio: string;
  client: string;
  location: string;
  postalCode: string;
  valuationKind: string;
  propertyKind: string;
  propertyKindOther?: string;
  valuationKindOther?: string;
}): ValuationMeta {
  return {
    folio: v.folio,
    client: v.client,
    location: v.location,
    postalCode: v.postalCode,
    valuationKind: v.valuationKind,
    propertyKind: v.propertyKind,
    ...(v.propertyKindOther ? { propertyKindOther: v.propertyKindOther } : {}),
    ...(v.valuationKindOther ? { valuationKindOther: v.valuationKindOther } : {}),
  };
}
