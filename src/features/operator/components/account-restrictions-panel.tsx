"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  SUSPENSION_CAUSE_LABELS,
  causeMayBlockAccess,
  type SuspensionCause,
} from "@/features/account/standing/account-standing-rules";
import type { AccountRestrictionEntry } from "@/features/account/standing/account-standing.service";
import { api } from "@/lib/api-client";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });
const when = (iso: string | null) => (iso ? dateFormatter.format(new Date(iso)) : "—");

const END_LABELS: Record<string, string> = {
  REACTIVACION: "reactivada",
  ACLARADA: "aclarada",
  ACTIVIDAD: "volvió a crear avalúos",
};

function kindLabel(entry: AccountRestrictionEntry) {
  if (entry.kind === "BAJA") return entry.origin === "CORREO" ? "Baja (por correo)" : "Baja";
  if (entry.kind === "INACTIVIDAD") return "Inactividad";
  return entry.cause ? SUSPENSION_CAUSE_LABELS[entry.cause] : "Otra causa";
}

function statusOf(entry: AccountRestrictionEntry): { label: string; tone: "default" | "secondary" | "destructive" | "outline" } {
  if (entry.endedAt) return { label: `Terminada: ${END_LABELS[entry.endReason ?? ""] ?? "cerrada"}`, tone: "outline" };
  if (entry.startedAt) {
    if (entry.kind === "BAJA") return { label: "Baja vigente", tone: "destructive" };
    if (entry.kind === "INACTIVIDAD") return { label: "Inhabilitada", tone: "destructive" };
    return { label: entry.blocksAccess ? "Suspendida, sin acceso" : "Suspendida", tone: "destructive" };
  }
  if (entry.kind === "INACTIVIDAD") return { label: "Aviso de inactividad enviado", tone: "secondary" };
  const open = !entry.deadlinePassed;
  return { label: open ? "Aviso enviado; corre el plazo" : "Plazo vencido; por aplicar", tone: "secondary" };
}

/**
 * The operator's closures and suspensions (docs/CUENTAS.md): record a closure
 * asked for by email, notice a suspension with its cause, apply it after the
 * five business days, write down the answer, and reactivate or lift.
 */
