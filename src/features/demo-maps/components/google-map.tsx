"use client";

/// <reference types="google.maps" />

import { useEffect, useRef } from "react";

import { DEMO_VALUATIONS, NAMED_WAYS, comparableType, type LatLon } from "../geo";
import { comparableCardHtml, escapeHtml, SUBJECT_COLOR, VALUATION_COLOR } from "../map-content";
import { highlightedWays } from "../static-map";
import { RADIUS_COLOR, SUBJECT_TITLE, type MapViewProps } from "./map-view";

const toLatLng = (p: LatLon): google.maps.LatLngLiteral => ({ lat: p[0], lng: p[1] });

const SUBJECT_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 38C15 38 3 23 3 14a12 12 0 0 1 24 0c0 9-12 24-12 24z" fill="${SUBJECT_COLOR}" stroke="#fff" stroke-width="3"/><circle cx="15" cy="14" r="4" fill="#fff"/></svg>`,
)}`;

interface GoogleParts {
  map: google.maps.Map;
  subject: google.maps.Marker;
  /** Hover card of comparables, valuations and street names. */
  hover: google.maps.InfoWindow;
  /** The "Agregar como comparable" form. */
  popup: google.maps.InfoWindow;
}

/** Google Maps base with the same layers as the drawn map, built on streets.json. */
export default function GoogleMapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<GoogleParts | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const { stage, subject, detection, highlightStyles, comparables, radius, showValuations, selected, popupHost, view } = props;

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
      clickableIcons: false,
    });
    const marker = new google.maps.Marker({
      map,
      position: toLatLng(latest.current.subject),
      draggable: true,
      title: SUBJECT_TITLE,
      zIndex: 1000,
      icon: { url: SUBJECT_ICON, scaledSize: new google.maps.Size(30, 40), anchor: new google.maps.Point(15, 38) },
    });
    marker.addListener("dragend", () => {
      const position = marker.getPosition();
      if (position) latest.current.onSubjectMove([position.lat(), position.lng()]);
    });
    partsRef.current = {
      map,
      subject: marker,
      hover: new google.maps.InfoWindow({ disableAutoPan: true }),
      popup: new google.maps.InfoWindow(),
    };
    return () => {
      google.maps.event.clearInstanceListeners(marker);
      marker.setMap(null);
      partsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const marker = partsRef.current?.subject;
    const position = marker?.getPosition();
    if (marker && (position?.lat() !== subject[0] || position?.lng() !== subject[1])) marker.setPosition(toLatLng(subject));
  }, [subject]);

  // Etapa 2: every named street can be touched to add or remove it as adjoining.
  useEffect(() => {
    const parts = partsRef.current;
    if (!parts || stage !== "etapa-2") return;
    const lines = NAMED_WAYS.map((way) => {
      const line = new google.maps.Polyline({ map: parts.map, path: way.g.map(toLatLng), strokeOpacity: 0, strokeWeight: 14, strokeColor: RADIUS_COLOR, zIndex: 5 });
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
      line.addListener("click", () => latest.current.onStreetClick(way.n));
      return line;
    });
    return () => {
      parts.hover.close();
      for (const line of lines) {
        google.maps.event.clearInstanceListeners(line);
        line.setMap(null);
      }
    };
  }, [stage]);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts || stage !== "etapa-2") return;
    const lines = highlightedWays(detection, highlightStyles).map(
      ({ way, style }, index) =>
        new google.maps.Polyline({ map: parts.map, path: way.g.map(toLatLng), strokeColor: style.color, strokeWeight: style.weight, strokeOpacity: 0.9, clickable: false, zIndex: 2 + index / 1000 }),
    );
    return () => lines.forEach((line) => line.setMap(null));
  }, [stage, detection, highlightStyles]);

  useEffect(() => {
    const map = partsRef.current?.map;
    if (map && stage === "etapa-3" && (map.getZoom() ?? 0) > 16) map.setZoom(15);
  }, [stage]);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts || stage !== "etapa-3") return;
    const circle = new google.maps.Circle({ map: parts.map, center: toLatLng(subject), radius, strokeColor: RADIUS_COLOR, strokeWeight: 1.5, fillColor: RADIUS_COLOR, fillOpacity: 0.06, clickable: false });
    const hoverCard = (marker: google.maps.Marker, html: string) => {
      marker.addListener("mouseover", () => {
        parts.hover.setContent(html);
        parts.hover.open({ map: parts.map, anchor: marker, shouldFocus: false });
      });
      marker.addListener("mouseout", () => parts.hover.close());
    };
    const markers = comparables.map((comparable) => {
      const color = comparableType(comparable.kind).color;
      const marker = new google.maps.Marker({
        map: parts.map,
        position: { lat: comparable.lat, lng: comparable.lon },
        title: comparable.ref,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: comparable.current ? color : "#ffffff",
          fillOpacity: 1,
          strokeColor: comparable.current ? "#ffffff" : color,
          strokeWeight: 3,
        },
      });
      hoverCard(marker, comparableCardHtml(comparable));
      marker.addListener("click", () => {
        parts.hover.close();
        latest.current.onSelect(comparable);
      });
      return marker;
    });
    if (showValuations) {
      for (const valuation of DEMO_VALUATIONS) {
        const marker = new google.maps.Marker({
          map: parts.map,
          position: { lat: valuation.lat, lng: valuation.lon },
          title: valuation.folio,
          icon: { path: "M -7 -7 L 7 -7 L 7 7 L -7 7 Z", fillColor: VALUATION_COLOR, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2, scale: 1 },
        });
        hoverCard(marker, `<strong>${escapeHtml(valuation.folio)}</strong> · ${escapeHtml(valuation.type)} (ejemplo)`);
        markers.push(marker);
      }
    }
    return () => {
      parts.hover.close();
      circle.setMap(null);
      for (const marker of markers) {
        google.maps.event.clearInstanceListeners(marker);
        marker.setMap(null);
      }
    };
  }, [stage, subject, radius, comparables, showValuations]);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts || !selected || !popupHost) return;
    parts.popup.setContent(popupHost);
    parts.popup.setPosition({ lat: selected.lat, lng: selected.lon });
    parts.popup.open({ map: parts.map });
    const listener = parts.popup.addListener("closeclick", () => latest.current.onSelect(null));
    return () => {
      listener.remove();
      parts.popup.close();
    };
  }, [selected, popupHost]);

  useEffect(() => {
    const map = partsRef.current?.map;
    if (!map) return;
    map.setCenter(toLatLng(view.center));
    map.setZoom(view.zoom);
  }, [view]);

  return <div ref={containerRef} role="application" aria-label="Mapa de Loma Bonita, Zapopan" className="h-[420px] w-full sm:h-[560px]" />;
}
