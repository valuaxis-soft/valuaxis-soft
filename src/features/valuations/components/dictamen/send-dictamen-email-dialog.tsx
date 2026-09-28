"use client";

import { Loader2, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { defaultDictamenMessage, defaultDictamenSubject } from "@/features/notifications/templates/dictamen-email";

const splitEmails = (value: string) => value.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean);

/** Sends the dictamen PDF to the client by email, in the firm's name. */
export function SendDictamenEmailDialog({ valuationId, folio, firmName }: { valuationId: string; folio: string; firmName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(() => defaultDictamenSubject(folio, firmName));
  const [message, setMessage] = useState(() => defaultDictamenMessage(firmName));

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch(`/api/avaluos/${valuationId}/dictamen/correo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: splitEmails(to), subject, message }),
      });
      const body = await response.json().catch(() => null) as { data?: { to: string[] }; error?: string; fields?: Array<{ message: string }> } | null;
      if (!response.ok) {
        throw new Error(response.status === 401
          ? "Tu sesión expiró. Vuelve a iniciar sesión."
          : body?.fields?.[0]?.message ?? body?.error ?? "No se pudo enviar el dictamen.");
      }
      toast.success(`Dictamen enviado a ${(body?.data?.to ?? splitEmails(to)).join(", ")}.`);
      setOpen(false);
      setTo("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar el dictamen.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Mail data-icon="inline-start" />
        Enviar por correo
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={send} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Enviar el dictamen por correo</DialogTitle>
              <DialogDescription>
                Se genera el PDF y se envía adjunto a nombre de {firmName}. Las respuestas llegan al correo de Datos del despacho.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="dictamen-email-to">Para</FieldLabel>
              <Input
                id="dictamen-email-to"
                type="text"
                inputMode="email"
                autoComplete="off"
                placeholder="cliente@correo.com"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
              <FieldDescription>Hasta 5 correos, separados por coma.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="dictamen-email-subject">Asunto</FieldLabel>
              <Input id="dictamen-email-subject" maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dictamen-email-message">Mensaje</FieldLabel>
              <Textarea id="dictamen-email-message" rows={7} maxLength={5000} value={message} onChange={(event) => setMessage(event.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={pending || splitEmails(to).length === 0}>
                {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Mail data-icon="inline-start" />}
                {pending ? "Generando y enviando…" : "Enviar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
