import { formatLegalDate, legalDocumentHref } from "../legal-documents";
import type { LegalVersionLink } from "../consent.service";
import { LegalText } from "./legal-text";

/**
 * Part I of the simplified privacy notice, in full, above the boxes and the
 * button (matrix 1.1 and 2.1: shown on the same screen, not only linked), with
 * its version and the link to the integral notice in force.
 */
export function SimplifiedNoticePanel({ text, link, integral }: { text: string; link: LegalVersionLink; integral?: LegalVersionLink }) {
  return (
    <section aria-labelledby="aviso-simplificado" data-simplified-notice="" data-version={link.version} className="grid gap-2 rounded-lg border bg-muted/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="aviso-simplificado" className="text-sm font-semibold text-primary">
          Aviso de privacidad simplificado
        </h2>
        <p className="text-xs text-muted-foreground tabular-nums">
          Versión {link.version} · {formatLegalDate(new Date(`${link.updatedOn}T00:00:00Z`))}
          {link.published ? null : " · borrador"}
        </p>
      </div>
      <div tabIndex={0} aria-label="Texto del aviso de privacidad simplificado" className="max-h-72 overflow-y-auto rounded-md border bg-card p-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <LegalText text={text} compact />
      </div>
      <a
        href={legalDocumentHref("privacidad-integral", integral?.version)}
        target="_blank"
        rel="noopener"
        className="w-fit text-sm font-medium text-brand underline underline-offset-2"
      >
        Leer el aviso de privacidad integral{integral ? ` (versión ${integral.version}${integral.published ? "" : ", borrador"})` : ""}
      </a>
    </section>
  );
}
