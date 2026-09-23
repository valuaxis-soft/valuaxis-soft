import { Alert, AlertDescription } from "@/components/ui/alert";

const messages: Record<string, string> = {
  expired: "Tu sesión expiró. Inicia sesión nuevamente para continuar.",
  required: "Inicia sesión para acceder al sistema.",
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
