"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export type LatLng = { latitude: number; longitude: number };

/** The centre of Mexico, where the map opens when the comparable has no coordinates yet. */
const MEXICO: LatLng = { latitude: 23.6345, longitude: -102.5528 };
const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>";

/** A pin drawn with CSS: Leaflet's default icon needs image files the bundle does not serve. */
function pinIcon() {
  return L.divIcon({
    className: "",
    html: "<div style=\"width:24px;height:24px;border-radius:50% 50% 50% 0;background:#003B73;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)\"></div>",
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });
}

/**
 * The map of the card, with OpenStreetMap tiles (no Google Maps): fixed with
 * the pin of the comparable, or, when `onChange` is given, one where a click
 * places the pin and a drag moves it. `approximate` (V7.2-06) is where the
 * address was found: the map goes there and marks it with a dashed circle,
 * without placing the pin.
 */
export default function ComparableLocationLeaflet({ value, onChange, approximate, className }: {
  value: LatLng | null;
  onChange?: (next: LatLng) => void;
  approximate?: LatLng | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const latestChange = useRef(onChange);
  useEffect(() => {
    latestChange.current = onChange;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const editable = Boolean(latestChange.current);
    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
      dragging: true,
      scrollWheelZoom: editable,
    });
    L.tileLayer(OSM_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    const start = value ?? MEXICO;
    map.setView([start.latitude, start.longitude], value ? 16 : 5, { animate: false });
    if (editable) {
      map.on("click", (event: L.LeafletMouseEvent) => latestChange.current?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
    }
    mapRef.current = map;
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is created once; the pin follows `value` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const position: L.LatLngTuple = [value.latitude, value.longitude];
    if (markerRef.current) {
      markerRef.current.setLatLng(position);
    } else {
      const marker = L.marker(position, { icon: pinIcon(), draggable: Boolean(latestChange.current), title: "Comparable" }).addTo(map);
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        latestChange.current?.({ latitude: lat, longitude: lng });
      });
      markerRef.current = marker;
      if (!latestChange.current) map.setView(position, 16, { animate: false });
    }
  }, [value]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !approximate) return;
    const circle = L.circle([approximate.latitude, approximate.longitude], {
      radius: 120, color: "#003B73", weight: 2, dashArray: "6 6", fillOpacity: 0.08, interactive: false,
    }).addTo(map);
    map.setView([approximate.latitude, approximate.longitude], 16, { animate: false });
    return () => {
      circle.remove();
    };
  }, [approximate]);

  // `isolate`: Leaflet's panes and controls (z-index 400 to 1000) stay inside the map instead of
  // drawing over a dialog opened above it, such as «Reubicar» (V7.3-18).
  return <div ref={containerRef} className={cn("isolate", className)} role="img" aria-label="Mapa de la ubicación del comparable" />;
}
