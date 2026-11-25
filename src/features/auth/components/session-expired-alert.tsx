import { Alert, AlertDescription } from "@/components/ui/alert";

const messages: Record<string, string> = {
  expired: "Tu sesión expiró. Inicia sesión nuevamente para continuar.",
  required: "Inicia sesión para acceder al sistema.",
  forbidden: "No tienes permisos para acceder a esa ruta.",
  // After «Dar de baja mi cuenta» (docs/CUENTAS.md): not an error, the request was recorded.
  closed: "Registramos la baja de tu cuenta y te enviamos un correo con sus efectos. Tu saldo a favor se conserva; para reactivarla, escríbenos por correo.",
};

export function SessionExpiredAlert({ reason }: { reason?: string }) {
  const message = reason ? messages[reason] : null;
  if (!message) return null;
  return (
    <Alert variant={reason === "closed" ? "default" : "destructive"}>
      <AlertDescription className={reason === "closed" ? "text-foreground" : undefined}>{message}</AlertDescription>
    </Alert>
  );
}
