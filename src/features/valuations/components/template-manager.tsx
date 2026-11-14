"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Copy, FilePlus2, LayoutTemplate, Loader2, PencilLine, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, SessionExpiredError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Letterhead } from "../model";
import type { CatalogOption } from "../services/valuation-catalogs.service";
import type { ValuationTemplateSummary } from "../services/valuation-template.service";
import { appliesToLabel, TemplateDetailsDialog, type TemplateDetails } from "./template-details-dialog";
import { TemplatePreviewButton } from "./template-preview-dialog";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof SessionExpiredError
    ? "Tu sesión expiró. Vuelve a iniciar sesión."
    : error instanceof Error
      ? error.message
      : fallback;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Where «Editar» opens a template: the valuation editor on it. */
export const templateEditorHref = (templateId: string) => `/organizacion/plantillas/${templateId}/editar`;

/** «Casa habitación (copia)», «(copia 2)»… a name no template of the firm has yet. */
export function duplicateName(name: string, taken: readonly string[]) {
  const key = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const used = new Set(taken.map(key));
  for (let copy = 1; ; copy += 1) {
    const candidate = `${name} (copia${copy === 1 ? "" : ` ${copy}`})`.slice(0, 120);
    if (!used.has(key(candidate))) return candidate;
  }
}

/**
 * The firm's templates, numbered: what each one brings and is meant for, who
 * saved it and when, its notes, and its actions: «Vista previa», «Editar»
 * (the valuation editor on it), «Datos» (name, notes and type), «Duplicar»,
 * «Eliminar» and «Crear avalúo con esta plantilla». «Nueva plantilla» starts
 * one from the system's sections; «Guardar como plantilla» in the editor
 * still saves one from a valuation.
 */
