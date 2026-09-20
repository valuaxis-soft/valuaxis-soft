"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GoogleAuthButton() {
  const [pending, setPending] = useState(false);

  function handleGoogleAuth() {
    setPending(true);
    window.location.assign("/api/auth/google");
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
      onClick={handleGoogleAuth}
    >
      <KeyRound className="size-4" />
      {pending ? "Conectando..." : "Continuar con Google"}
    </Button>
  );
}
