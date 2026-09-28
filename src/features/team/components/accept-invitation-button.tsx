"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, SessionExpiredError } from "@/lib/api-client";

/** Accepts an invitation, opens that team and goes to the dashboard. */
export function AcceptInvitationButton({
  selector,
  alreadyAccepted = false,
  size,
}: {
  selector: { token: string } | { id: string };
  alreadyAccepted?: boolean;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const accept = async () => {
    setPending(true);
    try {
      const result = await api.invitations.accept(selector);
      toast.success(`Ya formas parte de ${result.organizationName}.`);
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof SessionExpiredError
        ? "Tu sesión expiró. Vuelve a iniciar sesión."
        : error instanceof Error ? error.message : "No se pudo aceptar la invitación.");
      setPending(false);
    }
  };

  return (
    <Button type="button" size={size} onClick={() => void accept()} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {alreadyAccepted ? "Abrir el equipo" : "Aceptar invitación"}
    </Button>
  );
}
