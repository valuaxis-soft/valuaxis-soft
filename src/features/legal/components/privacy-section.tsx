"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, SessionExpiredError } from "@/lib/api-client";
import { CONSENT_EVENT_LABELS, OPTIONAL_CONSENT_BOX, OPTIONAL_CONSENT_KEYS, type OptionalConsentKey, type OptionalConsents } from "../consent-rules";
import type { PrivacyHistoryEntry } from "../consent.service";
import { LEGAL_DOCUMENT_TITLES, isLegalDocumentKey, legalDocumentHref } from "../legal-documents";
import { COOKIE_INVENTORY } from "../privacy-facts";

/**
 * «Privacidad» in «Mi cuenta» (matrix 1.10): casillas 2 to 4, changed at once
 * and logged; every acceptance with its date and the versions, each one a link;
 * the ARCO contact and the cookies the platform sets.
 */
export function PrivacySection({
  initial,
  boxTexts,
  history,
  arcoEmail,
}: {
  initial: OptionalConsents;
  boxTexts: Record<1 | 2 | 3 | 4, string>;
  history: PrivacyHistoryEntry[];
  arcoEmail: string | null;
}) {
  const [consents, setConsents] = useState(initial);
  const [busy, setBusy] = useState<OptionalConsentKey | null>(null);

  const change = async (key: OptionalConsentKey, on: boolean) => {
    const previous = consents;
    setConsents({ ...consents, [key]: on });
    setBusy(key);
    try {
      setConsents(await api.consents.update({ [key]: on }));
      toast.success(on ? "Autorización registrada." : "Autorización retirada desde este momento.");
    } catch (error) {
      setConsents(previous);
      toast.error(error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card id="privacidad" className="scroll-mt-24" data-privacy-section="">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" aria-hidden="true" />
          Privacidad
        </CardTitle>
        <CardDescription>Tus autorizaciones, los documentos que aceptaste y cómo ejercer tus derechos sobre tus datos.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <section className="grid gap-2" aria-labelledby="privacidad-autorizaciones">
          <h3 id="privacidad-autorizaciones" className="text-sm font-semibold">Autorizaciones opcionales</h3>
          <p className="text-sm text-muted-foreground">Puedes darlas o retirarlas cuando quieras; el cambio aplica desde ese momento y no afecta tu acceso a la plataforma.</p>
          {OPTIONAL_CONSENT_KEYS.map((key) => (
            <div key={key} className="flex items-start gap-3 rounded-lg px-1 py-2" data-optional-consent={key}>
              <Checkbox
                id={`privacidad-${key}`}
                checked={consents[key]}
                disabled={busy === key}
                onCheckedChange={(checked) => void change(key, checked === true)}
                className="mt-0.5"
              />
              <Label htmlFor={`privacidad-${key}`} className="block text-sm leading-snug font-normal">
                {boxTexts[OPTIONAL_CONSENT_BOX[key]]}
              </Label>
            </div>
          ))}
        </section>

        <section className="grid gap-2" aria-labelledby="privacidad-documentos">
          <h3 id="privacidad-documentos" className="text-sm font-semibold">Documentos aceptados y cambios</h3>
          {history.length ? (
            <ol className="grid gap-3" data-consent-history="">
              {history.map((entry) => (
                <li key={entry.id} className="grid gap-1 rounded-lg border p-3 text-sm">
                  <p className="font-medium">
                    {CONSENT_EVENT_LABELS[entry.event] ?? entry.event}{" "}
                    <span className="font-normal text-muted-foreground tabular-nums">· {entry.atLabel} (hora del centro de México)</span>
                  </p>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {entry.documents.map((document) =>
                      isLegalDocumentKey(document.documento) ? (
                        <li key={`${document.documento}-${document.version}`}>
                          <a href={legalDocumentHref(document.documento, document.version)} target="_blank" rel="noopener" className="text-brand underline underline-offset-2">
                            {LEGAL_DOCUMENT_TITLES[document.documento]}
                          </a>{" "}
                          <span className="text-muted-foreground tabular-nums">
                            v{document.version}
                            {document.publicable ? "" : " (borrador)"}
                          </span>
                        </li>
                      ) : null,
                    )}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no hay aceptaciones registradas en tu cuenta.</p>
          )}
        </section>

        <section className="grid gap-1" aria-labelledby="privacidad-arco">
          <h3 id="privacidad-arco" className="text-sm font-semibold">Derechos ARCO y revocación</h3>
          <p className="text-sm text-muted-foreground" data-arco-contact="">
            Para acceder a tus datos, rectificarlos, cancelarlos, oponerte a su tratamiento o revocar tu consentimiento, escribe al correo para privacidad y
            derechos ARCO:{" "}
            {arcoEmail ? (
              <a href={`mailto:${arcoEmail}`} className="font-medium text-brand underline underline-offset-2">
                {arcoEmail}
              </a>
            ) : (
              <span className="font-medium text-foreground">se publicará con el aviso de privacidad</span>
            )}
            . El procedimiento está en el{" "}
            <a href={legalDocumentHref("privacidad-integral")} target="_blank" rel="noopener" className="text-brand underline underline-offset-2">
              aviso de privacidad integral
            </a>
            , sección 7.
          </p>
        </section>

        <section className="grid gap-2" aria-labelledby="privacidad-cookies">
          <h3 id="privacidad-cookies" className="text-sm font-semibold">Cookies</h3>
          <p className="text-sm text-muted-foreground">Solo usamos cookies técnicas, propias, para iniciar y mantener tu sesión. No usamos cookies de analítica ni de publicidad.</p>
          <Table data-cookie-inventory="">
            <TableHeader>
              <TableRow>
                <TableHead>Cookie</TableHead>
                <TableHead>Para qué</TableHead>
                <TableHead>Duración</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COOKIE_INVENTORY.map((cookie) => (
                <TableRow key={cookie.name}>
                  <TableCell className="font-mono text-xs">{cookie.name}</TableCell>
                  <TableCell className="whitespace-normal">{cookie.purpose}</TableCell>
                  <TableCell className="whitespace-normal">{cookie.duration}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </CardContent>
    </Card>
  );
}
