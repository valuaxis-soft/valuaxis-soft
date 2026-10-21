"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FilePlus2, LayoutTemplate, Loader2, Pencil, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { api, SessionExpiredError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ValuationTemplateSummary } from "../services/valuation-template.service";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof SessionExpiredError
    ? "Tu sesión expiró. Vuelve a iniciar sesión."
    : error instanceof Error
      ? error.message
      : fallback;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The firm's templates: what each one brings, who saved it and when, and
 * "Renombrar", "Eliminar" and "Crear avalúo con esta plantilla". A template
 * is saved, or replaced by a new version, from the editor ("Guardar como
 * plantilla").
 */
export function TemplateManager({ initialTemplates, canCreate }: {
  initialTemplates: ValuationTemplateSummary[];
  /** The user creates valuations (AVALUO_CREAR). */
  canCreate: boolean;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [editing, setEditing] = useState<ValuationTemplateSummary | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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

  const startEditing = (template: ValuationTemplateSummary) => {
    setEditing(template);
    setName(template.name);
    setDescription(template.description ?? "");
  };

  const saveEdit = (event: FormEvent) => {
    event.preventDefault();
    const template = editing;
    if (!template || !name.trim()) return;
    void run(async () => {
      await api.templates.update(template.id, { name: name.trim(), description: description.trim() || null });
      toast.success("Plantilla actualizada.");
    }, "No se pudo cambiar el nombre.").then((ok) => { if (ok) setEditing(null); });
  };

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <LayoutTemplate className="size-8 text-muted-foreground/60" />
          <p className="font-medium text-foreground">El despacho aún no tiene plantillas.</p>
          <p>Abre un avalúo y usa &quot;Guardar como plantilla&quot; para guardar su estructura con un nombre.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <ul className="grid gap-3" data-template-list>
        {templates.map((template) => (
          <li key={template.id} data-template-row={template.name}>
            <Card>
              <CardContent className="grid gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold wrap-break-word">{template.name}</p>
                    {template.description ? (
                      <p className="mt-0.5 text-sm wrap-break-word text-muted-foreground">{template.description}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{plural(template.sections, "sección", "secciones")}</Badge>
                    <Badge variant="secondary">{plural(template.blocks, "bloque", "bloques")}</Badge>
                    {template.includeData ? <Badge variant="outline">Con datos</Badge> : null}
                    {template.includeImages ? <Badge variant="outline">Con imágenes</Badge> : null}
                    {template.version > 1 ? <Badge variant="outline">Versión {template.version}</Badge> : null}
                  </div>
                </div>
                <dl className="grid gap-x-6 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
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
                  {canCreate ? (
                    <Link
                      href={`/workspace?action=new&plantilla=${template.id}`}
                      className={cn(buttonVariants({ size: "sm" }))}
                    >
                      <FilePlus2 data-icon="inline-start" />
                      Crear avalúo con esta plantilla
                    </Link>
                  ) : null}
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => startEditing(template)}>
                    <Pencil data-icon="inline-start" />
                    Renombrar
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

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renombrar plantilla</DialogTitle>
            <DialogDescription>El nombre no se repite en el despacho, sin importar mayúsculas ni acentos.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={saveEdit}>
            <Field>
              <FieldLabel htmlFor="rename-template-name">Nombre</FieldLabel>
              <Input id="rename-template-name" value={name} maxLength={120} autoFocus onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="rename-template-description">Descripción (opcional)</FieldLabel>
              <Textarea
                id="rename-template-description"
                value={description}
                maxLength={500}
                rows={2}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Guardar
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
              Deja de aparecer en &quot;Plantilla base&quot; y en &quot;Importar bloque&quot;. Los avalúos que ya se crearon con ella no
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
