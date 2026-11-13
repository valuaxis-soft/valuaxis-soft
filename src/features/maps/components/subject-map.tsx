"use client";

/// <reference types="google.maps" />

import { useEffect, useRef } from "react";

import { COMPARABLE_PIN_COLORS, SUBJECT_PIN_COLOR, type ComparablePin } from "../croquis";
import { isMacroZoom, isMainRoad, type HighlightedWay, type StreetLabel } from "../highlights";
import { CLEAN_MAP_STYLES, type MapType } from "../map-styles";
import type { StreetWay } from "../streets";
import type { LatLon } from "../types";

const toLatLng = (p: LatLon): google.maps.LatLngLiteral => ({ lat: p[0], lng: p[1] });

const SUBJECT_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 38C15 38 3 23 3 14a12 12 0 0 1 24 0c0 9-12 24-12 24z" fill="${SUBJECT_PIN_COLOR}" stroke="#fff" stroke-width="3"/><circle cx="15" cy="14" r="4" fill="#fff"/></svg>`,
)}`;

/** The number of a comparable beside its pin: a white chip, readable over any map. */
const PIN_LABEL_CLASS =
  "rounded-sm! border-0! bg-white/95! px-1! py-px! text-[11px]! leading-4! font-bold! text-[#12212f]! whitespace-nowrap! shadow-[0_0_0_1px_rgba(0,0,0,.18)]!";
/** Street name next to a highlighted street: the same chip, a little lighter. */
const STREET_LABEL_CLASS =
  "rounded-sm! border-0! bg-white/95! px-1! py-px! text-[11px]! leading-4! font-semibold! text-[#12212f]! whitespace-nowrap! shadow-[0_0_0_1px_rgba(0,0,0,.18)]! before:hidden!";
/** The invisible, wide line that catches the click on a street. */
const HIT_LINE_COLOR = "#1f7ac2";

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
  /** Street map or satellite photo (V6.3-08). */
  mapType: MapType;
  /** Numbered pins of the comparables; empty when they are not included. */
  pins: readonly ComparablePin[];
  /** Etapa 2: the streets that can be touched to paint them; empty while they load or when the valuation is concluded. */
  streets: readonly StreetWay[];
  /** Streets to paint, already in drawing order. */
  highlights: readonly HighlightedWay[];
  /** Names next to the highlighted streets; empty when hidden. */
  labels: readonly StreetLabel[];
  onStreetClick?: (name: string) => void;
  /** A click on the map that hit no street (nor a pin): the panel says why, when the streets did not load. */
  onMapClick?: () => void;
  /** A new key moves the map to this center and zoom. */
  view: MapView & { key: number };
  /** The map reports where the user left it, for "Tomar del mapa". */
  onViewChange: (view: MapView) => void;
  /** Height of the map; the expanded view fills the screen. */
  className?: string;
}

interface Parts {
  map: google.maps.Map;
  subject: google.maps.Marker;
  hover: google.maps.InfoWindow;
}

/**
 * The interactive map of the croquis panel: the subject's pin, the
 * comparables numbered, the highlighted streets with their names and the
 * clean base. Needs the Maps JavaScript API loaded.
 */
export function SubjectMap(props: SubjectMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<Parts | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const { subject, onSubjectMove, clean, mapType, pins, streets, highlights, labels, view } = props;
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
      // The panel's own «Ampliar» keeps the controls beside the map; Google's full screen would hide them.
      fullscreenControl: false,
      clickableIcons: false,
      styles: mapStyles(latest.current.clean),
      mapTypeId: latest.current.mapType,
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
    map.addListener("click", () => latest.current.onMapClick?.());
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
    partsRef.current?.map.setMapTypeId(mapType);
  }, [mapType]);

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

  // Etapa 2: every named street can be touched to paint it; at macro zoom, only the avenues.
  useEffect(() => {
    const parts = partsRef.current;
    if (!parts || !streets.length) return;
    const lines = streets
      .filter((way) => way.n)
      .map((way) => {
        const line = new google.maps.Polyline({ map: parts.map, path: way.g.map(toLatLng), strokeOpacity: 0, strokeWeight: 14, strokeColor: HIT_LINE_COLOR, zIndex: 5 });
        line.addListener("mouseover", (event: google.maps.PolyMouseEvent) => {
          line.setOptions({ strokeOpacity: 0.25 });
          parts.hover.setContent(`<strong>${escapeHtml(way.n)}</strong>`);
          if (event.latLng) parts.hover.setPosition(event.latLng);
          parts.hover.open({ map: parts.map, shouldFocus: false });
        });
        line.addListener("mouseout", () => {
          line.setOptions({ strokeOpacity: 0 });
          parts.hover.close();
        });
        line.addListener("click", () => latest.current.onStreetClick?.(way.n));
        return { way, line };
      });
    const sync = () => {
      const macro = isMacroZoom(parts.map.getZoom() ?? 17);
      for (const { way, line } of lines) line.setVisible(!macro || isMainRoad(way));
    };
    const listener = parts.map.addListener("zoom_changed", sync);
    sync();
    return () => {
      listener.remove();
      parts.hover.close();
      for (const { line } of lines) {
        google.maps.event.clearInstanceListeners(line);
        line.setMap(null);
      }
    };
  }, [streets]);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts) return;
    const lines = highlights.map(
      ({ way, style }, index) =>
        new google.maps.Polyline({ map: parts.map, path: way.g.map(toLatLng), strokeColor: style.color, strokeWeight: style.weight, strokeOpacity: 0.9, clickable: false, zIndex: 2 + index / 1000 }),
    );
    // A marker without a symbol carries the name as a label on a white chip.
    const chips = labels.map(
      (label) =>
        new google.maps.Marker({
          map: parts.map,
          position: toLatLng(label.point),
          clickable: false,
          zIndex: 4,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0, labelOrigin: new google.maps.Point(0, -14) },
          label: { text: label.name, className: STREET_LABEL_CLASS, color: "#12212f", fontSize: "11px", fontWeight: "600" },
        }),
    );
    return () => {
      for (const line of lines) line.setMap(null);
      for (const chip of chips) chip.setMap(null);
    };
  }, [highlights, labels]);

  useEffect(() => {
    const map = partsRef.current?.map;
    if (!map) return;
    map.setCenter(toLatLng(view.center));
    map.setZoom(view.zoom);
  }, [view]);

  return <div ref={containerRef} role="application" aria-label="Mapa de ubicación del inmueble" className={props.className ?? "h-[380px] w-full sm:h-[460px]"} />;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
