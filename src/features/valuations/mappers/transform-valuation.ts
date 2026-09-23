import type {
  Comparable,
  ValuationMeta,
} from "@/features/valuations/model";

type DbComparable = {
  id: string;
  title: string;
  source: string;
  status: string;
  operation: string;
  propertyKind: string;
  postalCode: string;
  price: string;
  area: string;
  pricePerMeter: string;
  distance: string;
  link: string;
  imageUrl: string | null;
  selected: boolean;
  location: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  parking: string | null;
  antiquity: string | null;
};

export function transformComparables(dbComparables: DbComparable[]): Comparable[] {
  return dbComparables.map((c) => ({
    id: c.id,
    title: c.title,
    source: c.source,
    status: c.status as Comparable["status"],
    operation: c.operation as Comparable["operation"],
    propertyKind: c.propertyKind as Comparable["propertyKind"],
    postalCode: c.postalCode,
    price: c.price,
    area: c.area,
    pricePerMeter: c.pricePerMeter,
    distance: c.distance,
    link: c.link,
    selected: c.selected,
  }));
}

export function valuationMetaFromDb(v: {
  folio: string;
  client: string;
  location: string;
  postalCode: string;
  valuationKind: string;
  propertyKind: string;
}): ValuationMeta {
  return {
    folio: v.folio,
    client: v.client,
    location: v.location,
    postalCode: v.postalCode,
    valuationKind: v.valuationKind as ValuationMeta["valuationKind"],
    propertyKind: v.propertyKind as ValuationMeta["propertyKind"],
  };
}
