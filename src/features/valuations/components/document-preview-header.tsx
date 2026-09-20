//Codigo para la edicion de el previw revisar mas a fondo.
import type { CaratulaFormData, ImageContent } from "../model";
import { formatDateValue } from "../services/concept-value-format";

export function DocumentPreviewHeader({
  caratula,
  companyName,
  headerImage,
}: {
  caratula: CaratulaFormData;
  companyName: string;
  headerImage?: ImageContent | null;
}) {
  return (
    <header className="px-5 pt-5 sm:px-8 sm:pt-7" data-document-preview-header>
      <div className="grid gap-3 sm:grid-cols-[190px_minmax(0,1fr)]">
        <div className={`flex h-24 items-center justify-center  text-3xl font-black tracking-tight shadow-sm ${headerImage?.src ? "bg-white text-[var(--caratula-blue)]" : "bg-gradient-to-br from-[var(--caratula-blue)] to-[var(--caratula-dark-blue)] text-white"}`}>
          {headerImage?.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="max-h-full max-w-full object-contain"
              src={headerImage.src}
              alt={headerImage.title || "Imagen del encabezado"}
            />
          ) : (
            "VA"
          )}
        </div>
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-sm font-black tracking-wide text-[var(--caratula-blue)]">
            {companyName || "Empresa valuadora pendiente"}
          </p>
          <p className="mt-0.5 text-[11px] leading-tight text-slate-700">
            {caratula.direccionEmpresa || "Dirección pendiente"}
          </p>
          <div className="mt-0.5 flex flex-wrap justify-center gap-x-4 text-[11px] leading-tight text-slate-700 sm:justify-start">
            <span>{caratula.telefonoEmpresa || "Teléfono pendiente"}</span>
            <span>{caratula.correoEmpresa || "Correo pendiente"}</span>
          </div>
          <div className="mt-4 grid items-end gap-2 text-[11px] leading-tight sm:grid-cols-[minmax(0,1fr)_230px]">
            <div>
              <p><strong>Fecha del Avalúo:</strong> {formatDateValue(caratula.fechaAvaluo, "normal")}</p>
              <p className="mt-0.5"><strong>Vigencia del Avalúo:</strong> {formatDateValue(caratula.fechaVigencia, "normal")}</p>
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
