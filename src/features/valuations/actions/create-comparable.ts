"use server";

export type CreateComparableInput = {
  valuationId: string;
  title?: string;
  source?: string;
  status?: string;
  operation?: string;
  propertyKind?: string;
  postalCode: string;
  price: string;
  area?: string;
  pricePerMeter?: string;
  distance?: string;
  link?: string;
  imageUrl?: string;
  location?: string;
  bedrooms?: string;
  bathrooms?: string;
  parking?: string;
  antiquity?: string;
};

export async function createComparable(input: CreateComparableInput) {
  void input;
  return {
    ok: false,
    error:
      "La creacion de comparables requiere Propiedad, PublicacionPropiedad y ComparableAvaluo con catalogos reales; no se crearon tablas paralelas.",
  };
}
