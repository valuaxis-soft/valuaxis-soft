"use client";

import { useState } from "react";
import { FileDown, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import type { AppSection, Block } from "@/features/valuations/model";
import { importableBlocks } from "@/features/valuations/services/document-template";
import { initialSectionsFor } from "./model/initial-hydration";
import { useStructureTransfer } from "./structure-transfer-context";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Error desconocido");

function OptionCheckbox({ id, checked, onChange, label, description }: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      <div className="grid gap-0.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </div>
    </Field>
  );
}

/**
 * "Guardar como plantilla": the document of this valuation, as it is saved,
 * under a name of the firm's. Pending changes are saved first.
 */
export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  valuationId,
  saveFirst,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  valuationId: string;
  /** Saves the pending changes; false when the save failed. */
  saveFirst: () => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [includeData, setIncludeData] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [pending, setPending] = useState(false);
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setName("");
      setIncludeData(false);
      setIncludeImages(false);
    }
  };
  const submit = async () => {
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      if (!(await saveFirst())) return;
      const template = await api.templates.create({ name: name.trim(), valuationId, includeData, includeImages });
      toast.success(`Plantilla "${template.name}" guardada. Elígela en "Plantilla base" al crear un avalúo.`);
      close(false);
    } catch (error) {
      toast.error(`No se pudo guardar la plantilla: ${errorText(error)}`);
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Guardar como plantilla</DialogTitle>
          <DialogDescription>
            Guarda las secciones, bloques y apartados de este avalúo, con los títulos y tipos de sus conceptos y los
            encabezados y fórmulas de sus tablas. Lo que escribe el cálculo no se guarda.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field>
            <FieldLabel htmlFor="template-name">Nombre de la plantilla</FieldLabel>
            <Input id="template-name" value={name} maxLength={120} autoFocus placeholder="Por ejemplo: Casa habitación" onChange={(event) => setName(event.target.value)} />
          </Field>
          <OptionCheckbox
            id="template-include-data"
            checked={includeData}
            onChange={setIncludeData}
            label="Incluir datos"
            description="Los valores capturados y el contenido de las tablas. Sin esto, la plantilla va vacía."
          />
          <OptionCheckbox id="template-include-images" checked={includeImages} onChange={setIncludeImages} label="Incluir imágenes" />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => close(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending || !name.trim()}>{pending ? "Guardando..." : "Guardar plantilla"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SourceKind = "template" | "valuation";
type SourceOption = { id: string; label: string; detail: string };

/**
 * "Importar bloque": a copy of a Block of one of the firm's templates or of
 * another of its valuations, at the end of this section.
 */
export function ImportBlockButton({ section }: { section: AppSection }) {
  const transfer = useStructureTransfer();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SourceKind>("template");
  const [sources, setSources] = useState<SourceOption[] | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourceSections, setSourceSections] = useState<AppSection[] | null>(null);
  const [blockKey, setBlockKey] = useState<string | null>(null);
  const [includeData, setIncludeData] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [loading, setLoading] = useState(false);
  if (!transfer || transfer.readOnly || section.id === "caratula") return null;

  const loadSources = async (next: SourceKind) => {
    setKind(next);
    setSources(null);
    setSourceId(null);
    setSourceSections(null);
    setBlockKey(null);
    setLoading(true);
    try {
      setSources(next === "template"
        ? (await api.templates.list()).map((template) => ({
            id: template.id,
            label: template.name,
            detail: `${template.blocks} bloques${template.includeData ? " · con datos" : ""}`,
          }))
        : (await api.templates.valuations())
            .filter((valuation) => valuation.id !== transfer.valuationId)
            .map((valuation) => ({ id: valuation.id, label: valuation.folio, detail: [valuation.client, valuation.location].filter(Boolean).join(" · ") })));
    } catch (error) {
      toast.error(`No se pudo cargar la lista: ${errorText(error)}`);
      setSources([]);
    } finally {
      setLoading(false);
    }
  };
  const loadSource = async (id: string) => {
    setSourceId(id);
    setSourceSections(null);
    setBlockKey(null);
    setLoading(true);
    try {
      setSourceSections(kind === "template"
        ? (await api.templates.get(id)).content.sections
        : initialSectionsFor(await api.templates.valuation(id)));
    } catch (error) {
      toast.error(`No se pudo abrir: ${errorText(error)}`);
    } finally {
      setLoading(false);
    }
  };
  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSources(null);
      setSourceId(null);
      setSourceSections(null);
      setBlockKey(null);
      setIncludeData(false);
      setIncludeImages(false);
    }
  };

  const blocks = sourceSections ? importableBlocks(sourceSections) : [];
  const keyOf = (sectionId: string, block: Block) => `${sectionId}/${block.id}`;
  const chosen = blocks.find((item) => keyOf(item.sectionId, item.block) === blockKey);
  const groups = [...new Set(blocks.map((item) => item.sectionTitle))];

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => { setOpen(true); void loadSources(kind); }}>
        <FileDown data-icon="inline-start" />
        Importar bloque
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar bloque</DialogTitle>
            <DialogDescription>
              Una copia del bloque que elijas va al final de esta sección. Lo que escribe el cálculo no se importa.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2" role="radiogroup" aria-label="De dónde importar">
            <Button type="button" size="sm" variant={kind === "template" ? "default" : "outline"} aria-pressed={kind === "template"} onClick={() => void loadSources("template")}>
              <LayoutTemplate data-icon="inline-start" />
              De una plantilla
            </Button>
            <Button type="button" size="sm" variant={kind === "valuation" ? "default" : "outline"} aria-pressed={kind === "valuation"} onClick={() => void loadSources("valuation")}>
              De otro avalúo
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid max-h-[45vh] content-start gap-1 overflow-y-auto" data-import-sources>
              <p className="text-xs font-medium uppercase text-muted-foreground">{kind === "template" ? "Plantillas del despacho" : "Avalúos del despacho"}</p>
              {sources === null ? <p className="text-sm text-muted-foreground">Cargando…</p> : sources.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {kind === "template" ? "El despacho aún no tiene plantillas. Guarda una desde \"Guardar como plantilla\"." : "No hay otros avalúos."}
                </p>
              ) : sources.map((source) => (
                <Button
                  key={source.id}
                  type="button"
                  variant={source.id === sourceId ? "default" : "outline"}
                  className="h-auto justify-start whitespace-normal py-2 text-left"
                  onClick={() => void loadSource(source.id)}
                >
                  <span className="flex flex-col items-start">
                    <span>{source.label}</span>
                    {source.detail ? <span className="text-xs opacity-80">{source.detail}</span> : null}
                  </span>
                </Button>
              ))}
            </div>
            <div className="grid max-h-[45vh] content-start gap-2 overflow-y-auto" data-import-blocks>
              <p className="text-xs font-medium uppercase text-muted-foreground">Bloques</p>
              {!sourceId ? <p className="text-sm text-muted-foreground">Elige de dónde importar.</p> : loading && !sourceSections ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : blocks.length === 0 ? <p className="text-sm text-muted-foreground">No tiene bloques que se puedan importar.</p> : groups.map((group) => (
                <div key={group} className="grid gap-1">
                  <p className="text-xs text-muted-foreground">{group}</p>
                  {blocks.filter((item) => item.sectionTitle === group).map((item) => {
                    const key = keyOf(item.sectionId, item.block);
                    return (
                      <Button
                        key={key}
                        type="button"
                        variant={key === blockKey ? "default" : "outline"}
                        className="h-auto justify-start whitespace-normal py-2 text-left"
                        onClick={() => setBlockKey(key)}
                      >
                        <span className="flex flex-col items-start">
                          <span>{item.block.title || group}</span>
                          <span className="text-xs opacity-80">
                            {item.block.concepts.length} conceptos · {item.block.apartados.length} apartados · {item.block.tables.length} tablas
                          </span>
                        </span>
                      </Button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-3">
            <OptionCheckbox id="import-include-data" checked={includeData} onChange={setIncludeData} label="Incluir datos" description="Los valores capturados y el contenido de las tablas." />
            <OptionCheckbox id="import-include-images" checked={includeImages} onChange={setIncludeImages} label="Incluir imágenes" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>Cancelar</Button>
            <Button
              type="button"
              disabled={!chosen}
              onClick={() => {
                if (chosen && transfer.importBlock(section.id, chosen.block, { includeData, includeImages })) close(false);
              }}
            >
              Insertar copia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
