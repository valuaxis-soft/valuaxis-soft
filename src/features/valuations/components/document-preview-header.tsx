"use client";

import type { CaratulaFormData, ImageContent, Letterhead } from "../model";
import { usePagePresentation } from "./page-presentation-context";
import { appraisedGoodWording } from "../services/appraised-good-wording";
import { normalizeHeaderExtraFields } from "../services/caratula-company-header";
import { formatDateValue } from "../services/concept-value-format";
import { validUntilDate } from "../services/valuation-signatures";

/**
 * The date the validity ends, alone: the months are a form input, not printed.
 * A valuation saved before the validity was in months prints its stored date.
 */
function validityText(caratula: CaratulaFormData) {
  if (caratula.mesesVigencia === null) return formatDateValue(caratula.fechaVigencia, "normal");
  return formatDateValue(validUntilDate(caratula.fechaAvaluo, caratula.mesesVigencia) ?? "", "normal");
}

/**
 * The header of every document page. The valuation's own carátula data and
 * header image come first; the firm's letterhead fills whatever they leave empty.
 * The name printed is the firm's legal name; the organization name stands in
 * only while the firm has none.
 */
export function DocumentPreviewHeader({
  caratula,
  letterhead,
  headerImage,
  propertyKind,
}: {
  caratula: CaratulaFormData;
  letterhead: Letterhead;
  headerImage?: ImageContent | null;
  /** The valuation's property type: the title band names what is appraised. */
  propertyKind?: string | null;
}) {
  const image = headerImage?.src
    ? headerImage
    : letterhead.logoUrl
      ? { src: letterhead.logoUrl, title: `Logotipo de ${letterhead.legalName?.trim() || letterhead.name}` }
      : null;
  const address = caratula.direccionEmpresa || letterhead.address;
  const phone = caratula.telefonoEmpresa || letterhead.phone;
  const email = caratula.correoEmpresa || letterhead.email;
  const extraFields = normalizeHeaderExtraFields(caratula.camposEncabezado);
  const firmName = letterhead.legalName?.trim() || letterhead.name;
  const rfcLine = letterhead.rfc ? `RFC ${letterhead.rfc}` : "";
  const { titleBand } = usePagePresentation();

  return (
    <header className="px-5 pt-5 sm:px-8 sm:pt-7" data-document-preview-header>
      <div className="grid gap-3 sm:grid-cols-[190px_minmax(0,1fr)]">
        <div className={`flex h-24 items-center justify-center  text-3xl font-black tracking-tight shadow-sm ${image?.src ? "bg-white text-[var(--caratula-blue)]" : "bg-gradient-to-br from-[var(--caratula-blue)] to-[var(--caratula-dark-blue)] text-white"}`}>
          {image?.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="max-h-full max-w-full object-contain"
              src={image.src}
              alt={image.title || "Imagen del encabezado"}
            />
          ) : (
            "VA"
          )}
        </div>
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-sm font-black tracking-wide text-[var(--caratula-blue)]">
            {firmName || "Empresa valuadora pendiente"}
          </p>
          {rfcLine ? <p className="text-[10px] leading-tight text-slate-600">{rfcLine}</p> : null}
          <p className="mt-0.5 text-[11px] leading-tight text-slate-700">
            {address || "Dirección pendiente"}
          </p>
          <div className="mt-0.5 flex flex-wrap justify-center gap-x-4 text-[11px] leading-tight text-slate-700 sm:justify-start">
            <span>{phone || "Teléfono pendiente"}</span>
            <span>{email || "Correo pendiente"}</span>
          </div>
          {extraFields.length ? (
            <div className="mt-0.5 flex flex-wrap justify-center gap-x-4 text-[11px] leading-tight text-slate-700 sm:justify-start" data-header-extra-fields>
              {extraFields.map((field, index) => (
                <span key={index}>
                  {field.label ? <strong>{field.label}:</strong> : null} {field.value}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-4 grid items-end gap-2 text-[11px] leading-tight sm:grid-cols-[minmax(0,1fr)_230px]">
            <div>
              <p><strong>Fecha del Avalúo:</strong> {formatDateValue(caratula.fechaAvaluo, "normal")}</p>
              <p className="mt-0.5"><strong>Vigencia del Avalúo:</strong> {validityText(caratula)}</p>
            </div>
            <div className="flex items-center gap-2">
              <strong className="shrink-0 text-slate-700">
                Folio:
              </strong>

              <p className="min-w-0 flex-1 break-words border-2 border-[var(--caratula-blue)] bg-white px-2 py-0.5 text-center text-xs font-black leading-none text-[var(--caratula-blue)]">
                {caratula.folio || caratula.numeroAvaluo || "Pendiente"}
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* Unfilled, a blue line sets the header apart from the body and the title is blue on white, close to
          the title that follows it. Filled, the blue band is framed by a thin line, as in the appraiser's format. */}
      {titleBand === "outline" ? (
        <div
          className="mt-1 -mb-2 border-t-[3px] border-[var(--caratula-dark-blue)] bg-white px-5 pt-px pb-0 text-center text-base font-black leading-tight text-[var(--caratula-dark-blue)]"
          data-title-band={titleBand}
        >
          {appraisedGoodWording(propertyKind).documentTitle}
        </div>
      ) : (
        <div className="mt-1 border-2 border-[var(--caratula-dark-blue)] bg-white p-[2px]" data-title-band-frame="">
          <div
            className="bg-[var(--caratula-dark-blue)] px-5 py-0.5 text-center text-base font-black leading-tight text-white [-webkit-print-color-adjust:exact] [print-color-adjust:exact]"
            data-title-band={titleBand}
          >
            {appraisedGoodWording(propertyKind).documentTitle}
          </div>
        </div>
      )}
    </header>
  );
}
