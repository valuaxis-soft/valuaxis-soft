import type { CaratulaFormData, ImageContent, Letterhead } from "../model";
import { formatDateValue } from "../services/concept-value-format";
import { formatValidityMonths, validUntilDate } from "../services/valuation-signatures";

/** "6 meses (hasta 28 de Marzo de 2027)"; the stored date for a valuation saved before the validity was in months. */
function validityText(caratula: CaratulaFormData) {
  if (caratula.mesesVigencia === null) return formatDateValue(caratula.fechaVigencia, "normal");
  const until = validUntilDate(caratula.fechaAvaluo, caratula.mesesVigencia);
  const months = formatValidityMonths(caratula.mesesVigencia);
  return until ? `${months} (hasta ${formatDateValue(until, "normal")})` : months;
}

/**
 * The header of every document page. The valuation's own carátula data and
 * header image come first; the firm's letterhead fills whatever they leave empty.
 */
export function DocumentPreviewHeader({
  caratula,
  letterhead,
  headerImage,
}: {
  caratula: CaratulaFormData;
  letterhead: Letterhead;
  headerImage?: ImageContent | null;
}) {
  const image = headerImage?.src
    ? headerImage
    : letterhead.logoUrl
      ? { src: letterhead.logoUrl, title: `Logotipo de ${letterhead.name}` }
      : null;
  const address = caratula.direccionEmpresa || letterhead.address;
  const phone = caratula.telefonoEmpresa || letterhead.phone;
  const email = caratula.correoEmpresa || letterhead.email;
  const legalLine = [letterhead.legalName, letterhead.rfc ? `RFC ${letterhead.rfc}` : null].filter(Boolean).join(" · ");

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
            {letterhead.name || "Empresa valuadora pendiente"}
          </p>
          {legalLine ? <p className="text-[10px] leading-tight text-slate-600">{legalLine}</p> : null}
          <p className="mt-0.5 text-[11px] leading-tight text-slate-700">
            {address || "Dirección pendiente"}
          </p>
          <div className="mt-0.5 flex flex-wrap justify-center gap-x-4 text-[11px] leading-tight text-slate-700 sm:justify-start">
            <span>{phone || "Teléfono pendiente"}</span>
            <span>{email || "Correo pendiente"}</span>
          </div>
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
      <div className="mt-1 bg-[var(--caratula-dark-blue)] px-5 py-0.5 text-center text-base font-black leading-tight text-white">
        DICTAMEN VALUATORIO
      </div>
    </header>
  );
}
