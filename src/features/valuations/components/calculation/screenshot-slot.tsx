"use client";

import { AlertTriangle, ClipboardPaste, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useEffect, useMemo, type ClipboardEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** The image of a paste, if it carries one; a screenshot comes as "image.png". */
function pastedImage(items: DataTransferItemList | null) {
  for (const item of Array.from(items ?? [])) {
    if (item.kind === "file" && IMAGE_TYPES.includes(item.type)) {
      const file = item.getAsFile();
      if (file) return new File([file], `pantalla-de-referencia.${item.type.split("/")[1]}`, { type: item.type });
    }
  }
  return null;
}

/** A local preview of a file not uploaded yet; released when it changes. */
function usePreview(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

/**
 * "Pantalla de referencia": the screenshot of the listing as it was when
 * captured, apart from the photos of the property. Pasted with Ctrl+V on the
 * box, or uploaded. Not required: without it the comparable is only flagged.
 */
export function ScreenshotSlot(props: {
  /** The stored screenshot's URL, or null. */
  storedUrl: string | null;
  /** A file chosen before the comparable exists: it is uploaded once it is saved. */
  pending: File | null;
  readOnly: boolean;
  busy?: boolean;
  onChoose: (file: File) => void;
  onRemove: () => void;
}) {
  const preview = usePreview(props.pending);
  const shown = preview ?? props.storedUrl;

  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (props.readOnly) return;
    const file = pastedImage(event.clipboardData.items);
    if (!file) {
      toast.error("El portapapeles no trae una imagen. Toma la captura del anuncio y vuelve a pegar.");
      return;
    }
    event.preventDefault();
    props.onChoose(file);
  };

  const readClipboard = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((candidate) => IMAGE_TYPES.includes(candidate));
        if (type) {
          const blob = await item.getType(type);
          props.onChoose(new File([blob], `pantalla-de-referencia.${type.split("/")[1]}`, { type }));
          return;
        }
      }
      toast.error("El portapapeles no trae una imagen.");
    } catch {
      toast.error("El navegador no dejó leer el portapapeles: haz clic en el recuadro y pega con Ctrl+V.");
    }
  };

  return (
    <section className="grid gap-2" aria-label="Pantalla de referencia">
      <h3 className="text-sm font-medium">Pantalla de referencia</h3>
      <p className="text-xs text-muted-foreground">
        La captura del anuncio tal como estaba al consultarlo. Haz clic en el recuadro y pega con Ctrl+V (⌘V en Mac), o sube la imagen.
      </p>
      <div
        role="button"
        tabIndex={props.readOnly ? -1 : 0}
        aria-label="Pegar la pantalla de referencia con Ctrl+V"
        data-screenshot-zone
        onPaste={paste}
        className="relative flex min-h-32 items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/40 text-xs text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {props.busy ? <Loader2 className="size-5 animate-spin" /> : shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Pantalla de referencia del anuncio" className="max-h-64 w-full object-contain" />
        ) : (
          <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3.5" /> Sin pantalla de referencia. Pega aquí la captura del anuncio.
          </span>
        )}
      </div>
      {props.pending ? <p className="text-xs text-muted-foreground">Se guardará con el comparable.</p> : null}
      {!props.readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void readClipboard()}>
            <ClipboardPaste data-icon="inline-start" /> Pegar del portapapeles
          </Button>
          <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-muted">
            <ImagePlus className="size-3.5" /> Subir imagen
            <input
              type="file"
              accept={IMAGE_TYPES.join(",")}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) props.onChoose(file);
              }}
            />
          </label>
          {shown ? (
            <Button type="button" size="sm" variant="ghost" onClick={props.onRemove}>
              <Trash2 data-icon="inline-start" /> Quitar
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
