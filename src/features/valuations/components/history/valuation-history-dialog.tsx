"use client";

import {
  Archive, CircleCheck, Copy, Download, Eye, FilePlus2, FileText, History, Loader2, Pencil, RotateCcw, Save, Send, Trash2, Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import type { HistoryEvent, HistoryKind, ValuationHistory } from "@/features/valuations/services/valuation-history";
import { cn } from "@/lib/utils";

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });
const formatAt = (iso: string) => dateTime.format(new Date(iso));

const KIND_ICONS: Record<HistoryKind, LucideIcon> = {
  creation: FilePlus2,
  copy: Copy,
  save: Save,
  data: Pencil,
  status: Pencil,
  submit: Send,
  approve: CircleCheck,
  return: Undo2,
  conclude: CircleCheck,
  reopen: RotateCcw,
  export: FileText,
  archive: Archive,
  trash: Trash2,
  restore: RotateCcw,
};

/** The review and lifecycle steps stand out; saves and exports read quieter. */
const PROMINENT: ReadonlySet<HistoryKind> = new Set(["submit", "approve", "return", "conclude", "reopen", "creation", "copy", "trash", "restore"]);

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; history: ValuationHistory };

/**
 * «Historial» of a valuation: who did what and when (status changes, saves,
 * conclusion, reopening with its reason, review, copies, archive, exports)
 * and its versions, each one readable as it was saved and with the PDFs it
 * stored. Read when the dialog opens.
 */
export function ValuationHistoryDialog({ open, onOpenChange, valuationId, folio, canExport }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  valuationId: string;
  folio: string;
  /** Opening a version and downloading a PDF are exports (AVALUO_EXPORTAR). */
  canExport: boolean;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    api.valuations.history(valuationId)
      .then((history) => { if (active) setLoad({ state: "ready", history }); })
      .catch((error: unknown) => { if (active) setLoad({ state: "error", message: error instanceof Error ? error.message : "No se pudo leer el historial." }); });
    return () => { active = false; };
  }, [open, valuationId, attempt]);

  const handleOpenChange = (next: boolean) => {
    if (next) setLoad({ state: "loading" });
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl" data-valuation-history="">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" aria-hidden="true" />
            Historial de {folio}
          </DialogTitle>
          <DialogDescription>Quién hizo qué y cuándo, y las versiones del avalúo. Lo registra el sistema; no se puede editar.</DialogDescription>
        </DialogHeader>

        {load.state === "loading" ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Leyendo el historial…
          </p>
        ) : load.state === "error" ? (
          <div className="grid justify-items-start gap-2 py-6 text-sm" role="alert">
            <p>{load.message}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => { setLoad({ state: "loading" }); setAttempt((value) => value + 1); }}>
              Reintentar
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="actividad" className="gap-3">
            <TabsList>
              <TabsTrigger value="actividad">Actividad ({load.history.events.length})</TabsTrigger>
              <TabsTrigger value="versiones">Versiones ({load.history.versions.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="actividad">
              <EventList events={load.history.events} />
            </TabsContent>
            <TabsContent value="versiones">
              <VersionList history={load.history} valuationId={valuationId} canExport={canExport} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EventList({ events }: { events: HistoryEvent[] }) {
  if (!events.length) return <p className="py-6 text-sm text-muted-foreground">Todavía no hay movimientos registrados.</p>;
  return (
    <ol className="grid max-h-[55vh] gap-0 overflow-y-auto pr-1" aria-label="Actividad del avalúo">
      {events.map((event) => {
        const Icon = KIND_ICONS[event.kind];
        const prominent = PROMINENT.has(event.kind);
        return (
          <li key={event.id} className="grid grid-cols-[auto_1fr] gap-3 border-b py-2.5 last:border-b-0" data-history-kind={event.kind}>
            <span
              aria-hidden="true"
              className={cn("mt-0.5 flex size-7 items-center justify-center rounded-full", prominent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm", prominent && "font-medium")}>
                {event.title}
                {event.version ? <Badge variant="outline" className="ml-2 align-middle font-mono">V{event.version}</Badge> : null}
              </p>
              {event.detail ? <p className="text-sm break-words text-muted-foreground">{event.detail}</p> : null}
              <p className="text-xs text-muted-foreground">
                <time dateTime={event.at}>{formatAt(event.at)}</time>
                {event.actor ? ` · ${event.actor}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function VersionList({ history, valuationId, canExport }: { history: ValuationHistory; valuationId: string; canExport: boolean }) {
  if (!history.versions.length) return <p className="py-6 text-sm text-muted-foreground">El avalúo aún no tiene versiones guardadas.</p>;
  return (
    <ul className="grid max-h-[55vh] gap-3 overflow-y-auto pr-1" aria-label="Versiones del avalúo">
      {history.versions.map((version) => (
        <li key={version.number} className="grid gap-2 rounded-lg border p-3" data-history-version={version.number}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">V{version.number}</span>
            {version.current ? <Badge>Versión actual</Badge> : <Badge variant="outline">Anterior</Badge>}
            {version.concludedAt ? <Badge variant="secondary">Concluida</Badge> : <Badge variant="secondary">En trabajo</Badge>}
          </div>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{version.reopenedAt ? "Reabierta" : "Creada"}</dt>
              <dd>{formatAt(version.reopenedAt ?? version.createdAt)}{version.createdBy ? ` · ${version.createdBy}` : ""}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Concluida</dt>
              <dd>{version.concludedAt ? `${formatAt(version.concludedAt)}${version.concludedBy ? ` · ${version.concludedBy}` : ""}` : "Todavía no"}</dd>
            </div>
            {version.reopenReason ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Motivo de la reapertura</dt>
                <dd className="break-words">{version.reopenReason}</dd>
              </div>
            ) : null}
          </dl>
          {canExport ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={`/avaluos/${valuationId}/dictamen?version=${version.number}`} target="_blank" rel="noopener" />}
              >
                <Eye data-icon="inline-start" />
                Ver en solo lectura
              </Button>
              {version.pdfs.map((pdf) => (
                <Button
                  key={pdf.fileId}
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  title={`${pdf.label}${pdf.by ? ` · generado por ${pdf.by}` : ""}`}
                  render={<a href={`/api/avaluos/${valuationId}/historial/pdf/${pdf.fileId}`} target="_blank" rel="noopener" />}
                >
                  <Download data-icon="inline-start" />
                  PDF {pdf.final ? "final" : "borrador"} · {formatAt(pdf.at)}
                </Button>
              ))}
              {!version.pdfs.length ? <span className="text-xs text-muted-foreground">Sin PDF guardado de esta versión.</span> : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
