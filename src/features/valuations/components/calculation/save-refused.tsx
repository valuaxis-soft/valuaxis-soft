import { SessionExpiredError } from "@/lib/api-client";

/**
 * Why a panel's save did not go through, as the appraiser reads it. The path
 * of the field in the payload («cost.item.freight») says nothing to them: the
 * reason alone does.
 */
export function saveRefusedMessage(error: unknown, fallback: string) {
  if (error instanceof SessionExpiredError) return "Tu sesión expiró. Vuelve a iniciar sesión.";
  if (!(error instanceof Error)) return fallback;
  return error.message.replace(/\((?:[\w[\]]+\.)*[\w[\]]+: /, "(");
}

/**
 * These panels save their whole capture at once: while one value is refused,
 * nothing typed after it is stored either. The toast goes away; this stays
 * until a save goes through, so nobody keeps typing into a capture that is
 * not being saved.
 */
export function SaveRefusedNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-save-refused="">
      <strong>Este cálculo no se está guardando.</strong> {message} Corrige el dato: mientras tanto, lo que escribas aquí no se guarda.
    </p>
  );
}
