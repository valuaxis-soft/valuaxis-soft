"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError, SessionExpiredError } from "@/lib/api-client";
import { ConsentCheckboxes, EMPTY_CONSENT_BOXES, requiredBoxesTicked, type ConsentLinks } from "./consent-checkboxes";

/**
 * /aceptar-documentos (matrix 1.2): casillas 1 and T, unticked, and the age
 * declaration when the account never made it. Accepting records the versions
 * shown and opens the page the person was going to.
 */
export function LegalAcceptanceForm({
  boxTexts,
  links,
  versionIds,
  askAdult,
  redirectTo,
}: {
  boxTexts: Record<1 | 2 | 3 | 4, string>;
  links: ConsentLinks;
  versionIds: number[];
  askAdult: boolean;
  redirectTo: string;
}) {
  const [boxes, setBoxes] = useState(EMPTY_CONSENT_BOXES);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAccept = requiredBoxesTicked(boxes, askAdult);

  const accept = async () => {
    setPending(true);
    setError(null);
    try {
      await api.consents.accept({ privacidad: true, terminos: true, mayorDeEdad: askAdult ? boxes.adult : undefined, versionIds });
      window.location.assign(redirectTo);
    } catch (caught) {
      setPending(false);
      if (caught instanceof SessionExpiredError) setError("Tu sesión expiró. Vuelve a iniciar sesión.");
      else setError(caught instanceof ApiError || caught instanceof Error ? caught.message : "No se pudo registrar tu aceptación.");
    }
  };

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (canAccept && !pending) void accept();
      }}
      data-legal-acceptance=""
    >
      <ConsentCheckboxes boxTexts={boxTexts} links={links} state={boxes} onChange={setBoxes} disabled={pending} showAdult={askAdult} showOptional={false} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid gap-2">
        <Button type="submit" disabled={!canAccept || pending} className="w-full sm:w-fit">
          {pending ? <Spinner className="size-4" /> : null}
          Aceptar y continuar
        </Button>
        {!canAccept ? (
          <FieldDescription className="text-xs">
            {askAdult ? "Para continuar, declara que eres mayor de edad y marca" : "Para continuar, marca"} la casilla del aviso de privacidad y la de los términos.
          </FieldDescription>
        ) : null}
      </div>
    </form>
  );
}
