/**
 * What the map of the firm's base of comparables (etapa 3 of the maps quote)
 * exchanges with the browser: one pin per comparable with coordinates, the
 * hits of a radius search and the subject of each valuation of the firm.
 */
import type { OperationType } from "@/features/valuations/calculation/comparable-card";
import type { ComparableType } from "@/features/valuations/calculation/market-types";

export interface ComparablePinDto {
  /** Its most recent capture: the card is /comparables/<id>, and "Usar el existente" takes it. */
  id: string;
  folio: number | null;
  type: ComparableType;
  operationType: OperationType;
  location: string;
  lat: number;
  lon: number;
  /** The area of its type (land, built or rentable), m². */
  area: number | null;
  landArea: number | null;
  builtArea: number | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sourceName: string | null;
  /** The listing, when captured with its address. */
  url: string | null;
  thumbnailUrl: string | null;
  /** "Fecha de alta / actualización" and "Vigente hasta", YYYY-MM-DD. */
  updatedOn: string;
  validUntil: string;
  /** Past its validity: a hollow pin. */
  expired: boolean;
}

export interface ComparablePinsDto {
  pins: ComparablePinDto[];
  /** How many comparables of the filters have coordinates; more than `pins` when the map was capped. */
  located: number;
  /** "N sin ubicar": comparables of the filters without coordinates. */
  unlocated: number;
}

/** A comparable within the radius searched, with its distance to the center in meters. */
export interface RadiusHitDto extends ComparablePinDto {
  distance: number;
}

export interface ValuationPinDto {
  id: string;
  folio: string;
  title: string;
  client: string | null;
  /** Lowercase SClave of the status, and its name. */
  status: string;
  statusName: string;
  propertyKindName: string;
  /** ISO date of the last change. */
  updatedAt: string;
  archived: boolean;
  lat: number;
  lon: number;
  /** The address the pin was found with, or the carátula's. */
  address: string | null;
}
