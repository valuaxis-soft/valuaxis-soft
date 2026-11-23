"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AppSection } from "@/features/valuations/model";
import {
  DEFAULT_DOCUMENT_PALETTE,
  readDocumentPalette,
  sameDocumentPalette,
  type DocumentPalette,
} from "@/features/valuations/services/document-palette";
import { api } from "@/lib/api-client";
import { DocumentPalettePicker } from "./document-palette-picker";

/**
 * The colours of this document, kept on its carátula section: the preview
 * follows the choice at once and it is saved with the document. «Usar los del
 * despacho» brings the firm's palette when this document has another.
 */
export function DocumentPaletteControl({
  section,
  readOnly,
  onUpdateSection,
}: {
  section: AppSection;
  readOnly: boolean;
  onUpdateSection: (sectionId: string, patch: Partial<AppSection>) => void;
}) {
  const palette = readDocumentPalette(section.palette) ?? DEFAULT_DOCUMENT_PALETTE;
  const [firmPalette, setFirmPalette] = useState<DocumentPalette | null>(null);
  useEffect(() => {
    let active = true;
    api.firm.documentPalette()
      .then((firm) => { if (active) setFirmPalette(firm.palette); })
      .catch(() => { if (active) setFirmPalette(null); });
    return () => { active = false; };
  }, []);
  const set = (next: DocumentPalette) => onUpdateSection(section.id, { palette: next });
  return (
    <section className="grid gap-2 rounded-md border bg-background p-3" data-document-palette-control="">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h4 className="text-sm font-medium">Colores del dictamen</h4>
          <p className="text-xs text-muted-foreground">
            Se aplican a todo el documento: vista previa, dictamen, PDF y memoria de cálculo. Las tablas de captura los siguen en modo claro.
          </p>
        </div>
        {firmPalette && !sameDocumentPalette(firmPalette, palette) && !readOnly ? (
          <Button type="button" variant="outline" size="sm" onClick={() => set(firmPalette)}>
            Usar los del despacho
          </Button>
        ) : null}
      </div>
      <DocumentPalettePicker value={palette} disabled={readOnly} onChange={set} />
    </section>
  );
}
