"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

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
 * places the pin and a drag moves it.
 */
export default function ComparableLocationLeaflet({ value, onChange, className }: {
  value: LatLng | null;
  onChange?: (next: LatLng) => void;
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

  return <div ref={containerRef} className={className} role="img" aria-label="Mapa de la ubicación del comparable" />;
}
