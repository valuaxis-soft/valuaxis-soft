import { Alert, AlertDescription } from "@/components/ui/alert";

const messages: Record<string, string> = {
  expired: "Tu sesion expiro. Inicia sesion nuevamente para continuar.",
  required: "Inicia sesion para acceder al sistema.",
  forbidden: "No tienes permisos para acceder a esa ruta.",
};

export function SessionExpiredAlert({ reason }: { reason?: string }) {
  const message = reason ? messages[reason] : null;
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
