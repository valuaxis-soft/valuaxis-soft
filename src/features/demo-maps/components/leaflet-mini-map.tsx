"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

import { comparableType, type DemoComparable, type LatLon } from "../geo";
import type { HighlightedWay, StreetLabel } from "../highlights";
import { basePalette } from "../map-content";
import { createPanes, latLng, drawBase, drawHighlights, subjectIcon } from "./leaflet-draw";

interface MiniMapProps {
  center: LatLon;
  zoom: number;
  subject: LatLon;
  /** Names of the main roads of the drawn base. */
  baseLabels: boolean;
  highlights: readonly HighlightedWay[];
  labels: readonly StreetLabel[];
  comparables: readonly DemoComparable[];
}

/** Croquis of the dictamen without Google Maps: a fixed, light drawn map. */
export default function LeafletMiniMap({ center, zoom, subject, baseLabels, highlights, labels, comparables }: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    });
    createPanes(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // The printed croquis always uses the light palette, like the PDF.
    const base = drawBase(map, { palette: basePalette(false), labels: baseLabels });
    const extra = L.layerGroup().addTo(map);
    drawHighlights(extra, highlights, labels);
    for (const comparable of comparables) {
      L.circleMarker([comparable.lat, comparable.lon], { radius: 4, color: "#fff", weight: 1.5, fillColor: comparableType(comparable.kind).color, fillOpacity: 1 }).addTo(extra);
    }
    L.marker(latLng(subject), { icon: subjectIcon(), interactive: false }).addTo(extra);
    map.setView(latLng(center), zoom, { animate: false });
    map.invalidateSize();
    return () => {
      base.remove();
      extra.remove();
    };
  }, [center, zoom, subject, baseLabels, highlights, labels, comparables]);

  return <div ref={containerRef} aria-hidden="true" className="aspect-[8/5] w-full" style={{ background: basePalette(false).ground }} />;
}
