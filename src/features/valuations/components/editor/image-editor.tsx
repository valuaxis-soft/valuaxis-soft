"use client";

import { type ChangeEvent } from "react";
import type { ImageCaption, ImageCaptionAlign, ImageCaptionPosition, ImageContent } from "@/features/valuations/model";
import { captionsPatch, imageCaptions, moveCaption, newCaption, nextRotation } from "@/features/valuations/services/image-captions";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  clampImageWidthPercent,
  imageLayoutWidthForPercent,
  IMAGE_WIDTH_MAX,
  IMAGE_WIDTH_MIN,
  IMAGE_WIDTH_STEP,
  resolveImageWidthPercent,
} from "@/features/valuations/services/document-image-layout";

import {
  ChevronDown,
  ChevronUp,
  Crop,
  EllipsisVertical,
  ImageIcon,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { UploadButton } from "./image-upload-control";
import { ImageFramingControl } from "./image-framing-control";
import { DOCUMENT_IMAGE_ACCEPT } from "@/features/valuations/services/document-image-upload";
import {
  DEFAULT_IMAGE_SIZE,
  imageFramingStyle,
  isDefaultImageFraming,
  PAIRED_IMAGE_FRAME_RATIO,
  resolveImageFraming,
  type ImageFraming,
} from "@/features/valuations/services/image-framing";

export function ImageEditors({
  images,
  onRemove,
  onUpdate,
  readOnly,
}: {
  images: ImageContent[];
  onRemove: (imageId: string) => void;
  onUpdate: (imageId: string, patch: Partial<ImageContent>) => void;
  readOnly: boolean;
}) {
  if (!images.length) return null;

  return (
    <FieldGroup>
      {images.map((image) => (
        <ImageEditorItem
          image={image}
          key={image.id}
          readOnly={readOnly}
          onRemove={onRemove}
          onUpdate={onUpdate}
        />
      ))}
    </FieldGroup>
  );
}

export function ImageDocumentSizeControl({
  image,
  onUpdate,
  readOnly,
}: {
  image: ImageContent;
  onUpdate: (imageId: string, patch: Partial<ImageContent>) => void;
  readOnly: boolean;
}) {
  const selectedPercent = resolveImageWidthPercent(image);
  const updateImageWidthPercent = (value: number) => {
    const layoutWidthPercent = clampImageWidthPercent(value);
    onUpdate(image.id, {
      layoutWidth: imageLayoutWidthForPercent(layoutWidthPercent),
      layoutWidthPercent,
    });
  };

  const handleIncrease = () => {
    // Read LATEST value from canonical state to avoid stale closure
    const latest = resolveImageWidthPercent(image);
    updateImageWidthPercent(latest + IMAGE_WIDTH_STEP);
  };

  const handleDecrease = () => {
    // Read LATEST value from canonical state to avoid stale closure
    const latest = resolveImageWidthPercent(image);
    updateImageWidthPercent(latest - IMAGE_WIDTH_STEP);
  };

  return (
    <Field className="gap-1.5">
      <FieldLabel className="text-xs text-muted-foreground">Tamaño</FieldLabel>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Reducir tamaño"
          disabled={readOnly || selectedPercent <= IMAGE_WIDTH_MIN}
          onClick={handleDecrease}
        >
          <Minus />
        </Button>
        <span className="rounded-md border bg-background px-2 py-1 text-center text-sm tabular-nums">
          {selectedPercent}%
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Aumentar tamaño"
          disabled={readOnly || selectedPercent >= IMAGE_WIDTH_MAX}
          onClick={handleIncrease}
        >
          <Plus />
        </Button>
      </div>
    </Field>
  );
}

export function ImageEditorItem({
  image,
  onRemove,
  onUpdate,
  onUpload,
  readOnly,
}: {
  image: ImageContent;
  onRemove: (imageId: string) => void;
  onUpdate: (imageId: string, patch: Partial<ImageContent>) => void;
  /** Optional generic upload/replace trigger. When provided, an upload button appears. */
  onUpload?: (event: ChangeEvent<HTMLInputElement>) => void;
  readOnly: boolean;
}) {
  const selectedWidth = image.layoutWidth ?? "normal";
  const hasResource = Boolean(image.src);

  return (
    <section className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-3">
        {/* Empty resource: placeholder icon. Resource present: image thumbnail. */}
        {hasResource ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            className="size-16 rounded-md object-cover"
            style={image.rotation ? { transform: `rotate(${image.rotation}deg)` } : undefined}
            src={image.src}
            alt={image.title}
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-md border border-dashed border-muted-foreground/40 bg-background">
            <ImageIcon className="size-6 text-muted-foreground/50" />
          </div>
        )}
        <Input
          disabled={readOnly}
          value={image.title}
          onChange={(event) => onUpdate(image.id, { title: event.target.value })}
        />
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Girar imagen"
            title="Girar 90°"
            disabled={readOnly || !hasResource}
            onClick={() => onUpdate(image.id, { rotation: nextRotation(image.rotation) })}
          >
            <RotateCw />
          </Button>
          <ImageFramingPopover image={image} readOnly={readOnly} onUpdate={onUpdate} />
          {onUpload && (
            <UploadButton
              accept={DOCUMENT_IMAGE_ACCEPT}
              label={hasResource ? "Reemplazar imagen" : "Subir imagen"}
              disabled={readOnly}
              onChange={onUpload}
            />
          )}
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Opciones de imagen"
                  title="Opciones de imagen"
                >
                  <EllipsisVertical />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-48 p-2">
              <div className="flex flex-col gap-1">
                {([
                  ["normal", "Tamaño normal"],
                  ["wide", "Tamaño amplio"],
                  ["full", "Ancho completo"],
                ] as const).map(([layoutWidth, label]) => (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={cn("justify-start", selectedWidth === layoutWidth && "bg-muted")}
                    disabled={readOnly}
                    key={layoutWidth}
                    onClick={() => onUpdate(image.id, { layoutWidth, layoutWidthPercent: undefined })}
                  >
                    {layoutWidth === "full" ? <Maximize2 data-icon="inline-start" /> : <Minimize2 data-icon="inline-start" />}
                    {label}
                  </Button>
                ))}
                <div className="mt-1 border-t pt-2">
                  <ImageDocumentSizeControl image={image} readOnly={readOnly} onUpdate={onUpdate} />
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Quitar ${image.title}`}
            disabled={readOnly}
            onClick={() => onRemove(image.id)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* Caption controls — compact, generic, optional */}
      <CaptionControls image={image} readOnly={readOnly} onUpdate={onUpdate} />
    </section>
  );
}

/**
 * The framing of one image, as the cover image has it: fill its frame or show
 * it whole, zoom, and move it left, right, up or down. A small frame of the
 * annex's shape shows the result next to the controls.
 */
function ImageFramingPopover({
  image,
  readOnly,
  onUpdate,
}: {
  image: ImageContent;
  readOnly: boolean;
  onUpdate: (imageId: string, patch: Partial<ImageContent>) => void;
}) {
  const framing = resolveImageFraming(image.framing);
  const framed = !isDefaultImageFraming(image.framing);
  const save = (next: ImageFraming) => onUpdate(image.id, { framing: isDefaultImageFraming(next) ? undefined : next });
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Encuadre de la imagen"
            title="Encuadre: acercar y mover la imagen en su marco"
            className={cn(framed && "text-primary")}
            disabled={!image.src}
          >
            <Crop />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[22rem] p-3">
        <div
          className="relative mx-auto mb-3 w-full overflow-hidden border-2 border-slate-500 bg-white"
          style={{ aspectRatio: PAIRED_IMAGE_FRAME_RATIO }}
          aria-hidden="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="block h-full w-full" style={imageFramingStyle(framing)} src={image.src} alt="" />
        </div>
        <ImageFramingControl
          idPrefix={`imagen-${image.id}-encuadre`}
          title="Encuadre en el marco"
          description="Una foto vertical puede llenar el marco y moverse para mostrar la parte que importa."
          focus={framing.focus}
          size={framing.size}
          defaultSize={DEFAULT_IMAGE_SIZE}
          imageUrl={image.src}
          readOnly={readOnly}
          onFocusChange={(focus) => save({ ...framing, focus })}
          onSizeChange={(size) => save({ ...framing, size })}
        />
      </PopoverContent>
    </Popover>
  );
}

function CaptionControls({
  image,
  readOnly,
  onUpdate,
}: {
  image: ImageContent;
  readOnly: boolean;
  onUpdate: (imageId: string, patch: Partial<ImageContent>) => void;
}) {
  const captions = imageCaptions(image);
  const save = (next: ImageCaption[]) => onUpdate(image.id, captionsPatch(next));
  const change = (captionId: string, patch: Partial<ImageCaption>) =>
    save(captions.map((caption) => (caption.id === captionId ? { ...caption, ...patch } : caption)));

  return (
    <div className="mt-2 space-y-1.5 border-t pt-2" data-image-captions>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Leyendas</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={readOnly}
          onClick={() => save([...captions, newCaption(captions)])}
        >
          <Plus data-icon="inline-start" />
          Agregar leyenda
        </Button>
      </div>
      {captions.map((caption, index) => (
        <div className="flex flex-wrap items-center gap-1" key={caption.id} data-image-caption={caption.id}>
          <Input
            className="h-7 min-w-32 flex-1 text-xs"
            placeholder="Texto de leyenda"
            aria-label={`Leyenda ${index + 1}`}
            disabled={readOnly}
            value={caption.text}
            onChange={(e) => change(caption.id, { text: e.target.value })}
          />
          <NativeSelect
            className="h-7 w-24 text-xs"
            aria-label={`Posición de la leyenda ${index + 1}`}
            value={caption.position}
            disabled={readOnly}
            onChange={(e) => change(caption.id, { position: e.target.value as ImageCaptionPosition })}
          >
            <NativeSelectOption value="bottom">Abajo</NativeSelectOption>
            <NativeSelectOption value="top">Arriba</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            className="h-7 w-24 text-xs"
            aria-label={`Alineación de la leyenda ${index + 1}`}
            value={caption.align}
            disabled={readOnly}
            onChange={(e) => change(caption.id, { align: e.target.value as ImageCaptionAlign })}
          >
            <NativeSelectOption value="center">Centro</NativeSelectOption>
            <NativeSelectOption value="left">Izq</NativeSelectOption>
            <NativeSelectOption value="right">Der</NativeSelectOption>
          </NativeSelect>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Subir la leyenda ${index + 1}`}
            disabled={readOnly || index === 0}
            onClick={() => save(moveCaption(captions, caption.id, -1))}
          >
            <ChevronUp />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Bajar la leyenda ${index + 1}`}
            disabled={readOnly || index === captions.length - 1}
            onClick={() => save(moveCaption(captions, caption.id, 1))}
          >
            <ChevronDown />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Quitar la leyenda ${index + 1}`}
            disabled={readOnly}
            onClick={() => save(captions.filter((entry) => entry.id !== caption.id))}
          >
            <X />
          </Button>
        </div>
      ))}
    </div>
  );
}
