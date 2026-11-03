"use client";

import { Copy, History, Loader2, Pencil, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatComparableId, formatDay } from "@/features/valuations/calculation/comparable-card";
import type { ComparableCardDto } from "@/features/valuations/calculation/comparable-card.service";
import { COMPARABLE_TYPE_LABELS } from "@/features/valuations/calculation/market-types";
import { ComparableCardView } from "@/features/valuations/components/calculation/comparable-card-view";
import { api, SessionExpiredError } from "@/lib/api-client";
import { BaseComparableDialog } from "./base-comparable-dialog";
import { ComparableLocationMap } from "./comparable-location-map";

const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo completar la acción.";

/**
 * "Ficha del comparable" with its actions (edit, duplicate, delete), its map,
 * and the "Historial": the valuations it was used in and every capture of it
 * with its dates. `?editar=1` opens the form at once (the "Editar" of the list).
 */
export function ComparableCardPanel({ card, canEdit, validityMonths, attributeNames }: {
  card: ComparableCardDto;
  canEdit: boolean;
  validityMonths: number;
  attributeNames: string[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [editing, setEditing] = useState(() => canEdit && search.get("editar") === "1");
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const { comparable } = card;
  const coordinates = comparable.latitude !== null && comparable.latitude !== undefined && comparable.longitude !== null && comparable.longitude !== undefined
    ? { latitude: comparable.latitude, longitude: comparable.longitude } : null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const duplicate = () => run(async () => {
    const copy = await api.comparableBase.duplicate(comparable.id);
    toast.success(`Comparable duplicado como ${formatComparableId(copy.folio) ?? "uno nuevo"}.`);
    router.push(`/comparables/${copy.id}`);
  });
  const remove = () => run(async () => {
    const outcome = await api.comparableBase.remove(comparable.id);
    setDeleting(false);
    if (outcome.deleted) {
      toast.success("Comparable eliminado de la base.");
      router.push("/comparables");
      return;
    }
    for (const kept of outcome.kept) toast.info(`Se capturó en el avalúo ${kept.valuationFolio}: se quita desde su mercado.`);
  });

  return (
    <div className="grid gap-3">
      {canEdit ? (
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Acciones de la ficha">
          <Button type="button" size="sm" onClick={() => setEditing(true)}><Pencil data-icon="inline-start" /> Editar ficha</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void duplicate()}><Copy data-icon="inline-start" /> Duplicar</Button>
          <Button type="button" size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => setDeleting(true)}>
            <Trash2 data-icon="inline-start" /> Eliminar
          </Button>
        </div>
      ) : null}

      <Tabs defaultValue="ficha">
        <TabsList>
          <TabsTrigger value="ficha">Ficha</TabsTrigger>
          <TabsTrigger value="historial"><History data-icon="inline-start" /> Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="ficha" className="grid gap-3">
          <ComparableLocationMap comparableId={comparable.id} coordinates={coordinates} canEdit={canEdit} />
          <ComparableCardView card={card} />
        </TabsContent>
        <TabsContent value="historial" className="grid gap-3 text-sm" data-comparable-history>
          <section className="rounded-md border">
            <h2 className="border-b bg-muted/40 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide">Avalúos en que se usó</h2>
            <ul className="grid gap-1 p-2 text-xs">
              {card.uses.map((use) => (
                <li key={`${use.valuationId}:${use.type}:${use.reference}`} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-medium">{use.folio}</span>
                  <span className="text-muted-foreground">{use.title ?? ""}</span>
                  {use.client ? <span className="text-muted-foreground">· cliente {use.client}</span> : null}
                  <span className="text-muted-foreground">· {COMPARABLE_TYPE_LABELS[use.type]}, comparable {use.reference}, agregado el {formatDay(use.addedOn)}</span>
                  <a className="text-primary underline-offset-2 hover:underline" href={`/workspace?id=${use.valuationId}`} target="_blank" rel="noopener noreferrer">Abrir avalúo</a>
                </li>
              ))}
              {!card.uses.length ? <li className="text-muted-foreground">Todavía no se usa en un avalúo.</li> : null}
            </ul>
          </section>
          <section className="rounded-md border">
            <h2 className="border-b bg-muted/40 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide">Últimos cambios</h2>
            <p className="px-2 pt-2 text-xs text-muted-foreground">
              Cada captura del comparable en la base, con la fecha en que se capturó, la de su última actualización de datos (la que cuenta para la vigencia)
              y la de su último cambio de cualquier tipo (factores, revisión, fotos).
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="px-2 py-1.5 font-medium">Dónde</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">Capturado</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">Datos actualizados</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">Último cambio</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">Por</th>
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-muted/40">
                {card.history.map((capture) => (
                  <tr key={capture.id} data-capture={capture.id}>
                    <td className="px-2 py-1.5">
                      {capture.valuation ? <a className="font-mono text-primary hover:underline" href={`/workspace?id=${capture.valuation.id}`} target="_blank" rel="noopener noreferrer">{capture.valuation.folio}</a> : "Base general"}
                      {capture.current ? <Badge variant="secondary" className="ml-1">Esta ficha</Badge> : null}
                    </td>
                    <td className="px-2 py-1.5">{formatDay(capture.capturedOn)}</td>
                    <td className="px-2 py-1.5">{formatDay(capture.dataUpdatedOn)}</td>
                    <td className="px-2 py-1.5">{formatDay(capture.modifiedOn)}</td>
                    <td className="px-2 py-1.5">{capture.capturedBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {comparable.review?.reviewedAt ? (
              <p className="px-2 pb-2 text-xs text-muted-foreground">
                Revisión: {comparable.review.reviewedBy ?? "—"}, {new Date(comparable.review.reviewedAt).toLocaleString("es-MX")}.
              </p>
            ) : null}
          </section>
        </TabsContent>
      </Tabs>

      {editing ? (
        <BaseComparableDialog
          open
          onOpenChange={(open) => { if (!open) setEditing(false); }}
          card={card}
          defaultValidityMonths={validityMonths}
          attributeNames={attributeNames}
          onSaved={(id) => { if (id !== comparable.id) router.replace(`/comparables/${id}`); }}
        />
      ) : null}

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el comparable {formatComparableId(comparable.folio) ?? ""} de la base?</AlertDialogTitle>
            <AlertDialogDescription>
              Solo se elimina si está guardado en la base sin avalúo; uno capturado en un avalúo se conserva y se quita desde ese avalúo. Las
              imágenes no se borran del almacenamiento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction type="button" disabled={busy} onClick={() => void remove()}>
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
