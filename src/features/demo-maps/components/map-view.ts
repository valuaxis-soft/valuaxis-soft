import type { DemoComparable, LatLon, StreetDetection } from "../geo";
import type { HighlightStyles } from "../static-map";

export type Stage = "etapa-1" | "etapa-2" | "etapa-3";

/** What both map renderers (Google Maps and the drawn Leaflet map) receive. */
export interface MapViewProps {
  stage: Stage;
  subject: LatLon;
  onSubjectMove: (point: LatLon) => void;
  detection: StreetDetection;
  highlightStyles: HighlightStyles;
  onStreetClick: (name: string) => void;
  /** Already filtered. */
  comparables: readonly DemoComparable[];
  radius: number;
  showValuations: boolean;
  selected: DemoComparable | null;
  onSelect: (comparable: DemoComparable | null) => void;
  /** Element the page renders the "Agregar como comparable" form into. */
  popupHost: HTMLElement | null;
  /** A new key moves the map to this center and zoom. */
  view: { center: LatLon; zoom: number; key: number };
  dark: boolean;
}

export const SUBJECT_TITLE = "Inmueble sujeto · Calle Perla 3890 (ejemplo)";
export const RADIUS_COLOR = "#1f7ac2";
