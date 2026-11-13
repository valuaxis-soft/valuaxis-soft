"use client";

import { useState } from "react";

import type { ComparablePhotoDto } from "@/features/valuations/calculation/market-types";
import { isDefaultImageFraming, type ImageFraming } from "@/features/valuations/services/image-framing";

import { ImageFramingPopover } from "../editor/image-editor";

/**
 * «Encuadre» and «Zoom» of a comparable's photo, with the same control as
 * every image of the document (video 5.5: the same zoom in every photo, the
 * comparables' too). The frame follows the sliders at once; the framing is
 * saved when the control closes, once, and prints in the photo annex.
 */
export function ComparablePhotoFraming({ photo, readOnly, onSave }: {
  photo: ComparablePhotoDto;
  readOnly: boolean;
  onSave: (photoId: string, framing: ImageFraming | null) => Promise<void>;
}) {
  // What the sliders set while the control is open; null, the photo's saved framing.
  const [draft, setDraft] = useState<{ framing: ImageFraming | undefined } | null>(null);
  const shown = draft ? draft.framing : photo.framing;
  const close = () => {
    if (!draft) return;
    const next = draft.framing && !isDefaultImageFraming(draft.framing) ? draft.framing : null;
    setDraft(null);
    if (JSON.stringify(next) !== JSON.stringify(photo.framing ?? null)) void onSave(photo.id, next);
  };
  return (
    <ImageFramingPopover
      image={{ id: photo.id, title: photo.title, src: photo.url, framing: shown }}
      readOnly={readOnly}
      triggerClassName="bg-secondary"
      onUpdate={(_id, patch) => setDraft({ framing: patch.framing })}
      onOpenChange={(open) => { if (!open) close(); }}
    />
  );
}
