"use client";

/// <reference types="google.maps" />

import { useEffect, useRef } from "react";

import { COMPARABLE_PIN_COLORS, SUBJECT_PIN_COLOR, type ComparablePin } from "../croquis";
import { CLEAN_MAP_STYLES } from "../map-styles";
import type { LatLon } from "../types";

const toLatLng = (p: LatLon): google.maps.LatLngLiteral => ({ lat: p[0], lng: p[1] });

const SUBJECT_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 38C15 38 3 23 3 14a12 12 0 0 1 24 0c0 9-12 24-12 24z" fill="${SUBJECT_PIN_COLOR}" stroke="#fff" stroke-width="3"/><circle cx="15" cy="14" r="4" fill="#fff"/></svg>`,
)}`;

/** The number of a comparable beside its pin: a white chip, readable over any map. */
const PIN_LABEL_CLASS =
  "rounded-sm! border-0! bg-white/95! px-1! py-px! text-[11px]! leading-4! font-bold! text-[#12212f]! whitespace-nowrap! shadow-[0_0_0_1px_rgba(0,0,0,.18)]!";

/** `styles` is mutable in the API's types; the rules themselves never change. */
const mapStyles = (clean: boolean) => (clean ? CLEAN_MAP_STYLES.map((rule) => ({ ...rule, stylers: [...rule.stylers] })) : null);

export interface MapView {
  center: LatLon;
  zoom: number;
}

export interface SubjectMapProps {
  /** The pin; null until the appraiser places it (the map then shows `view` alone). */
  subject: LatLon | null;
  /** The appraiser dragged the pin. Absent, the pin is fixed (a concluded valuation). */
  onSubjectMove?: (point: LatLon) => void;
  /** Base map without points of interest or businesses. */
  clean: boolean;
  /** Numbered pins of the comparables; empty when they are not included. */
  pins: readonly ComparablePin[];
  /** A new key moves the map to this center and zoom. */
  view: MapView & { key: number };
  /** The map reports where the user left it, for "Tomar del mapa". */
  onViewChange: (view: MapView) => void;
}

interface Parts {
  map: google.maps.Map;
  subject: google.maps.Marker;
  hover: google.maps.InfoWindow;
}

/** The interactive map of the croquis panel: the subject's pin, the comparables numbered, the clean base. Needs the Maps JavaScript API loaded. */
export function SubjectMap(props: SubjectMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<Parts | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const { subject, onSubjectMove, clean, pins, view } = props;
  const draggable = Boolean(onSubjectMove);

  // Created once; the effects below run after this one in the same commit.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new google.maps.Map(container, {
      center: toLatLng(latest.current.view.center),
      zoom: latest.current.view.zoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      // Bottom right, next to the zoom, so the corners stay free for the north arrow.
      fullscreenControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      clickableIcons: false,
      styles: mapStyles(latest.current.clean),
    });
    const marker = new google.maps.Marker({
      map: latest.current.subject ? map : null,
      position: latest.current.subject ? toLatLng(latest.current.subject) : undefined,
      draggable: Boolean(latest.current.onSubjectMove),
      title: "Inmueble sujeto",
      zIndex: 1000,
      icon: { url: SUBJECT_ICON, scaledSize: new google.maps.Size(30, 40), anchor: new google.maps.Point(15, 38) },
    });
    marker.addListener("dragend", () => {
      const position = marker.getPosition();
      if (position) latest.current.onSubjectMove?.([position.lat(), position.lng()]);
    });
    map.addListener("idle", () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      if (center && zoom !== undefined) latest.current.onViewChange({ center: [center.lat(), center.lng()], zoom });
    });
    partsRef.current = { map, subject: marker, hover: new google.maps.InfoWindow({ disableAutoPan: true }) };
    return () => {
      google.maps.event.clearInstanceListeners(map);
      google.maps.event.clearInstanceListeners(marker);
      marker.setMap(null);
      partsRef.current = null;
    };
  }, []);

  useEffect(() => {
    partsRef.current?.map.setOptions({ styles: mapStyles(clean) });
  }, [clean]);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts) return;
    const marker = parts.subject;
    if (!subject) {
      marker.setMap(null);
      return;
    }
    const position = marker.getPosition();
    if (position?.lat() !== subject[0] || position?.lng() !== subject[1]) marker.setPosition(toLatLng(subject));
    marker.setDraggable(draggable);
    if (!marker.getMap()) marker.setMap(parts.map);
  }, [subject, draggable]);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts) return;
    const markers = pins.map((pin) => {
      const color = COMPARABLE_PIN_COLORS[pin.type];
      const marker = new google.maps.Marker({
        map: parts.map,
        position: toLatLng(pin.point),
        title: `${pin.label} · ${pin.location}`,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2.5, labelOrigin: new google.maps.Point(0, -2.2) },
        label: { text: pin.label, className: PIN_LABEL_CLASS, color: "#12212f", fontSize: "11px", fontWeight: "700" },
        zIndex: 10,
      });
      marker.addListener("mouseover", () => {
        parts.hover.setContent(`<strong>${pin.label}</strong><br>${escapeHtml(pin.location)}`);
        parts.hover.open({ map: parts.map, anchor: marker, shouldFocus: false });
      });
      marker.addListener("mouseout", () => parts.hover.close());
      return marker;
    });
    return () => {
      parts.hover.close();
      for (const marker of markers) {
        google.maps.event.clearInstanceListeners(marker);
        marker.setMap(null);
      }
    };
  }, [pins]);

  useEffect(() => {
    const map = partsRef.current?.map;
    if (!map) return;
    map.setCenter(toLatLng(view.center));
    map.setZoom(view.zoom);
  }, [view]);

  return <div ref={containerRef} role="application" aria-label="Mapa de ubicación del inmueble" className="h-[380px] w-full sm:h-[460px]" />;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
