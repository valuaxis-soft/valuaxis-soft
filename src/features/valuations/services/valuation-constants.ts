import type { ValuationMeta } from "@/features/valuations/model";

export type { ValuationMeta } from "@/features/valuations/model";

export const initialMeta: ValuationMeta = {
  folio: "",
  client: "",
  postalCode: "",
  location: "",
  valuationKind: "venta",
  propertyKind: "casa",
};
