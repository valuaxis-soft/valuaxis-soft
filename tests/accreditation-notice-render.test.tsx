import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { UNACCREDITED_NOTICE_BODY, UNACCREDITED_NOTICE_TITLE } from "../src/features/accreditation/accreditation-notice";
import { UnaccreditedNoticeProvider } from "../src/features/accreditation/components/unaccredited-notice";
import { ContinuousSectionsDocument, SectionDocument } from "../src/features/valuations/components/report-preview";
import { CalculationMemoryDocument } from "../src/features/valuations/components/memory/calculation-memory-document";
import { buildCalculationMemory } from "../src/features/valuations/memory/calculation-memory";
import type { AppSection, CaratulaFormData, Letterhead } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { getCanonicalSectionKey } from "../src/features/valuations/sections/section-registry";
import { printableSectionGroups } from "../src/features/valuations/services/printable-sections";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

const caratula: CaratulaFormData = {
  tituloInmueble: "Casa",
  numeroAvaluo: "VLO-0001",
  folio: "VLO-0001",
  direccionEmpresa: "",
  telefonoEmpresa: "",
  correoEmpresa: "",
  solicitante: "",
  propietario: "",
  objeto: "",
  proposito: "",
  firmas: [],
  valorTotal: "1000000",
  valorConLetra: "UN MILLÓN DE PESOS",
  fechaAvaluo: "2026-10-28",
  mesesVigencia: 6,
  fechaVigencia: "",
};
const meta = { folio: "VLO-0001", client: "", postalCode: "", location: "", valuationKind: "venta", propertyKind: "casa" } as const;
const letterhead: Letterhead = { name: "Despacho", legalName: null, rfc: null, address: null, phone: null, email: null, logoUrl: null };

/** The dictamen as ValuationDictamen draws it: every printable group, with the notice decided on the server. */
function renderDictamen(sections: AppSection[], unaccreditedNotice: boolean) {
  const groups = printableSectionGroups(sections, { unaccreditedNotice });
  return renderToStaticMarkup(
    <UnaccreditedNoticeProvider show={unaccreditedNotice}>
      {groups.map((group) =>
        group.length === 1 ? (
          <SectionDocument
            key={group[0].id}
            caratula={caratula}
            letterhead={letterhead}
            meta={meta}
            principalCoverImage={null}
            section={group[0]}
          />
        ) : (
          <ContinuousSectionsDocument key={group.map((section) => section.id).join("+")} caratula={caratula} letterhead={letterhead} meta={meta} sections={group} />
        ),
      )}
    </UnaccreditedNoticeProvider>,
  );
}

const noticeLocations = (html: string) => [...html.matchAll(/data-unaccredited-notice="([^"]+)"/g)].map((match) => match[1]);
const occurrences = (html: string, text: string) => html.split(text).length - 1;

test("an unaccredited issuer's dictamen prints the notice on the cover, the considerations and the conclusion", () => {
  const html = renderDictamen(createInitialSections(), true);
  assert.deepEqual(noticeLocations(html).sort(), ["caratula", "conclusiones", "consideraciones"]);
  assert.equal(occurrences(html, UNACCREDITED_NOTICE_TITLE), 3);
  assert.equal(occurrences(html, UNACCREDITED_NOTICE_BODY), 3);
  // Bold and black, in its own frame.
  assert.match(html, /data-unaccredited-notice="caratula" class="[^"]*font-bold[^"]*text-black/);
});

test("an accredited issuer's dictamen has no notice", () => {
  const html = renderDictamen(createInitialSections(), false);
  assert.deepEqual(noticeLocations(html), []);
  assert.equal(occurrences(html, UNACCREDITED_NOTICE_TITLE), 0);
});

test("hiding or deleting Consideraciones does not take the notice out: it prints alone under the heading", () => {
  const sections = createInitialSections().map((section) =>
    getCanonicalSectionKey(section.id) === "CONSIDERACIONES"
      ? { ...section, enabled: false, removed: true, blocks: section.blocks.map((block) => ({ ...block, title: "CONTENIDO OCULTO" })) }
      : section,
  );
  const html = renderDictamen(sections, true);
  assert.deepEqual(noticeLocations(html).sort(), ["caratula", "conclusiones", "consideraciones"]);
  assert.ok(html.includes("CONSIDERACIONES PREVIAS AL AVALÚO"));
  assert.ok(!html.includes("CONTENIDO OCULTO"), "the hidden content stays hidden");

  const accredited = renderDictamen(sections, false);
  assert.ok(!accredited.includes("CONSIDERACIONES PREVIAS AL AVALÚO"), "accredited, a hidden section stays out");
});

test("the calculation memory of an unaccredited issuer opens with the notice; an accredited one's does not", () => {
  const memory = buildCalculationMemory({
    sections: createInitialSections(),
    calculations: { markets: [], cost: null, income: null, machinery: null, conclusion: null },
    stored: [],
    folio: "VLO-0001",
    valuationDate: "2026-10-28",
    firmName: "Despacho",
    concluded: false,
    generatedAt: new Date("2026-10-28T18:00:00Z"),
  });
  const render = (unaccreditedNotice: boolean) =>
    renderToStaticMarkup(
      <CalculationMemoryDocument
        caratula={caratula}
        headerImage={null}
        letterhead={letterhead}
        memory={memory}
        propertyKind="casa"
        unaccreditedNotice={unaccreditedNotice}
      />,
    );
  assert.deepEqual(noticeLocations(render(true)), ["memoria-calculo"]);
  assert.equal(occurrences(render(true), UNACCREDITED_NOTICE_BODY), 1);
  assert.deepEqual(noticeLocations(render(false)), []);
});

test("a document without a Conclusión section still prints the notice in one, at its place", () => {
  const sections = createInitialSections().filter((section) => getCanonicalSectionKey(section.id) !== "CONCLUSIONES");
  const groups = printableSectionGroups(sections, { unaccreditedNotice: true }).flat();
  const keys = groups.map((section) => getCanonicalSectionKey(section.id));
  assert.ok(keys.includes("CONCLUSIONES"));
  assert.ok(keys.indexOf("CONCLUSIONES") > keys.indexOf("CONSIDERACIONES"));
  assert.deepEqual(noticeLocations(renderDictamen(sections, true)).sort(), ["caratula", "conclusiones", "consideraciones"]);
});
