import type { Comparable, ValuationMeta } from "@/features/valuations/model";

export type {
  Comparable,
  ValuationMeta,
} from "@/features/valuations/model";

export const initialMeta: ValuationMeta = {
  folio: "",
  client: "",
  postalCode: "",
  location: "",
  valuationKind: "venta",
  propertyKind: "casa",
};

export const initialComparables: Comparable[] = [];
