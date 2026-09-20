"use client";

import { type ChangeEvent } from "react";
import type { ImageCaptionAlign, ImageCaptionPosition, ImageContent } from "@/features/valuations/model";

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
  EllipsisVertical,
  ImageIcon,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { UploadButton } from "./image-upload-control";

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
          <img className="size-16 rounded-md object-cover" src={image.src} alt={image.title} />
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
          {onUpload && (
            <UploadButton
              label={hasResource ? "Reemplazar" : "Subir"}
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

function CaptionControls({
  image,
  readOnly,
  onUpdate,
}: {
  image: ImageContent;
  readOnly: boolean;
  onUpdate: (imageId: string, patch: Partial<ImageContent>) => void;
}) {
  const captionEnabled = image.captionEnabled ?? false;

  return (
    <div className="mt-2 border-t pt-2">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-3"
            checked={captionEnabled}
            disabled={readOnly}
            onChange={(e) => onUpdate(image.id, { captionEnabled: e.target.checked })}
          />
          Leyenda
        </label>
        {captionEnabled && (
          <>
            <Input
              className="h-7 flex-1 text-xs"
              placeholder="Texto de leyenda"
              disabled={readOnly}
              value={image.captionText ?? ""}
              onChange={(e) => onUpdate(image.id, { captionText: e.target.value })}
            />
            <NativeSelect
              className="h-7 w-20 text-xs"
              value={image.captionPosition ?? "bottom"}
              disabled={readOnly}
              onChange={(e) => onUpdate(image.id, { captionPosition: e.target.value as ImageCaptionPosition })}
            >
              <NativeSelectOption value="bottom">Abajo</NativeSelectOption>
              <NativeSelectOption value="top">Arriba</NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              className="h-7 w-20 text-xs"
              value={image.captionAlign ?? "center"}
              disabled={readOnly}
              onChange={(e) => onUpdate(image.id, { captionAlign: e.target.value as ImageCaptionAlign })}
            >
              <NativeSelectOption value="center">Centro</NativeSelectOption>
              <NativeSelectOption value="left">Izq</NativeSelectOption>
              <NativeSelectOption value="right">Der</NativeSelectOption>
            </NativeSelect>
          </>
        )}
      </div>
    </div>
  );
}
