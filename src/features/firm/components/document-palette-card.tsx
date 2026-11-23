"use client";

import { Loader2, Palette } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentPalettePicker } from "@/features/valuations/components/editor/document-palette-picker";
import { sameDocumentPalette, type DocumentPalette } from "@/features/valuations/services/document-palette";
import { api, SessionExpiredError } from "@/lib/api-client";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : fallback;

/**
 * Despacho → Colores del dictamen: the palette the firm's new valuations and
 * new templates start with. The valuations it already has keep theirs.
 */
export function DocumentPaletteCard() {
  const [saved, setSaved] = useState<DocumentPalette | null>(null);
  const [draft, setDraft] = useState<DocumentPalette | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.firm.documentPalette()
      .then((next) => { if (active) { setSaved(next.palette); setDraft(next.palette); } })
      .catch((error: unknown) => { if (active) setLoadError(errorMessage(error, "No se pudieron cargar los colores del dictamen.")); });
    return () => { active = false; };
  }, []);

  if (loadError) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  if (!saved || !draft) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando los colores del dictamen…
      </div>
    );
  }

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const next = await api.firm.saveDocumentPalette(draft);
      setSaved(next.palette);
      setDraft(next.palette);
      toast.success("Colores del dictamen guardados: los avalúos nuevos nacerán con ellos.");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudieron guardar los colores del dictamen."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} data-firm-document-palette>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="size-5" /> Colores del dictamen</CardTitle>
          <CardDescription>
            La paleta con que nacen los avalúos nuevos y las plantillas nuevas del despacho: un color fuerte para títulos y barras y un color
            pastel para las tablas. Los avalúos y las plantillas que ya existen no cambian; en cada uno se elige otra en «Carátula ›
            Configuración del avalúo».
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <DocumentPalettePicker value={draft} disabled={busy} onChange={setDraft} />
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || sameDocumentPalette(draft, saved)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Guardar colores
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
