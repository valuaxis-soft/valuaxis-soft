"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

import {
  COVER_IMAGE_FOCUS_CENTER,
  COVER_IMAGE_SCALE,
  coverImagePannableAxes,
  type CoverImageFocus,
  type CoverImageSize,
} from "@/features/valuations/services/cover-image-focus";

/**
 * Moves an image inside its frame, one slider per axis, and sets its size:
 * filling the frame or whole, smaller or larger. The principal cover image and
 * every document image (photo annexes, plans) use it, so they behave alike.
 * The preview follows as the controls move.
 *
 * With `pannableFor` the sliders that would move nothing for this image are
 * turned off, with the reason; without it both stay on.
 */
export function ImageFramingControl({
  defaultSize,
  description,
  fitHint,
  focus,
  idPrefix,
  imageUrl,
  onFocusChange,
  onSizeChange,
  pannableFor,
  readOnly,
  size,
  title,
}: {
  /** The size "Tamaño original" goes back to. */
  defaultSize: CoverImageSize;
  description: string;
  fitHint?: string;
  focus: CoverImageFocus;
  idPrefix: string;
  imageUrl: string;
  onFocusChange: (focus: CoverImageFocus) => void;
  onSizeChange: (size: CoverImageSize) => void;
  pannableFor?: typeof coverImagePannableAxes;
  readOnly: boolean;
  size: CoverImageSize;
  title: string;
}) {
  const centered = focus.x === COVER_IMAGE_FOCUS_CENTER.x && focus.y === COVER_IMAGE_FOCUS_CENTER.y;
  const imageRatio = useImageRatio(pannableFor ? imageUrl : null);
  const pannable = pannableFor ? pannableFor(imageRatio, size) : { x: true, y: true };
  const atDefaultSize = size.fit === defaultSize.fit && size.scale === defaultSize.scale;
  const wholeNote = "La imagen completa ya se ve entera; auméntale el tamaño para acercarla y moverla.";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <FieldTitle>{title}</FieldTitle>
          <FieldDescription>{description}</FieldDescription>
        </div>
        <Button type="button" size="sm" variant="ghost" disabled={readOnly || centered} onClick={() => onFocusChange(COVER_IMAGE_FOCUS_CENTER)}>
          Centrar
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FramingSlider
          id={`${idPrefix}-horizontal`}
          label="Horizontal"
          startLabel="Izquierda"
          endLabel="Derecha"
          value={focus.x}
          readOnly={readOnly || !pannable.x}
          note={pannable.x ? undefined : size.fit === "contain" ? wholeNote : "La imagen ya ocupa todo el ancho del recuadro; solo se puede mover en vertical."}
          onChange={(x) => onFocusChange({ ...focus, x })}
        />
        <FramingSlider
          id={`${idPrefix}-vertical`}
          label="Vertical"
          startLabel="Arriba"
          endLabel="Abajo"
          value={focus.y}
          readOnly={readOnly || !pannable.y}
          note={pannable.y || size.fit === "contain" ? undefined : "La imagen ya ocupa todo el alto del recuadro; solo se puede mover en horizontal."}
          onChange={(y) => onFocusChange({ ...focus, y })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-ajuste`}>Ajuste</FieldLabel>
          <NativeSelect
            id={`${idPrefix}-ajuste`}
            className="w-full"
            disabled={readOnly}
            value={size.fit}
            onChange={(event) => onSizeChange({ ...size, fit: event.target.value === "contain" ? "contain" : "cover" })}
          >
            <NativeSelectOption value="cover">Llenar el recuadro (recorta la imagen)</NativeSelectOption>
            <NativeSelectOption value="contain">Imagen completa (sin recortar)</NativeSelectOption>
          </NativeSelect>
          {fitHint ? <FieldDescription>{fitHint}</FieldDescription> : null}
        </Field>
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor={`${idPrefix}-tamano`}>Tamaño</FieldLabel>
            <span className="text-xs tabular-nums text-muted-foreground">{size.scale}%</span>
          </div>
          <input
            id={`${idPrefix}-tamano`}
            className="w-full accent-primary"
            type="range"
            min={COVER_IMAGE_SCALE.min}
            max={COVER_IMAGE_SCALE.max}
            step={COVER_IMAGE_SCALE.step}
            disabled={readOnly}
            value={size.scale}
            aria-valuetext={`${size.scale}%`}
            onChange={(event) => onSizeChange({ ...size, scale: Number(event.target.value) })}
          />
          <div className="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
            <span>Más chica</span>
            <span>Más grande</span>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={readOnly || atDefaultSize}
              onClick={() => onSizeChange(defaultSize)}
            >
              Tamaño original
            </Button>
          </div>
        </Field>
      </div>
    </div>
  );
}

/** Width over height of the image at this address once it loads; null while unknown or without an address. */
function useImageRatio(imageUrl: string | null) {
  const [ratio, setRatio] = useState<{ url: string; value: number | null } | null>(null);
  useEffect(() => {
    if (!imageUrl) return;
    let active = true;
    const probe = new Image();
    probe.onload = () => { if (active) setRatio({ url: imageUrl, value: probe.naturalHeight ? probe.naturalWidth / probe.naturalHeight : null }); };
    probe.onerror = () => { if (active) setRatio({ url: imageUrl, value: null }); };
    probe.src = imageUrl;
    return () => { active = false; };
  }, [imageUrl]);
  return ratio && ratio.url === imageUrl ? ratio.value : null;
}

function FramingSlider({
  endLabel,
  id,
  label,
  note,
  onChange,
  readOnly,
  startLabel,
  value,
}: {
  endLabel: string;
  id: string;
  label: string;
  /** Why the slider is off: there is nothing to move along this axis. */
  note?: string;
  onChange: (value: number) => void;
  readOnly: boolean;
  startLabel: string;
  value: number;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        className="w-full accent-primary"
        type="range"
        min={0}
        max={100}
        step={1}
        disabled={readOnly}
        value={value}
        aria-valuetext={`${value}%`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
      {note ? <FieldDescription>{note}</FieldDescription> : null}
    </Field>
  );
}
