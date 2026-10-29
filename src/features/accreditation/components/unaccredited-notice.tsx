"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UNACCREDITED_NOTICE_BODY, UNACCREDITED_NOTICE_TITLE } from "../accreditation-notice";

/**
 * In the editor: the dictamen will print the notice while the issuer is not
 * accredited. The current user is pointed to his own accreditation; someone
 * else is told whose it is.
 */
export function UnaccreditedEditorAlert({ issuerIsCurrentUser }: { issuerIsCurrentUser: boolean }) {
  return (
    <Alert data-unaccredited-editor-alert>
      <TriangleAlert />
      <AlertTitle>El dictamen se imprimirá como «DOCUMENTO SIN VALIDEZ OFICIAL»</AlertTitle>
      <AlertDescription>
        {issuerIsCurrentUser ? (
          <p>
            Mientras no acredites tu cédula profesional, la portada, las consideraciones previas, la conclusión de valor y la
            memoria de cálculo llevan ese aviso; no se puede quitar ni editar.{" "}
            <Link href="/cuenta#acreditacion" className="font-medium underline underline-offset-4">
              Acreditar mi cédula
            </Link>
          </p>
        ) : (
          <p>
            El responsable de este avalúo no ha acreditado su cédula profesional: la portada, las consideraciones previas, la
            conclusión de valor y la memoria de cálculo llevan ese aviso hasta que lo haga desde{" "}
            <Link href="/cuenta#acreditacion" className="font-medium underline underline-offset-4">
              Mi cuenta
            </Link>
            .
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

const UnaccreditedNoticeContext = createContext(false);

/** Whether the document drawn inside prints "DOCUMENTO SIN VALIDEZ OFICIAL". Decided on the server. */
export function UnaccreditedNoticeProvider({ show, children }: { show: boolean; children: ReactNode }) {
  return <UnaccreditedNoticeContext.Provider value={show}>{children}</UnaccreditedNoticeContext.Provider>;
}

export function useUnaccreditedNotice() {
  return useContext(UnaccreditedNoticeContext);
}

/**
 * The notice as the documents print it: bold, black, in a black frame. It is
 * not content of the valuation, so the editor can neither change nor hide it.
 */
export function UnaccreditedNotice({ location }: { location: string }) {
  return (
    <section
      data-unaccredited-notice={location}
      className="my-1 break-inside-avoid border-2 border-black bg-white px-3 py-2 text-justify font-bold text-black [-webkit-print-color-adjust:exact] [print-color-adjust:exact]"
    >
      <p className="text-center text-[12px] leading-tight">{UNACCREDITED_NOTICE_TITLE}</p>
      <p className="mt-1 text-[10.5px] leading-snug">{UNACCREDITED_NOTICE_BODY}</p>
    </section>
  );
}
