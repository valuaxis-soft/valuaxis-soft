"use client";

import { useState, type CSSProperties } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * A thumbnail of the editor that opens the image enlarged on a click (video
 * 8.5, 12:05: to see how a croquis came out the appraiser had to go to the
 * preview). The window shows the whole picture as stored, as large as the
 * screen allows, with its description; Esc or a click outside closes it.
 */
export function ImageThumbnail({
  src,
  title,
  className,
  buttonClassName,
  style,
}: {
  src: string;
  /** The image's description: the window's title and the thumbnail's alternative text. */
  title: string;
  className?: string;
  /** The button around the thumbnail, when it must fill its place. */
  buttonClassName?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const name = title.trim() || "Imagen";
  return (
    <>
      <button
        type="button"
        className={cn("shrink-0 cursor-zoom-in rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring", buttonClassName)}
        title="Ver la imagen en grande"
        aria-label={`Ver en grande: ${name}`}
        onClick={() => setOpen(true)}
        data-image-zoom=""
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={className} style={style} src={src} alt={name} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="grid max-h-[calc(100dvh-2rem)] w-auto max-w-[calc(100vw-2rem)] gap-3 p-4 sm:max-w-[calc(100vw-2rem)]" data-image-lightbox="">
          <DialogTitle className="pr-8 text-base">{name}</DialogTitle>
          <DialogDescription className="sr-only">La imagen como se guardó en el avalúo.</DialogDescription>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mx-auto block max-h-[calc(100dvh-8rem)] max-w-full rounded-md border object-contain" src={src} alt={name} />
        </DialogContent>
      </Dialog>
    </>
  );
}
