"use client";

import { RotateCcw } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { STREET_LABEL_FONT_FAMILY, streetLabelBox } from "../croquis";
import type { CroquisLabelPlacement } from "../croquis-marker";
import type { CroquisStreets } from "../croquis-streets";
import { placedStreetLabels, uprightAngle, type StreetLabel } from "../highlights";
import { STATIC_MAP_SIZE, imagePixel, pointAtPixel } from "../static-map";
import type { LatLon } from "../types";

type Drag = { name: string; mode: "move" | "turn"; grab: { x: number; y: number } };

/**
 * «Letreros» of one croquis (V5.7-14): the frame of the image as a sketch
 * (the highlighted streets and the pin, at the image's size) with the street
 * names where the image prints them. Each name follows its street; dragging
 * it moves it, dragging its round handle turns it, and the arrow keys and
 * [ ] do the same from the keyboard. What is placed here is sent with
 * «Generar croquis de localización» and the image draws it the same way
 * (`streetLabelBox`).
 */
export function CroquisLabelEditor({
  title,
  center,
  zoom,
  subject,
  streets,
  placements,
  disabled,
  onChange,
}: {
  title: string;
  center: LatLon;
  zoom: number;
  subject: LatLon;
  /** What the image will draw: the same pure function the server uses. */
  streets: CroquisStreets;
  placements: readonly CroquisLabelPlacement[];
  disabled: boolean;
  onChange: (next: CroquisLabelPlacement[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const labels = placedStreetLabels(streets.labels, placements);
  const current = labels.find((label) => label.name === selected) ?? null;

  const place = (label: StreetLabel, patch: Partial<Pick<CroquisLabelPlacement, "point" | "angle">>) => {
    const next: CroquisLabelPlacement = { name: label.name, point: patch.point ?? label.point, angle: uprightAngle(patch.angle ?? label.angle) };
    onChange([...placements.filter((item) => item.name !== label.name), next]);
  };
  const followStreet = (name: string) => onChange(placements.filter((item) => item.name !== name));

  const svgPoint = (event: ReactPointerEvent) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };

  const startDrag = (event: ReactPointerEvent, label: StreetLabel, mode: Drag["mode"]) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const at = svgPoint(event);
    if (!at) return;
    const box = streetLabelBox(center, zoom, label);
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    setSelected(label.name);
    setDrag({ name: label.name, mode, grab: { x: at.x - box.x, y: at.y - box.y } });
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag) return;
    const at = svgPoint(event);
    const label = labels.find((item) => item.name === drag.name);
    if (!at || !label) return;
    if (drag.mode === "move") {
      const x = Math.min(Math.max(at.x - drag.grab.x, 0), STATIC_MAP_SIZE.width);
      const y = Math.min(Math.max(at.y - drag.grab.y, 0), STATIC_MAP_SIZE.height);
      place(label, { point: pointAtPixel(center, zoom, x, y) });
    } else {
      const box = streetLabelBox(center, zoom, label);
      place(label, { angle: (Math.atan2(at.y - box.y, at.x - box.x) * 180) / Math.PI });
    }
  };

  const onKeyDown = (event: React.KeyboardEvent, label: StreetLabel) => {
    if (disabled) return;
    const step = event.shiftKey ? 10 : 2;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      const at = imagePixel(center, zoom, label.point);
      place(label, { point: pointAtPixel(center, zoom, at.x + moves[event.key][0], at.y + moves[event.key][1]) });
    } else if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      place(label, { angle: label.angle + (event.key === "]" ? 5 : -5) });
    }
  };

  const path = (points: readonly LatLon[]) =>
    points
      .map((point) => imagePixel(center, zoom, point))
      .map((at, index) => `${index ? "L" : "M"}${at.x.toFixed(1)} ${at.y.toFixed(1)}`)
      .join(" ");
  const pin = imagePixel(center, zoom, subject);
  const placedNames = new Set(placements.map((item) => item.name));

  return (
    <div className="grid gap-2" data-croquis-labels={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Letreros · {title}</span>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={disabled || !placements.length} onClick={() => onChange([])}>
          <RotateCcw data-icon="inline-start" />
          Todos siguen su calle
        </Button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${STATIC_MAP_SIZE.width} ${STATIC_MAP_SIZE.height}`}
        className="block w-full touch-none rounded-md border bg-muted/40 select-none"
        role="group"
        aria-label={`Letreros de ${title}: arrastra un nombre para moverlo y su círculo para girarlo`}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {streets.paths.map((item, index) => (
          <path key={index} d={path(item.points)} fill="none" stroke={item.color} strokeOpacity={0.85} strokeWidth={item.weight} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        <circle cx={pin.x} cy={pin.y} r={7} className="fill-destructive stroke-background" strokeWidth={2} />
        {labels.map((label) => {
          const box = streetLabelBox(center, zoom, label);
          if (!box.inside) return null;
          const active = label.name === selected;
          return (
            <g
              key={label.name}
              transform={`translate(${box.x.toFixed(1)} ${box.y.toFixed(1)}) rotate(${box.angle.toFixed(1)})`}
              tabIndex={disabled ? -1 : 0}
              role="button"
              aria-label={`${label.name}, ${Math.round(label.angle)}°${placedNames.has(label.name) ? ", acomodado a mano" : ", sigue su calle"}`}
              className="cursor-move outline-none"
              onFocus={() => setSelected(label.name)}
              onKeyDown={(event) => onKeyDown(event, label)}
              onPointerDown={(event) => startDrag(event, label, "move")}
              data-croquis-label={label.name}
            >
              <rect
                x={-box.width / 2}
                y={-box.height / 2}
                width={box.width}
                height={box.height}
                rx={box.height / 2}
                fill="#ffffff"
                fillOpacity={0.93}
                stroke={label.color}
                strokeWidth={active ? 2.4 : 1.4}
              />
              <text y={box.fontSize * 0.36} textAnchor="middle" fontFamily={STREET_LABEL_FONT_FAMILY} fontWeight={700} fontSize={box.fontSize} letterSpacing={0.2} fill="#1b2733">
                {label.name}
              </text>
              {active && !disabled ? (
                <g className="cursor-grab" onPointerDown={(event) => startDrag(event, label, "turn")} data-croquis-label-turn="">
                  <line x1={box.width / 2} y1={0} x2={box.width / 2 + 12} y2={0} stroke={label.color} strokeWidth={1.5} />
                  <circle cx={box.width / 2 + 16} cy={0} r={5} fill="#ffffff" stroke={label.color} strokeWidth={2} />
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
      {labels.length === 0 ? (
        <p className="text-xs text-muted-foreground">Este croquis no lleva nombres de calles: resalta calles y deja «Mostrar nombres» activado.</p>
      ) : current ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-medium">{current.name}</span>
          <Label htmlFor={`letrero-angulo-${title}`} className="text-xs text-muted-foreground">
            Ángulo
          </Label>
          <Input
            id={`letrero-angulo-${title}`}
            type="number"
            className="h-7 w-20 text-xs tabular-nums"
            step={5}
            min={-90}
            max={90}
            value={Math.round(current.angle)}
            disabled={disabled}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (event.target.value.trim() && Number.isFinite(value)) place(current, { angle: value });
            }}
          />
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={disabled || !placedNames.has(current.name)} onClick={() => followStreet(current.name)}>
            Seguir la calle
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Cada nombre sigue su calle. Arrástralo para moverlo; selecciónalo y gira su círculo (o escribe el ángulo) para girarlo.</p>
      )}
    </div>
  );
}
