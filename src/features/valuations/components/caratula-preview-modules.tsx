"use client";

import { ImageIcon } from "lucide-react";


import type { Block, CaratulaFormData, PrincipalCoverImage } from "../model";
import type { ValuationMeta } from "../model";
import { DocumentConceptValue } from "./document-concept-value";
import { isConclusionNarrativeConcept } from "@/features/valuations/services/caratula-blocks";
import type { ValuationSignature } from "@/features/valuations/services/valuation-signatures";
import { formatNumericValue } from "@/features/valuations/services/concept-value-format";
import { coverImageLayout, normalizeCoverImageSize } from "@/features/valuations/services/cover-image-focus";
import { appraisedGoodWording } from "@/features/valuations/services/appraised-good-wording";

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
  const wording = appraisedGoodWording(meta.propertyKind);
  const size = normalizeCoverImageSize(caratula.tamanoImagenPrincipal);
  const coverLayout = coverImageLayout(caratula.enfoqueImagenPrincipal, size);
  return (
    <>
      <section className="text-center">
        <h1 className="text-base font-black uppercase leading-tight text-slate-700">
          {caratula.tituloInmueble || wording.pendingTitle}
        </h1>
        <p className="text-sm font-semibold leading-tight text-slate-600">{meta.location || "Ubicación pendiente"}</p>
      </section>

      {principalImage?.url ? (
        // The box follows the image: white, with nothing showing around it, and
        // as tall as the image, so a smaller image lets the page below move up.
        <figure
          className="mx-auto mt-0.5 overflow-hidden bg-white"
          style={coverLayout.box}
          data-cover-image-fit={size.fit}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="mx-auto block"
            // The cover box crops the image, or shows it whole; the appraiser chooses the part in view and its size.
            style={coverLayout.image}
            src={principalImage.url}
            alt={wording.coverImageAlt}
          />
        </figure>
      ) : (
        <figure className="mt-0.5 overflow-hidden bg-slate-100 [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
          <div className="flex h-[294px] flex-col items-center justify-center gap-2 text-slate-400">
            <ImageIcon className="size-10" />
            <span className="text-xs font-medium uppercase tracking-wide">Imagen principal pendiente</span>
          </div>
        </figure>
      )}
    </>
  );
}

/**
 * The title of a block of the carátula: its own blocks, the assumptions and the
 * conclusion print it alike (videos 5.2 and 5.6: "DATOS DEL BIEN" was missing).
 */
export function CaratulaBlockHeading({ title }: { title: string }) {
  return (
    <h2 className="border-b-2 border-[var(--caratula-blue)] pb-0.5 text-[12px] font-black uppercase leading-tight text-[var(--caratula-blue)]" data-caratula-block-title>
      {title || "No se proporcionó"}
    </h2>
  );
}

/** "CONCLUSION", as the template names it, prints with its accent. */
function conclusionTitle(title: string) {
  return !title.trim() || title.trim().toUpperCase() === "CONCLUSION" ? "CONCLUSIÓN" : title;
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
          <CaratulaBlockHeading title={block.title} />
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
  meta,
  showValue = true,
}: {
  blocks: Block[];
  caratula: CaratulaFormData;
  meta: ValuationMeta;
  /** False on a further conclusion block: the commercial value prints once, in the first. */
  showValue?: boolean;
}) {
  const narrativeConcepts = blocks
    .flatMap((block) => block.concepts)
    .filter(isConclusionNarrativeConcept);

  return (
    <section className="mt-4">
      <CaratulaBlockHeading title={conclusionTitle(blocks[0]?.title ?? "")} />
      {narrativeConcepts.length ? (
        <div className="space-y-1 pt-1 text-justify text-[11px] leading-snug text-slate-700">
          {narrativeConcepts.map((concept) => (
            <p className="whitespace-pre-wrap" key={concept.id}>
              <DocumentConceptValue concept={concept} />
            </p>
          ))}
        </div>
      ) : null}
      {showValue ? <div className="mt-1 border-2 border-[var(--caratula-blue)] bg-slate-200/80 px-4 py-1.5 text-center">
        <h3 className="text-sm font-black leading-tight text-[var(--caratula-blue)]">{appraisedGoodWording(meta.propertyKind).commercialValueTitle}</h3>
        <p className="pt-1 text-3xl font-medium leading-tight text-[var(--caratula-blue)]">{caratula.valorTotal ? formatNumericValue(caratula.valorTotal, { valueFormat: "mxn-mn" }) : "Sin calcular"}</p>
        <p className="pt-1 text-sm font-medium uppercase leading-tight text-slate-600">
          {caratula.valorConLetra || "Valor con letra pendiente"}
        </p>
      </div> : null}
    </section>
  );
}

/** The room over each signature's line, to sign by hand. */
const HAND_SIGNATURE_ROOM_PX = 36;

// Module 4: Signatures (one or many; the grid wraps three per row)
export function CaratulaSignaturesModule({ caratula }: { caratula: CaratulaFormData }) {
  const signatures: ValuationSignature[] = caratula.firmas.length ? caratula.firmas : [{ name: "", cedula: "", role: "" }];

  return (
    <section className="mb-2 flex flex-wrap justify-center gap-x-6" data-caratula-signatures>
      {signatures.map((signature, index) => (
        <div className="mt-2 w-[30%] min-w-[150px] break-inside-avoid text-center" key={index}>
          {/* Room to sign by hand over the line. An image saved with the signature is not printed:
              a pasted signature has no legal validity. */}
          <div style={{ height: HAND_SIGNATURE_ROOM_PX }} />
          <div className="border-t border-slate-500 pt-1.5">
          {/* The name keeps one line, centred on the line even when it is wider than it (video 6.1). */}
          <div className="flex justify-center">
            <p className="whitespace-nowrap text-xs font-bold text-slate-700" data-signature-name>{signature.name || "Firma pendiente"}</p>
          </div>
          <p className="mt-0.5 break-words text-[10px] leading-tight text-slate-600">
            {signature.cedula ? `Cédula profesional ${signature.cedula}` : "Cédula profesional pendiente"}
          </p>
          {signature.role ? (
            <p className="mt-0.5 break-words text-[9px] font-semibold uppercase tracking-wide text-slate-500">{signature.role}</p>
          ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
