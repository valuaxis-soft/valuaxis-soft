import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { LegalVersion } from "../legal-document.repository";
import { formatLegalDate, hasLegalBlanks, legalDocumentHref } from "../legal-documents";
import { LegalText } from "./legal-text";

/**
 * One version of a legal document (matrix rule 3 and 3.1): its number and
 * update date in sight, the text exactly as stored with its SHA-256, and the
 * earlier published versions, which stay available (Terms 15.2).
 */
export function LegalDocumentView({ version, history }: { version: LegalVersion; history: readonly LegalVersion[] }) {
  const latest = history[0];
  const isOld = version.published && latest && latest.version > version.version;
  return (
    <article className="grid gap-6" data-legal-document={version.documento} data-version={version.version} data-published={version.published}>
      <header className="grid gap-2">
        <p className="text-sm font-medium text-muted-foreground">Valuaxis Soft · Documentos legales</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-primary text-balance sm:text-4xl">{version.title}</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          Versión {version.version} · Fecha de actualización: {formatLegalDate(version.updatedOn)}
          {version.published ? null : " · Borrador"}
        </p>
      </header>

      {!version.published ? (
        <Alert data-legal-draft="">
          <AlertTitle>Borrador pendiente de publicación</AlertTitle>
          <AlertDescription>
            Este texto todavía no está publicado: es la versión que se publicará cuando el Proveedor la libere.
            {hasLegalBlanks(version.text) ? " Los datos marcados («______») están por llenar." : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {isOld ? (
        <Alert>
          <AlertTitle>Versión anterior</AlertTitle>
          <AlertDescription>
            La versión vigente es la {latest.version}.{" "}
            <Link href={legalDocumentHref(version.documento)} className="font-medium text-brand underline underline-offset-2">
              Ver la versión vigente
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <LegalText text={version.text} />

      <footer className="grid gap-3 border-t pt-5 text-sm text-muted-foreground">
        <p className="break-all">
          Huella SHA-256 del texto: <code className="font-mono text-xs tabular-nums">{version.hash}</code>
        </p>
        {history.length ? (
          <div className="grid gap-1">
            <p className="font-medium text-foreground">Versiones publicadas</p>
            <ul className="grid gap-1">
              {history.map((item) => (
                <li key={item.id}>
                  <Link href={legalDocumentHref(item.documento, item.version)} className="text-brand underline underline-offset-2">
                    Versión {item.version}
                  </Link>{" "}
                  · {formatLegalDate(item.updatedOn)}
                  {item.version === latest?.version ? " (vigente)" : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </footer>
    </article>
  );
}
