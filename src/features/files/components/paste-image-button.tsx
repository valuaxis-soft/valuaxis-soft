"use client";

import { ClipboardPaste } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ClipboardUnavailableError, readClipboardImages } from "../clipboard-image";

/**
 * «Pegar del portapapeles»: takes the image just copied (a screenshot, an
 * image copied from a page) without saving it as a file first. The same
 * control everywhere a photo is taken.
 */
export function PasteImageButton(props: {
  onFiles: (files: File[]) => void;
  /** Name the pasted file takes ("foto-comparable" → "foto-comparable.png"). */
  baseName: string;
  /** Takes every image on the clipboard; otherwise the first. */
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  variant?: "outline" | "ghost";
  className?: string;
}) {
  const paste = async () => {
    try {
      const files = await readClipboardImages(props.baseName);
      if (!files.length) {
        toast.error("El portapapeles no trae una imagen. Copia la imagen o toma la captura y vuelve a pegar.");
        return;
      }
      props.onFiles(props.multiple ? files : files.slice(0, 1));
    } catch (error) {
      if (!(error instanceof ClipboardUnavailableError)) throw error;
      toast.error("El navegador no dejó leer el portapapeles. Permite el acceso al portapapeles o sube la imagen.");
    }
  };

  return (
    <Button type="button" size="sm" variant={props.variant ?? "outline"} className={props.className} disabled={props.disabled} onClick={() => void paste()}>
      <ClipboardPaste data-icon="inline-start" /> {props.label ?? "Pegar del portapapeles"}
    </Button>
  );
}
