import type { DemoComparable, LatLon } from "../geo";
import type { HighlightedWay, StreetLabel } from "@/features/maps/highlights";

export type Stage = "etapa-1" | "etapa-2" | "etapa-3";

export interface MapViewState {
  center: LatLon;
  zoom: number;
}

/** What both map renderers (Google Maps and the drawn Leaflet map) receive. */
export interface MapViewProps {
  stage: Stage;
  subject: LatLon;
  onSubjectMove: (point: LatLon) => void;
  /** Streets to paint, already in drawing order; empty outside etapa 2. */
  highlights: readonly HighlightedWay[];
  /** Names next to the highlighted streets; empty when hidden. */
  labels: readonly StreetLabel[];
  onStreetClick: (name: string) => void;
  /** Base map without points of interest or businesses (Google Maps only). */
  clean: boolean;
  /** Already filtered. */
  comparables: readonly DemoComparable[];
  radius: number;
  showValuations: boolean;
  selected: DemoComparable | null;
  onSelect: (comparable: DemoComparable | null) => void;
  /** Element the page renders the "Agregar como comparable" form into. */
  popupHost: HTMLElement | null;
  /** A new key moves the map to this center and zoom. */
  view: MapViewState & { key: number };
  /** The map reports where the user left it, for "Generar croquis de localización". */
  onViewChange: (view: MapViewState) => void;
  dark: boolean;
}

export const SUBJECT_TITLE = "Inmueble sujeto · Calle Perla 3890 (ejemplo)";
export const RADIUS_COLOR = "#1f7ac2";
