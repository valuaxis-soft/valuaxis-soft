"use client";

/// <reference types="google.maps" />

import { useEffect, useRef } from "react";

import { COMPARABLE_PIN_COLORS, SUBJECT_PIN_COLOR, type ComparablePin } from "../croquis";
import { FREE_LINE_OPACITY, type FreeLine, type FreeLineStyle } from "../free-lines";
import { isMacroZoom, isMainRoad, type HighlightedWay, type StreetLabel } from "../highlights";
import { CLEAN_MAP_STYLES, type MapType } from "../map-styles";
import type { StreetWay } from "../streets";
import type { LatLon } from "../types";

const NO_LINES: readonly FreeLine[] = [];

const toLatLng = (p: LatLon): google.maps.LatLngLiteral => ({ lat: p[0], lng: p[1] });

const SUBJECT_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 38C15 38 3 23 3 14a12 12 0 0 1 24 0c0 9-12 24-12 24z" fill="${SUBJECT_PIN_COLOR}" stroke="#fff" stroke-width="3"/><circle cx="15" cy="14" r="4" fill="#fff"/></svg>`,
)}`;

/** The number of a comparable beside its pin: a white chip, readable over any map. */
const PIN_LABEL_CLASS =
  "rounded-sm! border-0! bg-white/95! px-1! py-px! text-[11px]! leading-4! font-bold! text-[#12212f]! whitespace-nowrap! shadow-[0_0_0_1px_rgba(0,0,0,.18)]!";
/**
 * A street name next to a highlighted street: a white chip edged with its
 * street's color, drawn as the marker's own icon so the whole chip can be
 * grabbed and dragged (FAL-35: as a label of an invisible marker, dragging
 * it moved the map).
 */
function streetLabelIcon(name: string, color: string): google.maps.Icon {
  const width = Math.round(name.length * 6.4 + 14);
  const height = 18;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect x="0.75" y="0.75" width="${width - 1.5}" height="${height - 1.5}" rx="8.25" fill="#ffffff" fill-opacity="0.95" stroke="${escapeHtml(color)}" stroke-width="1.5"/>` +
    `<text x="${width / 2}" y="12.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="600" fill="#12212f">${escapeHtml(name)}</text>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(width / 2, height + 6),
  };
}
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
  /** FAL-35: a name was dragged to this point. Absent, the names stay put (a concluded valuation, or while drawing). */
  onLabelMove?: (label: StreetLabel, point: LatLon) => void;
  onStreetClick?: (name: string) => void;
  /** A click on the map that hit no street (nor a pin): the panel says why, when the streets did not load. */
  onMapClick?: () => void;
  /** «Trazo libre»: the lines drawn by hand, in the order they were drawn. */
  freeLines?: readonly FreeLine[];
  /** The line being drawn, vertex by vertex; null when not drawing. While drawing, a click on the map adds a vertex. */
  draft?: readonly LatLon[] | null;
  /** The color and width of the line being drawn. */
  draftStyle?: FreeLineStyle;
  /** The line whose vertices can be dragged. */
  selectedLineId?: string | null;
  onDrawPoint?: (point: LatLon) => void;
  /** A double click while drawing: the line is finished. */
  onDrawFinish?: () => void;
  /** A click on a line selects it; a click on the map, null. */
  onLineSelect?: (id: string | null) => void;
  /** A vertex of the selected line was dragged, added or removed. Absent, the lines cannot be changed (a concluded valuation). */
  onLinePointsChange?: (id: string, points: LatLon[]) => void;
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

  const { subject, onSubjectMove, clean, mapType, pins, streets, highlights, labels, view, freeLines = NO_LINES, draft = null, draftStyle, selectedLineId = null } = props;
  const draggable = Boolean(onSubjectMove);
  const drawing = draft !== null;
  const linesEditable = Boolean(props.onLinePointsChange);
  const labelsMovable = Boolean(props.onLabelMove);

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
    map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (latest.current.draft) {
        if (event.latLng) latest.current.onDrawPoint?.([event.latLng.lat(), event.latLng.lng()]);
        return;
      }
      latest.current.onLineSelect?.(null);
      latest.current.onMapClick?.();
    });
    map.addListener("dblclick", (event: google.maps.MapMouseEvent) => {
      if (!latest.current.draft) return;
      event.stop();
      latest.current.onDrawFinish?.();
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
    // Each name is a marker drawn as its chip: dragging the chip moves the name, not the map.
    const chips = labels.map((label) => {
      const chip = new google.maps.Marker({
        map: parts.map,
        position: toLatLng(label.point),
        clickable: labelsMovable,
        draggable: labelsMovable,
        cursor: labelsMovable ? "move" : undefined,
        title: labelsMovable ? `${label.name}: arrástralo para acomodarlo` : label.name,
        zIndex: 8,
        icon: streetLabelIcon(label.name, label.color),
      });
      chip.addListener("dragend", () => {
        const position = chip.getPosition();
        if (position) latest.current.onLabelMove?.(label, [position.lat(), position.lng()]);
      });
      return chip;
    });
    return () => {
      for (const line of lines) line.setMap(null);
      for (const chip of chips) {
        google.maps.event.clearInstanceListeners(chip);
        chip.setMap(null);
      }
    };
  }, [highlights, labels, labelsMovable]);

  // «Trazo libre»: while drawing, the cursor is a cross and a double click finishes the line instead of zooming.
  useEffect(() => {
    const map = partsRef.current?.map;
    if (!map) return;
    map.setOptions({ draggableCursor: drawing ? "crosshair" : null });
    if (drawing) {
      map.setOptions({ disableDoubleClickZoom: true });
      return;
    }
    // The double click that finished the line is still being handled: the zoom comes back a moment later, or it would zoom in.
    const timer = window.setTimeout(() => map.setOptions({ disableDoubleClickZoom: false }), 500);
    return () => window.clearTimeout(timer);
  }, [drawing]);

  // The lines drawn by hand, over the highlighted streets and under their names; the selected one shows its vertices to drag them.
  useEffect(() => {
    const parts = partsRef.current;
    if (!parts) return;
    const items = freeLines.map((line, index) => {
      const editable = !drawing && linesEditable && line.id === selectedLineId;
      const polyline = new google.maps.Polyline({
        map: parts.map,
        path: line.points.map(toLatLng),
        strokeColor: line.color,
        strokeWeight: line.weight,
        strokeOpacity: FREE_LINE_OPACITY,
        clickable: !drawing,
        editable,
        zIndex: 3 + index / 1000,
      });
      polyline.addListener("click", () => latest.current.onLineSelect?.(line.id));
      if (editable) {
        const path = polyline.getPath();
        const report = () => latest.current.onLinePointsChange?.(line.id, path.getArray().map((point) => [point.lat(), point.lng()] as LatLon));
        for (const name of ["set_at", "insert_at", "remove_at"]) path.addListener(name, report);
        // A right click (or a long press) on a vertex removes it, as long as the line keeps two.
        polyline.addListener("contextmenu", (event: google.maps.PolyMouseEvent) => {
          if (event.vertex !== undefined && path.getLength() > 2) path.removeAt(event.vertex);
        });
      }
      return polyline;
    });
    return () => {
      for (const polyline of items) {
        google.maps.event.clearInstanceListeners(polyline);
        google.maps.event.clearInstanceListeners(polyline.getPath());
        polyline.setMap(null);
      }
    };
  }, [freeLines, drawing, selectedLineId, linesEditable]);

  // The line being drawn: its vertices, and a dashed piece from the last one to the cursor (none on a touch screen, which has no cursor).
  useEffect(() => {
    const parts = partsRef.current;
    if (!parts || !draft) return;
    const color = draftStyle?.color ?? HIT_LINE_COLOR;
    const weight = draftStyle?.weight ?? 4;
    const line = new google.maps.Polyline({ map: parts.map, path: draft.map(toLatLng), strokeColor: color, strokeWeight: weight, strokeOpacity: FREE_LINE_OPACITY, clickable: false, zIndex: 6 });
    const vertices = draft.map(
      (point) =>
        new google.maps.Marker({
          map: parts.map,
          position: toLatLng(point),
          clickable: false,
          zIndex: 7,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 4.5, fillColor: "#ffffff", fillOpacity: 1, strokeColor: color, strokeWeight: 2 },
        }),
    );
    const rubber = new google.maps.Polyline({
      map: parts.map,
      path: [],
      strokeOpacity: 0,
      clickable: false,
      zIndex: 6,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.85, strokeColor: color, strokeWeight: Math.max(2, weight - 1), scale: 3 }, offset: "0", repeat: "14px" }],
    });
    const last = draft[draft.length - 1];
    const listener = parts.map.addListener("mousemove", (event: google.maps.MapMouseEvent) => {
      if (last && event.latLng) rubber.setPath([toLatLng(last), event.latLng]);
    });
    return () => {
      listener.remove();
      line.setMap(null);
      rubber.setMap(null);
      for (const vertex of vertices) vertex.setMap(null);
    };
  }, [draft, draftStyle]);

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
