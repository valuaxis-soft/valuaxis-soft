"use client";

import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { api, SessionExpiredError } from "@/lib/api-client";

type ClosureEffect = { title: string; text: string };

/**
 * «Dar de baja mi cuenta»: the effects first, then the confirmation (matrix
 * 1.11). Confirming records the request and ends the session; the email route
 * is offered next to it.
 */
export function AccountClosureButton({ supportEmail, effects }: { supportEmail: string; effects: readonly ClosureEffect[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await api.accountClosure.request();
      window.location.assign("/iniciar-sesion?reason=closed");
    } catch (error) {
      setBusy(false);
      toast.error(
        error instanceof SessionExpiredError
          ? "Tu sesión expiró. Vuelve a iniciar sesión."
          : error instanceof Error ? error.message : "No se pudo registrar la baja.",
      );
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="destructive" onClick={() => setOpen(true)} data-account-closure-open="">
          Dar de baja mi cuenta
        </Button>
        <p className="text-sm text-muted-foreground">
          También puedes pedirla por correo a{" "}
          <a className="font-medium text-foreground underline underline-offset-4" href={`mailto:${supportEmail}?subject=Baja%20de%20mi%20cuenta`}>
            {supportEmail}
          </a>
          .
        </p>
      </div>
      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent className="sm:max-w-lg" data-account-closure-dialog="">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Dar de baja tu cuenta?</AlertDialogTitle>
            <AlertDialogDescription>Esto es lo que pasa al confirmar. Al terminar se cierra tu sesión.</AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="grid gap-3 text-sm">
            {effects.map((effect) => (
              <div key={effect.title} className="grid gap-0.5">
                <dt className="font-medium text-foreground">{effect.title}</dt>
                <dd className="text-muted-foreground">{effect.text}</dd>
              </div>
            ))}
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Conservar mi cuenta</AlertDialogCancel>
            <AlertDialogAction type="button" variant="destructive" disabled={busy} onClick={() => void confirm()}>
              {busy ? "Registrando la baja…" : "Sí, dar de baja"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
