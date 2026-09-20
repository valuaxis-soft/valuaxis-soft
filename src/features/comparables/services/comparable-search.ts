import { listComparables } from "@/features/comparables/repositories/comparable.repository";

export type SearchComparablesParams = {
  postalCode: string;
  operation?: string;
  propertyKind?: string;
  excludeValuationId?: string;
  organizationId: number;
};

export type ComparableSearchResult = {
  current: ComparableItem[];
  history: ComparableHistoryItem[];
};

export type ComparableItem = {
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

export type ComparableHistoryItem = ComparableItem & {
  comparableId: string;
  folio: string;
  usedAt: Date;
};

export async function searchComparablesByPostalCode(
  params: SearchComparablesParams,
): Promise<ComparableSearchResult> {
  const comparables = await listComparables({
    organizationId: params.organizationId,
    postalCode: params.postalCode,
  });

  const filtered = comparables.filter((item) => {
    if (params.operation && item.operation !== params.operation) return false;
    if (params.propertyKind && item.propertyKind !== params.propertyKind) return false;
    return true;
  });

  return {
    current: filtered,
    history: filtered
      .filter((item) => item.status === "historial")
      .map((item) => ({
        ...item,
        comparableId: item.id,
        folio: "",
        usedAt: new Date(),
      })),
  };
}
