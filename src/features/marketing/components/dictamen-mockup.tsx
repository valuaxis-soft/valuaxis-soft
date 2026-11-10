import { Photo } from "@/components/brand/photo";

/** Three letter-size pages of an invented dictamen: annex croquis, market table and cover. */
export function DictamenMockup() {
  return (
    <div
      role="img"
      aria-label="Maqueta de un dictamen en PDF: portada, tabla del enfoque de mercado y croquis de ubicación en anexo."
      className="relative mx-auto aspect-[5/4] w-full max-w-lg"
    >
      {/* Annex: location croquis */}
      <div className="absolute top-0 right-0 aspect-[8.5/11] w-[52%] rotate-6 rounded-md bg-white p-3 shadow-lift ring-1 ring-black/5 transition-transform duration-500 ease-(--ease-out-quint) group-hover/dictamen:translate-x-3 group-hover/dictamen:rotate-[9deg]">
        <p className="text-[7px] font-bold tracking-wider text-[#014069]">ANEXO 2 · CROQUIS DE UBICACIÓN</p>
        <svg viewBox="0 0 100 80" className="mt-2 w-full rounded-sm" aria-hidden="true">
          <rect width="100" height="80" fill="#eef1ea" />
          <path d="M0 22h100M0 52h100M30 0v80M70 0v80" stroke="#fff" strokeWidth="5" />
          <path d="M0 22h100M0 52h100M30 0v80M70 0v80" stroke="#d9dccf" strokeWidth="0.6" />
          <rect x="36" y="27" width="28" height="20" fill="#cfe6d8" />
          <circle cx="50" cy="37" r="4" fill="#40a47e" stroke="#fff" strokeWidth="1.5" />
          <circle cx="18" cy="12" r="3" fill="#014069" />
          <circle cx="84" cy="64" r="3" fill="#014069" />
          <circle cx="82" cy="12" r="3" fill="#014069" />
          <path d="M92 70l3-8 3 8-3-2z" fill="#0c1a29" />
        </svg>
        <p className="mt-1.5 text-center text-[6px] text-neutral-500">Croquis de microlocalización</p>
        <div className="mt-2 grid gap-1">
          <div className="h-1 w-full rounded bg-neutral-200" />
          <div className="h-1 w-4/5 rounded bg-neutral-200" />
        </div>
        <p className="absolute right-3 bottom-2 text-[6px] text-neutral-400">Página 41 de 42</p>
      </div>

      {/* Market approach table */}
      <div className="absolute top-[6%] left-[22%] aspect-[8.5/11] w-[52%] -rotate-2 rounded-md bg-white p-3 shadow-lift ring-1 ring-black/5 transition-transform duration-500 ease-(--ease-out-quint) group-hover/dictamen:-translate-y-2">
        <p className="text-[7px] font-bold tracking-wider text-[#014069]">V. ENFOQUE DE MERCADO</p>
        {/* Table: a navy header row and seven rows, the homologated column in green. */}
        <svg viewBox="0 0 100 72" className="mt-2 w-full" aria-hidden="true">
          <defs>
            <pattern id="vx-table-row" width="100" height="9" patternUnits="userSpaceOnUse">
              <rect x="0" width="78" height="6" rx="1" fill="#e5e5e5" />
              <rect x="80" width="20" height="6" rx="1" fill="#cfe6d8" />
              <path d="M19 0v6M39 0v6M59 0v6" stroke="#fff" strokeWidth="2" />
            </pattern>
          </defs>
          <rect width="100" height="6" rx="1" fill="#014069" />
          <rect y="9" width="100" height="63" fill="url(#vx-table-row)" />
        </svg>
        <div className="mt-3 grid gap-1">
          <div className="h-1 w-full rounded bg-neutral-200" />
          <div className="h-1 w-11/12 rounded bg-neutral-200" />
          <div className="h-1 w-3/4 rounded bg-neutral-200" />
        </div>
        <div className="mt-3 rounded-sm border border-[#40a47e] px-1.5 py-1 text-[6px] text-[#0c1a29]">
          Valor unitario adoptado: <b>$18,450.00 /m²</b>
        </div>
        <p className="absolute right-3 bottom-2 text-[6px] text-neutral-400">Página 23 de 42</p>
      </div>

      {/* Cover */}
      <div className="absolute bottom-0 left-0 aspect-[8.5/11] w-[52%] -rotate-6 overflow-hidden rounded-md bg-white shadow-float ring-1 ring-black/5 transition-transform duration-500 ease-(--ease-out-quint) group-hover/dictamen:-translate-x-2 group-hover/dictamen:-rotate-[8deg]">
        <div className="bg-[#014069] px-3 py-2.5">
          <p className="text-[6px] tracking-[0.2em] text-[#cfe6d8]">DICTAMEN DE AVALÚO</p>
          <p className="font-display text-[11px] leading-tight font-semibold text-white">Avalúo inmobiliario</p>
        </div>
        <Photo
          src="/marketing/dictamen-portada.webp"
          width={640}
          height={373}
          sizes="(min-width: 1024px) 270px, 50vw"
          className="aspect-[120/70] w-full object-cover"
        />
        <div className="grid gap-1 px-3 py-2">
          <p className="text-[6px] text-neutral-500">Casa habitación · Zapopan, Jal.</p>
          <p className="text-[6px] text-neutral-500">Valor concluido</p>
          <p className="font-display text-[12px] font-semibold text-[#0c1a29]">$3,482,000.00</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <div className="border-t border-neutral-300 pt-0.5 text-center text-[5px] text-neutral-500">Valuador</div>
            <div className="border-t border-neutral-300 pt-0.5 text-center text-[5px] text-neutral-500">Controlador</div>
          </div>
        </div>
        <p className="absolute right-3 bottom-2 text-[6px] text-neutral-400">Página 1 de 42</p>
      </div>
    </div>
  );
}
