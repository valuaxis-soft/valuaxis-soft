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
  appraisalClass?: ValuationMeta["appraisalClass"];
  essence?: string;
  appraisalKind?: string;
  appraisalKindOther?: string;
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
    ...(v.appraisalClass ? { appraisalClass: v.appraisalClass } : {}),
    ...(v.essence ? { essence: v.essence } : {}),
    ...(v.appraisalKind ? { appraisalKind: v.appraisalKind } : {}),
    ...(v.appraisalKindOther ? { appraisalKindOther: v.appraisalKindOther } : {}),
  };
}
