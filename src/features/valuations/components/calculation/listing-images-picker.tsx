"use client";

import { ImagePlus, Monitor, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CLIPBOARD_IMAGE_TYPES, pastedImages } from "@/features/files/clipboard-image";
import { PasteImageButton } from "@/features/files/components/paste-image-button";
import { NOT_AN_IMAGE_MESSAGE } from "@/features/files/image-content";
import { MAX_COMPARABLE_PHOTOS } from "@/features/valuations/calculation/market-types";
import { addListingImages, promoteToScreenshot, type PendingImages } from "@/features/valuations/comparable-search/listing-images";

/** Local previews of files not uploaded yet, let go when they change. */
function usePreviews(files: File[]) {
  const urls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => { for (const url of urls) URL.revokeObjectURL(url); }, [urls]);
  return urls;
}

/**
 * The screenshot and photos of a listing, before its comparable exists: the
 * appraiser takes them from the listing open in his own browser and pastes
 * them here (Ctrl/⌘+V on the box), drops them or picks them. They go up
 * through the same routes as the comparable's form once it is saved. Nothing
 * is read from the portal: Valuaxis never downloads its pages or images.
 */
export function ListingImagesPicker(props: {
  images: PendingImages;
  onChange: (images: PendingImages) => void;
  /** Names the box for assistive technology. */
  label: string;
  /** Name of a pasted file ("anuncio-3" → "anuncio-3.png"). */
  baseName: string;
  disabled?: boolean;
  /** One line beside the buttons: where the images end up. */
  hint?: string;
  /** The box takes the focus when it appears, so Ctrl/⌘+V pastes at once. */
  autoFocus?: boolean;
}) {
  const { images } = props;
  const [dragging, setDragging] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  const focusOnMount = props.autoFocus;
  useEffect(() => { if (focusOnMount) zone.current?.focus(); }, [focusOnMount]);
  const files = useMemo(() => [...(images.screenshot ? [images.screenshot] : []), ...images.photos], [images]);
  const previews = usePreviews(files);
  const offset = images.screenshot ? 1 : 0;

  const add = (incoming: File[]) => {
    if (!incoming.length) return;
    const { images: next, rejected, overflow } = addListingImages(images, incoming);
    if (rejected) toast.error(NOT_AN_IMAGE_MESSAGE);
    if (overflow) {
      toast.error(`Un comparable lleva hasta ${MAX_COMPARABLE_PHOTOS} fotografías: ${overflow === 1 ? "una imagen no se agregó" : `${overflow} imágenes no se agregaron`}.`);
    }
    props.onChange(next);
  };

  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (props.disabled) return;
    const pasted = pastedImages(event.clipboardData.items, props.baseName);
    if (!pasted.length) {
      toast.error("El portapapeles no trae una imagen. Toma la captura del anuncio y vuelve a pegar.");
      return;
    }
    event.preventDefault();
    add(pasted);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!props.disabled) add(Array.from(event.dataTransfer.files));
  };

  const remove = (index: number) => {
    // Removing the screenshot leaves it empty: which photo takes its place is the appraiser's choice.
    if (index < offset) props.onChange({ ...images, screenshot: null });
    else props.onChange({ ...images, photos: images.photos.filter((_, position) => position !== index - offset) });
  };

  return (
    <div className="grid gap-1.5" data-listing-images>
      <div
        ref={zone}
        role="button"
        tabIndex={props.disabled ? -1 : 0}
        aria-label={`${props.label}: haz clic y pega con Ctrl+V (⌘V en Mac), o suelta imágenes aquí`}
        aria-disabled={props.disabled || undefined}
        data-listing-images-zone
        onPaste={paste}
        onDragOver={(event) => { event.preventDefault(); if (!props.disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={cn(
          "flex min-h-20 flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground outline-none",
          "transition-colors motion-reduce:transition-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          dragging ? "border-ring bg-accent" : "bg-muted/40",
        )}
      >
        {files.length ? files.map((file, index) => {
          const isScreenshot = index < offset;
          const name = isScreenshot ? "Pantalla" : `Foto ${index - offset + 1}`;
          return (
            <figure
              key={`${index}-${file.name}-${file.size}`}
              className="relative size-20 overflow-hidden rounded-md border bg-background"
              data-listing-image={isScreenshot ? "screenshot" : "photo"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previews[index]} alt={isScreenshot ? "Pantalla de referencia por guardar" : `Fotografía ${index - offset + 1} por guardar`} className="size-full object-cover" />
              <figcaption className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-1 text-[10px] text-foreground">{name}</figcaption>
              {!props.disabled ? (
                <div className="absolute right-0.5 top-0.5 flex gap-0.5">
                  {!isScreenshot ? (
                    <Button
                      type="button" size="icon-xs" variant="secondary"
                      title="Usar como pantalla de referencia" aria-label={`Usar ${name.toLowerCase()} como pantalla de referencia`}
                      onClick={() => props.onChange(promoteToScreenshot(images, index - offset))}
                    >
                      <Monitor />
                    </Button>
                  ) : null}
                  <Button
                    type="button" size="icon-xs" variant="secondary" title="Quitar"
                    aria-label={isScreenshot ? "Quitar la pantalla de referencia" : `Quitar ${name.toLowerCase()}`}
                    onClick={() => remove(index)}
                  >
                    <X />
                  </Button>
                </div>
              ) : null}
            </figure>
          );
        }) : (
          <span className="px-1">
            Toma la captura del anuncio abierto en tu navegador, haz clic aquí y pégala con Ctrl+V (⌘V en Mac), o suelta imágenes.
            La primera es la pantalla de referencia; las demás, fotos.
          </span>
        )}
      </div>
      {!props.disabled ? (
        <div className="flex flex-wrap items-center gap-2">
          <PasteImageButton baseName={props.baseName} multiple onFiles={add} />
          <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-muted">
            <ImagePlus className="size-3.5" /> Elegir imágenes
            <input
              type="file"
              multiple
              accept={CLIPBOARD_IMAGE_TYPES.join(",")}
              className="sr-only"
              onChange={(event) => {
                const chosen = Array.from(event.target.files ?? []);
                event.target.value = "";
                add(chosen);
              }}
            />
          </label>
          {props.hint ? <span className="text-xs text-muted-foreground">{props.hint}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
