"use client";

import { ImageIcon } from "lucide-react";

import type { Block, CaratulaFormData, PrincipalCoverImage } from "../model";
import type { ValuationMeta } from "../model";
import { DocumentConceptValue } from "./document-concept-value";
import { isConclusionNarrativeConcept } from "@/features/valuations/services/caratula-blocks";
import type { ValuationSignature } from "@/features/valuations/services/valuation-signatures";
import { formatNumericValue } from "@/features/valuations/services/concept-value-format";
import { coverImageObjectPosition } from "@/features/valuations/services/cover-image-focus";

// Module 1: Cover (title, location, principal image)
export function CaratulaCoverModule({
  caratula,
  meta,
  principalImage,
}: {
  caratula: CaratulaFormData;
  meta: ValuationMeta;
  principalImage: PrincipalCoverImage | null;
}) {
  return (
    <>
      <section className="text-center">
        <h1 className="text-base font-black uppercase leading-tight text-slate-700">
          {caratula.tituloInmueble || "Título del inmueble pendiente"}
        </h1>
        <p className="text-sm font-semibold leading-tight text-slate-600">{meta.location || "Ubicación pendiente"}</p>
      </section>

      <figure className="mt-0.5 overflow-hidden bg-slate-100">
        {principalImage?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="h-[294px] w-full object-cover"
            // The cover box crops the image; the appraiser chooses the part that stays in view.
            style={{ objectPosition: coverImageObjectPosition(caratula.enfoqueImagenPrincipal) }}
            src={principalImage.url}
            alt="Imagen principal del inmueble"
          />
        ) : (
          <div className="flex h-[294px] flex-col items-center justify-center gap-2 text-slate-400">
            <ImageIcon className="size-10" />
            <span className="text-xs font-medium uppercase tracking-wide">Imagen principal pendiente</span>
          </div>
        )}
      </figure>
    </>
  );
}

// Module 2: Assumptions (long text blocks)
export function CaratulaAssumptionsModule({
  blocks,
}: {
  blocks: Block[];
}) {
  if (!blocks.length) return null;

  return (
    <>
      {blocks.map((block) => (
        <section className="mt-3" key={block.id}>
          <h2 className="border-b-2 border-[var(--caratula-blue)] pb-0.5 text-[12px] font-black uppercase leading-tight text-[var(--caratula-blue)]">
            {block.title}
          </h2>
          <div className="min-h-8 space-y-1 pt-1 text-justify text-[10.5px] leading-snug text-slate-700">
            {block.concepts.map((concept) => (
              <p className="whitespace-pre-wrap" key={concept.id}>
                <DocumentConceptValue concept={concept} fallback="—" />
              </p>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

// Module 3: Conclusion (valor comercial, firma)
export function CaratulaConclusionModule({
  blocks,
  caratula,
}: {
  blocks: Block[];
  caratula: CaratulaFormData;
}) {
  const narrativeConcepts = blocks
    .flatMap((block) => block.concepts)
    .filter(isConclusionNarrativeConcept);

  return (
    <section className="mt-8">
      <h2 className="border-b-2 border-[var(--caratula-blue)] pb-0.5 text-sm font-black uppercase leading-tight text-[var(--caratula-blue)]">CONCLUSIÓN</h2>
      {narrativeConcepts.length ? (
        <div className="space-y-1 pt-1 text-justify text-[11px] leading-snug text-slate-700">
          {narrativeConcepts.map((concept) => (
            <p className="whitespace-pre-wrap" key={concept.id}>
              <DocumentConceptValue concept={concept} />
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-1 border-2 border-[var(--caratula-blue)] bg-slate-200/80 px-4 py-1.5 text-center">
        <h3 className="text-sm font-black leading-tight text-[var(--caratula-blue)]">VALOR COMERCIAL DEL INMUEBLE</h3>
        <p className="pt-1 text-3xl font-medium leading-tight text-[var(--caratula-blue)]">{caratula.valorTotal ? formatNumericValue(caratula.valorTotal, { valueFormat: "mxn" }) : "Sin calcular"}</p>
        <p className="pt-1 text-sm font-medium uppercase leading-tight text-slate-600">
          {caratula.valorConLetra || "Valor con letra pendiente"}
        </p>
      </div>
    </section>
  );
}

// Module 4: Signatures (one or many; the grid wraps three per row)
export function CaratulaSignaturesModule({ caratula }: { caratula: CaratulaFormData }) {
  const signatures: ValuationSignature[] = caratula.firmas.length ? caratula.firmas : [{ name: "", cedula: "", role: "" }];

  return (
    <section className="mb-2 flex flex-wrap justify-center gap-x-6" data-caratula-signatures>
      {signatures.map((signature, index) => (
        <div className="mt-14 w-[30%] min-w-[150px] break-inside-avoid border-t border-slate-500 pt-1.5 text-center" key={index}>
          <p className="break-words text-xs font-bold text-slate-700">{signature.name || "Firma pendiente"}</p>
          <p className="mt-0.5 break-words text-[10px] leading-tight text-slate-600">
            {signature.cedula ? `Cédula profesional ${signature.cedula}` : "Cédula profesional pendiente"}
          </p>
          {signature.role ? (
            <p className="mt-0.5 break-words text-[9px] font-semibold uppercase tracking-wide text-slate-500">{signature.role}</p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
