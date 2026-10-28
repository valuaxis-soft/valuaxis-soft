"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

import { DEMO_BOUNDS, DEMO_VALUATIONS, comparableType } from "../geo";
import { basePalette, comparableCardHtml, escapeHtml, VALUATION_COLOR } from "../map-content";
import { highlightedWays } from "../static-map";
import {
  CARD_TOOLTIP_CLASS,
  comparableIcon,
  createPanes,
  drawBase,
  drawHighlights,
  latLng,
  subjectIcon,
  valuationIcon,
} from "./leaflet-draw";
import { RADIUS_COLOR, SUBJECT_TITLE, type MapViewProps } from "./map-view";

const POPUP_CLASS =
  "[&_.leaflet-popup-content-wrapper]:bg-popover [&_.leaflet-popup-content-wrapper]:text-popover-foreground [&_.leaflet-popup-tip]:bg-popover";

interface LeafletParts {
  map: L.Map;
  highlights: L.LayerGroup;
  comparables: L.LayerGroup;
  subject: L.Marker;
}

/** Fallback without Google Maps: the street map drawn from streets.json, as in the approved prototype. */
export default function LeafletMapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<LeafletParts | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const { stage, subject, detection, highlightStyles, comparables, radius, showValuations, selected, popupHost, view, dark } = props;

  // Created once; the effects below run after this one in the same commit.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const [[south, west], [north, east]] = DEMO_BOUNDS;
    const bounds = L.latLngBounds([south, west], [north, east]).pad(0.05);
    const { center, zoom } = latest.current.view;
    const map = L.map(container, { zoomControl: true, attributionControl: false, minZoom: 14, maxZoom: 18, maxBounds: bounds }).setView(latLng(center), zoom);
    createPanes(map);
    const marker = L.marker(latLng(latest.current.subject), { draggable: true, icon: subjectIcon(), zIndexOffset: 1000, title: "Inmueble sujeto", keyboard: true })
      .bindTooltip(SUBJECT_TITLE, { direction: "top", offset: [0, -24] })
      .addTo(map);
    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng();
      latest.current.onSubjectMove([lat, lng]);
    });
    partsRef.current = { map, highlights: L.layerGroup().addTo(map), comparables: L.layerGroup().addTo(map), subject: marker };
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container);
    return () => {
      resize.disconnect();
      map.remove();
      partsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts) return;
    const base = drawBase(parts.map, { palette: basePalette(dark), onStreet: (name) => latest.current.onStreetClick(name) });
    return () => {
      base.remove();
    };
  }, [dark]);

  useEffect(() => {
    const marker = partsRef.current?.subject;
    if (!marker) return;
    const current = marker.getLatLng();
    if (current.lat !== subject[0] || current.lng !== subject[1]) marker.setLatLng(latLng(subject));
  }, [subject]);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts) return;
    drawHighlights(parts.highlights, stage === "etapa-2" ? highlightedWays(detection, highlightStyles) : []);
  }, [stage, detection, highlightStyles]);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts || stage !== "etapa-3") return;
    if (parts.map.getZoom() > 16) parts.map.setZoom(15);
  }, [stage]);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts) return;
    const group = parts.comparables;
    group.clearLayers();
    if (stage !== "etapa-3") return;
    L.circle(latLng(subject), { radius, color: RADIUS_COLOR, weight: 1.5, dashArray: "6 6", fillColor: RADIUS_COLOR, fillOpacity: 0.06, interactive: false }).addTo(group);
    for (const comparable of comparables) {
      L.marker([comparable.lat, comparable.lon], { icon: comparableIcon(comparable, comparableType(comparable.kind).color), title: comparable.ref })
        .bindTooltip(comparableCardHtml(comparable), { className: CARD_TOOLTIP_CLASS, direction: "top", offset: [0, -10], opacity: 1 })
        .on("click", () => latest.current.onSelect(comparable))
        .addTo(group);
    }
    if (showValuations) {
      for (const valuation of DEMO_VALUATIONS) {
        L.marker([valuation.lat, valuation.lon], { icon: valuationIcon(VALUATION_COLOR), title: valuation.folio })
          .bindTooltip(`<strong>${escapeHtml(valuation.folio)}</strong> · ${escapeHtml(valuation.type)} (ejemplo)`, { direction: "top" })
          .addTo(group);
      }
    }
  }, [stage, subject, radius, comparables, showValuations]);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts || !selected || !popupHost) return;
    const popup = L.popup({ maxWidth: 280, minWidth: 220, offset: [0, -4], className: POPUP_CLASS })
      .setLatLng([selected.lat, selected.lon])
      .setContent(popupHost)
      .openOn(parts.map);
    const onClose = () => latest.current.onSelect(null);
    popup.on("remove", onClose);
    return () => {
      popup.off("remove", onClose);
      parts.map.closePopup(popup);
    };
  }, [selected, popupHost]);

  useEffect(() => {
    partsRef.current?.map.setView(latLng(view.center), view.zoom);
  }, [view]);

  return <div ref={containerRef} role="application" aria-label="Mapa de Loma Bonita, Zapopan" className="h-[420px] w-full sm:h-[560px]" style={{ background: basePalette(dark).ground }} />;
}