export function AccountRestrictionsPanel({ entries }: { entries: AccountRestrictionEntry[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [closureEmail, setClosureEmail] = useState("");
  const [notice, setNotice] = useState({ email: "", cause: "PRESTAMO" as SuspensionCause, detail: "", urgent: false, blockAccess: false });
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  const act = async (key: string, input: Record<string, unknown>, done: string) => {
    setBusy(key);
    try {
      await api.operatorAccounts.act(input);
      toast.success(done);
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo completar la acción.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const submitClosure = async (event: FormEvent) => {
    event.preventDefault();
    if (await act("closure", { action: "baja-por-correo", email: closureEmail }, "Baja registrada; se envió el correo con sus efectos.")) setClosureEmail("");
  };

  const submitNotice = async (event: FormEvent) => {
    event.preventDefault();
    const sent = await act(
      "notice",
      { action: "aviso", ...notice, blockAccess: notice.blockAccess && causeMayBlockAccess(notice.cause) },
      notice.urgent ? "Cuenta suspendida; se envió el aviso con la causa." : "Aviso enviado con la causa y el plazo de cinco días hábiles.",
    );
    if (sent) setNotice({ email: "", cause: "PRESTAMO", detail: "", urgent: false, blockAccess: false });
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={submitClosure} className="grid content-start gap-3 rounded-2xl border border-border bg-card p-4" data-closure-by-email="">
          <h2 className="font-medium">Baja pedida por correo</h2>
          <p className="text-sm text-muted-foreground">
            La persona escribió para darse de baja (Términos, sección 14.2). Se registra igual que con el botón: fecha y hora, acceso bloqueado y
            correo con los efectos. El saldo no cambia.
          </p>
          <label className="grid gap-1.5 text-sm font-medium">
            Correo de la cuenta
            <Input type="email" required autoComplete="off" value={closureEmail} onChange={(event) => setClosureEmail(event.target.value)} />
          </label>
          <Button type="submit" variant="destructive" disabled={busy !== null} className="justify-self-start">
            Registrar la baja
          </Button>
        </form>

        <form onSubmit={submitNotice} className="grid content-start gap-3 rounded-2xl border border-border bg-card p-4" data-suspension-notice="">
          <h2 className="font-medium">Aviso de suspensión</h2>
          <p className="text-sm text-muted-foreground">
            Se manda el aviso con la causa y cinco días hábiles para aclarar (Términos, sección 14.1). En casos urgentes de seguridad o uso ilícito,
            la suspensión empieza al avisar. Nunca extingue el saldo ni impide consultar y descargar los avalúos concluidos.
          </p>
          <label className="grid gap-1.5 text-sm font-medium">
            Correo de la cuenta
            <Input type="email" required autoComplete="off" value={notice.email} onChange={(event) => setNotice({ ...notice, email: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Causa
            <NativeSelect
              value={notice.cause}
              onChange={(event) => setNotice({ ...notice, cause: event.target.value as SuspensionCause })}
              className="w-full"
            >
              {(Object.keys(SUSPENSION_CAUSE_LABELS) as SuspensionCause[]).map((cause) => (
                <NativeSelectOption key={cause} value={cause}>
                  {SUSPENSION_CAUSE_LABELS[cause]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Detalle que se le comunica
            <Textarea maxLength={2000} rows={3} value={notice.detail} onChange={(event) => setNotice({ ...notice, detail: event.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notice.urgent} onChange={(event) => setNotice({ ...notice, urgent: event.target.checked })} />
            Urgente: suspender desde ahora
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!causeMayBlockAccess(notice.cause)}
              checked={notice.blockAccess && causeMayBlockAccess(notice.cause)}
              onChange={(event) => setNotice({ ...notice, blockAccess: event.target.checked })}
            />
            Bloquear el acceso mientras se verifica la identidad (solo suplantación)
          </label>
          <Button type="submit" disabled={busy !== null} className="justify-self-start">
            {notice.urgent ? "Suspender y avisar" : "Enviar el aviso"}
          </Button>
        </form>
      </div>

      <section aria-label="Bajas y suspensiones" className="grid gap-3 rounded-2xl border border-border bg-card p-3 sm:p-5">
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Todavía no hay bajas, avisos ni suspensiones.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Solicitud o aviso</TableHead>
                <TableHead>Límite para aclarar</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead>Respuesta</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const status = statusOf(entry);
                const { deadlinePassed } = entry;
                return (
                  <TableRow key={entry.id} data-restriction={entry.kind}>
                    <TableCell>
                      <div className="font-medium">{entry.person.name}</div>
                      <div className="text-xs text-muted-foreground">{entry.person.email}</div>
                    </TableCell>
                    <TableCell>
                      <div>{kindLabel(entry)}</div>
                      {entry.detail ? <div className="max-w-56 text-xs text-muted-foreground">{entry.detail}</div> : null}
                      {entry.urgent ? <div className="text-xs text-muted-foreground">Urgente</div> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.tone}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{when(entry.noticedAt ?? entry.requestedAt)}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{when(entry.deadline)}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{when(entry.startedAt)}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{when(entry.endedAt)}</TableCell>
                    <TableCell className="max-w-64 text-xs">
                      {entry.response ? (
                        <>
                          <div>{entry.response}</div>
                          <div className="text-muted-foreground">{when(entry.respondedAt)}</div>
                        </>
                      ) : answering === entry.id ? (
                        <div className="grid gap-2">
                          <Textarea rows={3} maxLength={2000} value={answer} onChange={(event) => setAnswer(event.target.value)} aria-label="Respuesta de la persona" />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy !== null || !answer.trim()}
                              onClick={async () => {
                                if (await act(entry.id, { action: "respuesta", id: entry.id, response: answer }, "Respuesta registrada.")) {
                                  setAnswering(null);
                                  setAnswer("");
                                }
                              }}
                            >
                              Guardar
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setAnswering(null)}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.endedAt ? null : (
                        <div className="flex flex-wrap justify-end gap-2">
                          {entry.kind === "OTRA" && !entry.startedAt ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={busy !== null || !deadlinePassed}
                              title={deadlinePassed ? undefined : "Todavía corre el plazo para aclarar"}
                              onClick={() => void act(entry.id, { action: "aplicar", id: entry.id }, "Suspensión aplicada; se avisó por correo.")}
                            >
                              Aplicar suspensión
                            </Button>
                          ) : null}
                          {entry.kind === "OTRA" && !entry.response && answering !== entry.id ? (
                            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => { setAnswering(entry.id); setAnswer(""); }}>
                              Registrar respuesta
                            </Button>
                          ) : null}
                          {entry.kind === "OTRA" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={() => void act(entry.id, { action: "levantar", id: entry.id }, entry.startedAt ? "Suspensión levantada; se avisó por correo." : "Aviso retirado.")}
                            >
                              {entry.startedAt ? "Levantar" : "Retirar aviso"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy !== null}
                              data-reactivate=""
                              onClick={() => void act(entry.id, { action: "reactivar", id: entry.id }, "Cuenta reactivada con su saldo intacto; se avisó por correo.")}
                            >
                              Reactivar
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
