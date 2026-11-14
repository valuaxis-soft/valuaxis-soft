"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileDown, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-client";
import type { AppSection, Block } from "@/features/valuations/model";
import {
  EMPTY_SELECTION,
  apartadoKey,
  blockLeaves,
  checkState,
  importTree,
  ownContentKey,
  planImport,
  plannedBlockCount,
  sectionLeaves,
  toggleLeaves,
  type ImportPlanSection,
  type ImportSelection,
  type ImportTreeSection,
} from "@/features/valuations/services/structure-import";
import { SUBBLOCK_TERM } from "../editor/block-toolbar";
import { initialSectionsFor } from "./model/initial-hydration";
import { useStructureTransfer } from "./structure-transfer-context";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Error desconocido");

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a block to import holds, in the words of the editor: "3 conceptos · 1 subbloque · 2 tablas". */
export function importBlockSummary(block: Pick<Block, "concepts" | "apartados" | "tables">) {
  return [
    count(block.concepts.length, "concepto", "conceptos"),
    count(block.apartados.length, SUBBLOCK_TERM, `${SUBBLOCK_TERM}s`),
    count(block.tables.length, "tabla", "tablas"),
  ].join(" · ");
}

/** The heading of a group of blocks to import: the section (the tab) they come from. */
export function importSectionHeading(sectionTitle: string) {
  const title = sectionTitle.trim();
  // A title written in capitals ("INFO TERRENO") reads as a heading in sentence case: "Sección: Info terreno".
  const readable = title && title === title.toUpperCase() ? title.charAt(0) + title.slice(1).toLowerCase() : title;
  return `Sección: ${readable || "Sin título"}`;
}

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
 * under a name of the firm's. Pending changes are saved first. Under the name
 * of an existing template it offers "Reemplazar": a new version of that one.
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
  const [description, setDescription] = useState("");
  const [includeImages, setIncludeImages] = useState(false);
  const [pending, setPending] = useState(false);
  /** The name is already one of the firm's templates: replace it or write another. */
  const [nameTaken, setNameTaken] = useState(false);
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setName("");
      setDescription("");
      setIncludeImages(false);
      setNameTaken(false);
    }
  };
  const submit = async (replace: boolean) => {
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      if (!(await saveFirst())) return;
      const template = await api.templates.create({
        name: name.trim(),
        // Left empty, a replacement keeps the template's description.
        description: description.trim() || undefined,
        valuationId,
        // The client's data never go into a template: only the structure, the formats and the appraiser's texts.
        includeData: false,
        includeImages,
        replace,
      });
      toast.success(replace
        ? `Plantilla "${template.name}" reemplazada (versión ${template.version}). Los avalúos nuevos parten de esta versión.`
        : `Plantilla "${template.name}" guardada. Elígela en "Plantilla base" al crear un avalúo.`);
      close(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setNameTaken(true);
      else toast.error(`No se pudo guardar la plantilla: ${errorText(error)}`);
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
            Guarda las secciones, bloques y subbloques de este avalúo, con los títulos, tipos y formatos de sus conceptos, los
            encabezados y fórmulas de sus tablas y los textos de Consideraciones. Los datos del cliente y del inmueble no se
            guardan; lo que escribe el cálculo tampoco.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(nameTaken);
          }}
        >
          <Field>
            <FieldLabel htmlFor="template-name">Nombre de la plantilla</FieldLabel>
            <Input
              id="template-name"
              value={name}
              maxLength={120}
              autoFocus
              placeholder="Por ejemplo: Casa habitación"
              aria-invalid={nameTaken || undefined}
              onChange={(event) => {
                setName(event.target.value);
                setNameTaken(false);
              }}
            />
            {nameTaken ? (
              <FieldDescription className="text-destructive" role="alert" data-template-name-taken>
                Ya hay una plantilla con ese nombre. Reemplázala para guardar este documento como su versión nueva (los
                avalúos ya creados con ella no cambian), o escribe otro nombre.
              </FieldDescription>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="template-description">Descripción (opcional)</FieldLabel>
            <Textarea
              id="template-description"
              value={description}
              maxLength={500}
              rows={2}
              placeholder="Para qué sirve o en qué se distingue"
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          {/* A line sets the options apart from what the template is called. */}
          <div className="border-t pt-4" data-template-options="">
            <OptionCheckbox id="template-include-images" checked={includeImages} onChange={setIncludeImages} label="Incluir imágenes" description="Las imágenes de los bloques (no las fotografías de Datos generales, que son del avalúo)." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => close(false)}>Cancelar</Button>
            <Button type="submit" variant={nameTaken ? "destructive" : "default"} disabled={pending || !name.trim()}>
              {pending ? "Guardando..." : nameTaken ? "Reemplazar" : "Guardar plantilla"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SourceKind = "template" | "valuation";
type SourceOption = { id: string; label: string; detail: string };

/**
 * What «Incluir datos» and «Incluir datos y autovincular» bring, by source.
 * A template keeps no data of the client or the property (`stripClientData`),
 * only the appraiser's texts: the dialog does not promise values it lacks.
 */
export function importDataOptionTexts(kind: SourceKind): { includeData: string; autoLink: string } {
  const link = "Cada concepto que se llame igual que uno de este avalúo que ya tiene dato (por ejemplo «Solicitante» de la carátula) queda vinculado a él y muestra ese dato.";
  if (kind === "template") {
    return {
      includeData: "Las plantillas no guardan datos del cliente ni del inmueble: solo traen los textos del valuador (Consideraciones, textos largos y párrafos). Sin esta opción llegan vacíos.",
      autoLink: `${link} Como la plantilla no trae datos del cliente, los demás conceptos llegan vacíos para capturarlos. Al terminar te decimos cuántos se vincularon.`,
    };
  }
  return {
    includeData: "Los valores capturados y el contenido de las tablas, como están en el avalúo de origen.",
    autoLink: `${link} Los demás traen el valor del avalúo de origen. Al terminar te decimos cuántos se vincularon.`,
  };
}

/** What the boxes chose, in the editor's words: «2 bloques y 1 subbloque», «1 sección completa». */
export function importChoiceSummary(tree: ImportTreeSection[], selection: ImportSelection): string {
  let blocks = 0;
  let apartados = 0;
  for (const item of tree) {
    if (selection.wholeSections.has(item.section.id)) continue;
    for (const block of item.blocks) {
      const state = checkState(selection, blockLeaves(block));
      if (state === true) blocks += 1;
      else if (state === "indeterminate") apartados += block.block.apartados.filter((apartado) => selection.leaves.has(apartadoKey(block, apartado))).length || 1;
    }
  }
  const parts = [
    selection.wholeSections.size ? count(selection.wholeSections.size, "sección completa", "secciones completas") : "",
    blocks ? count(blocks, "bloque", "bloques") : "",
    apartados ? count(apartados, SUBBLOCK_TERM, `${SUBBLOCK_TERM}s`) : "",
  ].filter(Boolean);
  if (!parts.length) return "Nada elegido todavía.";
  return `Elegiste ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : parts[0]}.`;
}

/** Where a whole section goes, as the dialog says it before importing. */
export function importDestinationText(item: ImportPlanSection): string {
  const name = importSectionHeading(item.title).replace(/^Sección: /, "");
  if (!item.destination) return `«${name}» se agrega como sección nueva.`;
  const destination = importSectionHeading(item.destination.title || item.destination.label).replace(/^Sección: /, "");
  return item.destinationHasContent
    ? `«${name}» va a «${destination}», que ya tiene contenido: te preguntaremos si agregar al final o reemplazarlo.`
    : `«${name}» sustituye a «${destination}», que está vacía.`;
}

function TreeCheckbox({ id, state, onChange, label }: {
  id: string;
  state: boolean | "indeterminate";
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <Checkbox
      id={id}
      aria-label={label}
      checked={state === true}
      indeterminate={state === "indeterminate"}
      onCheckedChange={() => onChange(state !== true)}
    />
  );
}

/**
 * "Importar": copies of Blocks, of subbloques on their own or of whole
 * sections of one of the firm's templates or of another of its valuations,
 * chosen in a tree (Sección › Bloque › Subbloque) with check boxes
 * (`structure-import.ts`). Blocks and subbloques go at the end of this
 * section; a whole section goes to its own section of this valuation.
 */
export function ImportBlockButton({ section }: { section: AppSection }) {
  const transfer = useStructureTransfer();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SourceKind>("template");
  const [sources, setSources] = useState<SourceOption[] | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourceSections, setSourceSections] = useState<AppSection[] | null>(null);
  const [selection, setSelection] = useState<ImportSelection>(EMPTY_SELECTION);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [includeData, setIncludeData] = useState(false);
  const [autoLink, setAutoLink] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [asking, setAsking] = useState(false);
  const [loading, setLoading] = useState(false);
  if (!transfer || transfer.readOnly || section.id === "caratula") return null;

  const resetChoice = () => {
    setSelection(EMPTY_SELECTION);
    setExpanded(new Set());
  };
  const loadSources = async (next: SourceKind) => {
    setKind(next);
    setSources(null);
    setSourceId(null);
    setSourceSections(null);
    resetChoice();
    setLoading(true);
    try {
      setSources(next === "template"
        ? (await api.templates.list()).map((template) => ({
            id: template.id,
            label: template.name,
            detail: `${template.blocks} bloques${template.containsData ? " · contiene datos" : ""}`,
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
    resetChoice();
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
      resetChoice();
      setIncludeData(false);
      setAutoLink(false);
      setIncludeImages(false);
      setAsking(false);
    }
  };

  const tree = sourceSections ? importTree(sourceSections) : [];
  const plan = planImport(tree, selection, transfer.sections);
  const chosen = plannedBlockCount(plan) > 0;
  const toggle = (leaves: string[], checked: boolean, wholeSection?: string) =>
    setSelection((current) => toggleLeaves(current, tree, leaves, checked, wholeSection));
  const toggleExpanded = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const runImport = (conflict?: "append" | "replace") => {
    if (transfer.importStructure(section.id, plan, { includeData: includeData || autoLink, includeImages, autoLink, conflict })) close(false);
  };
  const conflicts = plan.sections.filter((item) => item.destinationHasContent);

  return (
    <>
      <Button type="button" size="sm" variant="outline" title="Bloques, subbloques o secciones completas de una plantilla o de otro avalúo" onClick={() => { setOpen(true); void loadSources(kind); }}>
        <FileDown data-icon="inline-start" />
        Importar
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importar bloques, subbloques o secciones</DialogTitle>
            <DialogDescription>
              Marca uno o varios bloques, solo los subbloques que quieras (van dentro de su bloque) o una sección completa. Los bloques y
              subbloques van al final de esta sección; una sección completa va a su sección de este avalúo. Lo que escribe el cálculo no se importa.
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
          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
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
            <div className="grid max-h-[45vh] content-start gap-3 overflow-y-auto pr-1" data-import-blocks>
              <p className="text-xs font-medium uppercase text-muted-foreground">Secciones, bloques y subbloques</p>
              {!sourceId ? <p className="text-sm text-muted-foreground">Elige de dónde importar.</p> : loading && !sourceSections ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : tree.length === 0 ? <p className="text-sm text-muted-foreground">No tiene bloques que se puedan importar.</p> : tree.map((item) => {
                const heading = importSectionHeading(item.title);
                const leaves = sectionLeaves(item);
                const whole = selection.wholeSections.has(item.section.id);
                return (
                  <div key={item.section.id} className="grid gap-1" data-import-section={item.title}>
                    {/* The section's own box chooses it whole: it goes to its section of this valuation. */}
                    <div className="flex items-center gap-2">
                      <TreeCheckbox
                        id={`import-section-${item.section.id}`}
                        label={`Importar la sección ${heading.replace(/^Sección: /, "")} completa`}
                        state={whole ? true : checkState(selection, leaves) === false ? false : "indeterminate"}
                        onChange={(checked) => toggle(leaves, checked, item.section.id)}
                      />
                      <label htmlFor={`import-section-${item.section.id}`} className="text-sm font-semibold text-foreground">{heading}</label>
                      {whole ? <span className="text-xs text-muted-foreground">completa</span> : null}
                    </div>
                    {item.blocks.map((block) => {
                      const blockState = checkState(selection, blockLeaves(block));
                      const isOpen = expanded.has(block.key) || blockState === "indeterminate";
                      const children = blockLeaves(block).length > 1 || block.block.apartados.length > 0;
                      return (
                        <div key={block.key} className="ml-3 grid gap-1 rounded-md border bg-card px-2 py-1.5" data-import-block={block.block.title}>
                          <div className="flex items-start gap-2">
                            <span className="pt-0.5">
                              <TreeCheckbox
                                id={`import-block-${block.key}`}
                                label={`Importar el bloque ${block.block.title || item.title}`}
                                state={blockState}
                                onChange={(checked) => toggle(blockLeaves(block), checked)}
                              />
                            </span>
                            {/* A click on the Block shows its subbloques, to choose them one by one. */}
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-start gap-1 text-left"
                              aria-expanded={children ? isOpen : undefined}
                              disabled={!children}
                              onClick={() => toggleExpanded(block.key)}
                            >
                              {children ? (isOpen ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />) : <span className="size-4 shrink-0" />}
                              <span className="flex min-w-0 flex-col">
                                <span className="text-sm font-semibold wrap-break-word">{block.block.title || item.title}</span>
                                <span className="text-xs tabular-nums text-muted-foreground">{importBlockSummary(block.block)}</span>
                              </span>
                            </button>
                          </div>
                          {children && isOpen ? (
                            <div className="ml-6 grid gap-1 border-l pl-3" data-import-apartados="">
                              {block.hasOwnContent ? (
                                <div className="flex items-center gap-2">
                                  <TreeCheckbox
                                    id={`import-own-${block.key}`}
                                    label={`Conceptos y tablas del bloque ${block.block.title}`}
                                    state={selection.leaves.has(ownContentKey(block))}
                                    onChange={(checked) => toggle([ownContentKey(block)], checked)}
                                  />
                                  <label htmlFor={`import-own-${block.key}`} className="text-sm text-muted-foreground">Conceptos y tablas del bloque</label>
                                </div>
                              ) : null}
                              {block.block.apartados.map((apartado) => {
                                const key = apartadoKey(block, apartado);
                                return (
                                  <div key={key} className="flex items-center gap-2" data-import-apartado={apartado.title}>
                                    <TreeCheckbox
                                      id={`import-apartado-${key}`}
                                      label={`Importar el ${SUBBLOCK_TERM} ${apartado.title}`}
                                      state={selection.leaves.has(key)}
                                      onChange={(checked) => toggle([key], checked)}
                                    />
                                    <label htmlFor={`import-apartado-${key}`} className="min-w-0 text-sm">
                                      <span className="wrap-break-word">{apartado.title || SUBBLOCK_TERM}</span>
                                      <span className="ml-2 text-xs tabular-nums text-muted-foreground">{count(apartado.concepts.length, "concepto", "conceptos")}</span>
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          {plan.sections.length ? (
            <div className="grid gap-1 rounded-md border border-dashed px-3 py-2 text-sm" data-import-destinations="">
              {plan.sections.map((item) => <p key={item.source.id}>{importDestinationText(item)}</p>)}
            </div>
          ) : null}
          {/* A line sets what is copied apart from the list it is chosen from. */}
          <div className="grid gap-3 border-t pt-4" data-import-options="">
            <OptionCheckbox
              id="import-include-data"
              checked={includeData || autoLink}
              onChange={(next) => {
                setIncludeData(next);
                if (!next) setAutoLink(false);
              }}
              label="Incluir datos"
              description={importDataOptionTexts(kind).includeData}
            />
            <OptionCheckbox
              id="import-auto-link"
              checked={autoLink}
              onChange={(next) => {
                setAutoLink(next);
                if (next) setIncludeData(true);
              }}
              label="Incluir datos y autovincular"
              description={importDataOptionTexts(kind).autoLink}
            />
            <OptionCheckbox id="import-include-images" checked={includeImages} onChange={setIncludeImages} label="Incluir imágenes" />
          </div>
          <DialogFooter className="items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" data-import-choice="">{importChoiceSummary(tree, selection)}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => close(false)}>Cancelar</Button>
              <Button
                type="button"
                disabled={!chosen}
                onClick={() => {
                  if (conflicts.length) setAsking(true);
                  else runImport();
                }}
              >
                Importar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* A whole section into one with content: add at its end or replace it, asked once for all. */}
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {conflicts.length === 1
                ? `«${importSectionHeading(conflicts[0].destination?.title ?? "").replace(/^Sección: /, "")}» ya tiene contenido`
                : `${conflicts.length} secciones ya tienen contenido`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Puedes agregar lo importado al final de lo que ya tiene o reemplazar sus bloques (los del cálculo se quedan). Puedes deshacerlo con
              «Deshacer» antes de guardar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={() => { setAsking(false); runImport("append"); }}>Agregar al final</Button>
            <Button type="button" variant="destructive" onClick={() => { setAsking(false); runImport("replace"); }}>Reemplazar contenido</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