export function TemplateManager({ initialTemplates, canCreate, letterhead, appraisalTypes = [], propertyTypes = [] }: {
  initialTemplates: ValuationTemplateSummary[];
  /** The user creates valuations (AVALUO_CREAR). */
  canCreate: boolean;
  /** The firm's letterhead, for the header of the preview. */
  letterhead: Letterhead;
  /** The kinds of valuation and of property a template can be meant for. */
  appraisalTypes?: CatalogOption[];
  propertyTypes?: CatalogOption[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ValuationTemplateSummary | null>(null);
  const [duplicating, setDuplicating] = useState<ValuationTemplateSummary | null>(null);
  const [copyName, setCopyName] = useState("");
  const [removing, setRemoving] = useState<ValuationTemplateSummary | null>(null);
  // Apart from `removing`, so the dialog keeps the name while it closes.
  const [removeOpen, setRemoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    try {
      await action();
      setTemplates(await api.templates.list());
      return true;
    } catch (error) {
      toast.error(errorMessage(error, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createTemplate = async (details: TemplateDetails) => {
    try {
      const created = await api.templates.createBlank(details);
      toast.success(`Plantilla «${created.name}» creada. Dale forma en el editor.`);
      // «nueva»: its first save completes version 1 instead of adding a second one.
      window.location.assign(`${templateEditorHref(created.id)}?nueva=1`);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo crear la plantilla."));
      return false;
    }
  };

  const saveDetails = (template: ValuationTemplateSummary) => (details: TemplateDetails) =>
    run(async () => {
      await api.templates.update(template.id, details);
      toast.success("Plantilla actualizada.");
    }, "No se pudo guardar la plantilla.");

  const startDuplicate = (template: ValuationTemplateSummary) => {
    setDuplicating(template);
    setCopyName(duplicateName(template.name, templates.map((item) => item.name)));
  };

  const saveDuplicate = (event: FormEvent) => {
    event.preventDefault();
    const template = duplicating;
    if (!template || !copyName.trim()) return;
    void run(async () => {
      const copy = await api.templates.duplicate(template.id, copyName.trim());
      toast.success(`Se duplicó «${template.name}» como «${copy.name}».`);
    }, "No se pudo duplicar la plantilla.").then((ok) => { if (ok) setDuplicating(null); });
  };

  const firstType = appraisalTypes[0]?.id ?? 0;
  const newButton = (
    <Button type="button" onClick={() => setCreating(true)} disabled={!firstType} data-new-template>
      <Plus data-icon="inline-start" />
      Nueva plantilla
    </Button>
  );

  return (
    <>
      <div className="mb-4 flex justify-end">{newButton}</div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <LayoutTemplate className="size-8 text-muted-foreground/60" />
            <p className="font-medium text-foreground">El despacho aún no tiene plantillas.</p>
            <p>Crea una con «Nueva plantilla», o abre un avalúo y usa &quot;Guardar como plantilla&quot; para guardar su estructura con un nombre.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3" data-template-list>
          {templates.map((template, index) => (
            <li key={template.id} data-template-row={template.name} data-template-number={index + 1}>
              <Card>
                <CardContent className="grid gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground tabular-nums"
                        aria-label={`Plantilla ${index + 1}`}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-semibold wrap-break-word">{template.name}</p>
                        <p className="text-sm text-muted-foreground" data-template-applies-to>
                          Para: {appliesToLabel(template.appraisalType.name, template.propertyType?.name)}
                        </p>
                        {template.description ? (
                          <p className="mt-0.5 text-base wrap-break-word whitespace-pre-line text-muted-foreground">{template.description}</p>
                        ) : (
                          <p className="mt-0.5 text-sm text-muted-foreground italic">Sin notas. Agrégalas con «Datos».</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{plural(template.sections, "sección", "secciones")}</Badge>
                      <Badge variant="secondary">{plural(template.blocks, "bloque", "bloques")}</Badge>
                      {template.containsData ? <Badge variant="destructive" title="Guardada con datos de un cliente; límpiala con scripts/ops/limpiar-plantillas.ts o reemplázala">Contiene datos</Badge> : null}
                      {template.includeImages ? <Badge variant="outline">Con imágenes</Badge> : null}
                      {template.version > 1 ? <Badge variant="outline">Versión {template.version}</Badge> : null}
                    </div>
                  </div>
                  <dl className="grid gap-x-6 gap-y-0.5 text-sm text-muted-foreground sm:grid-cols-2">
                    <div>
                      <dt className="inline">Creada: </dt>
                      <dd className="inline">{formatDate(template.createdAt)}{template.createdBy ? ` por ${template.createdBy}` : ""}</dd>
                    </div>
                    <div>
                      <dt className="inline">Actualizada: </dt>
                      <dd className="inline">
                        {formatDate(template.updatedAt)}
                        {template.version > 1 && template.versionBy ? ` · versión ${template.version} de ${template.versionBy}` : ""}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <TemplatePreviewButton templateId={template.id} name={template.name} letterhead={letterhead} canCreate={canCreate} number={index + 1} />
                    {canCreate ? (
                      <Link
                        href={`/workspace?action=new&plantilla=${template.id}`}
                        className={cn(buttonVariants({ size: "sm" }))}
                      >
                        <FilePlus2 data-icon="inline-start" />
                        Crear avalúo con esta plantilla
                      </Link>
                    ) : null}
                    <Link href={templateEditorHref(template.id)} className={cn(buttonVariants({ size: "sm", variant: "outline" }))} data-edit-template>
                      <PencilLine data-icon="inline-start" />
                      Editar
                    </Link>
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing(template)}>
                      <Settings2 data-icon="inline-start" />
                      Datos
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => startDuplicate(template)}>
                      <Copy data-icon="inline-start" />
                      Duplicar
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setRemoving(template); setRemoveOpen(true); }}>
                      <Trash2 data-icon="inline-start" />
                      Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <TemplateDetailsDialog
        open={creating}
        onOpenChange={setCreating}
        title="Nueva plantilla"
        intro="Empieza con las secciones de un avalúo nuevo, sin datos de ningún cliente. Después se abre el editor del avalúo para agregar, quitar y acomodar bloques, subbloques, conceptos, tablas, fórmulas y formato."
        submitLabel="Crear y abrir el editor"
        initial={{ name: "", description: null, appraisalTypeId: firstType, propertyTypeId: null }}
        appraisalTypes={appraisalTypes}
        propertyTypes={propertyTypes}
        onSubmit={createTemplate}
      />

      <TemplateDetailsDialog
        open={editing !== null}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        title="Datos de la plantilla"
        intro="El nombre con que aparece en «Plantilla base» e «Importar», para qué avalúos es y sus notas. La estructura se cambia con «Editar»."
        submitLabel="Guardar"
        initial={{
          name: editing?.name ?? "",
          description: editing?.description ?? null,
          appraisalTypeId: editing?.appraisalType.id ?? firstType,
          propertyTypeId: editing?.propertyType?.id ?? null,
        }}
        appraisalTypes={appraisalTypes}
        propertyTypes={propertyTypes}
        onSubmit={(details) => (editing ? saveDetails(editing)(details) : Promise.resolve(false))}
      />

      <Dialog open={duplicating !== null} onOpenChange={(open) => { if (!open) setDuplicating(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicar {duplicating?.name}</DialogTitle>
            <DialogDescription>
              La copia lleva la misma estructura, notas y tipo, como una plantilla aparte: cambiar una no cambia la otra.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={saveDuplicate}>
            <Field>
              <FieldLabel htmlFor="duplicate-template-name">Nombre de la copia</FieldLabel>
              <Input id="duplicate-template-name" value={copyName} maxLength={120} autoFocus onChange={(event) => setCopyName(event.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setDuplicating(null)}>Cancelar</Button>
              <Button type="submit" disabled={busy || !copyName.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Duplicar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la plantilla {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de aparecer en &quot;Plantilla base&quot; y en &quot;Importar&quot;. Los avalúos que ya se crearon con ella no
              cambian.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={busy}
              onClick={() => {
                const template = removing;
                if (!template) return;
                void run(async () => {
                  await api.templates.remove(template.id);
                  toast.success(`Plantilla "${template.name}" eliminada.`);
                }, "No se pudo eliminar la plantilla.").then(() => setRemoveOpen(false));
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
