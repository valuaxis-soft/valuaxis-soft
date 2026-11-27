/**
 * The lawyer's implementation matrix (We Law, 15 Nov 2026), sections 1.4,
 * 1.5, 1.5 bis, 1.6, 1.7, 1.9 and 3.3: the notices on screen, the
 * advertisers' data out of the printed documents by default, the specialty
 * of who signs, the optional legend of AI tools, no logo but the firm's,
 * the failure reports and the version in the activity log.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AiToolsLegend, SignatureLines } from "../src/features/valuations/components/caratula-preview-modules";
import { SectionDocument } from "../src/features/valuations/components/report-preview";
import { comparableInputSchema } from "../src/features/valuations/calculation/market-schemas";
import { machineryMarketBlocks } from "../src/features/valuations/calculation/machinery-document";
import { defaultMarketSettings, toMarketEngineInput, type ComparableDto } from "../src/features/valuations/calculation/market-types";
import { comparableWarnings } from "../src/features/valuations/calculation/comparable-review";
import {
  AI_RESULT_REVIEW_NOTICE,
  AI_TOOLS_LEGEND,
  THIRD_PARTY_DATA_NOTICE,
} from "../src/features/valuations/legal-notices";
import { hydrateSectionMetadata, sectionMetadataFromContent } from "../src/features/valuations/metadata";
import { memoryComparableCards } from "../src/features/valuations/memory/calculation-memory";
import type { CaratulaFormData, Letterhead } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { printableAdvertiser, printableMachineryContact, printsAdvertiserData } from "../src/features/valuations/services/advertiser-data";
import { describeAudit } from "../src/features/valuations/services/valuation-history";
import {
  accreditedSpecialty,
  parseSignatures,
  withAccreditedSpecialties,
} from "../src/features/valuations/services/valuation-signatures";
import {
  describeFailureReport,
  failureDateProblem,
  failureReportSchema,
  failureResponseSchema,
} from "../src/features/support/failure-report";
import { SUPPORT_CONTACT, whatsappLink } from "../src/features/support/support-contact";
import { buildSupportReportHtml, buildSupportReportText } from "../src/features/notifications/templates/support-report";
import { DEFAULT_MACHINERY_MARKET, emptyOffer } from "../src/features/valuations/calculation/machinery-types";
import "./support/ssr-portal-shim";

const source = (path: string) => readFileSync(path, "utf8");

/* ------------------------------------------------------------------ */
/*  1.4 and 1.5: the notices                                           */
/* ------------------------------------------------------------------ */

test("the texts the matrix quotes are copied word for word", () => {
  assert.equal(
    THIRD_PARTY_DATA_NOTICE,
    "Usted es responsable de los datos de terceros que captura. Infórmeles con su propio aviso de privacidad y, cuando la ley lo exija, obtenga su consentimiento, incluido el consentimiento expreso para sus datos patrimoniales.",
  );
  assert.equal(
    AI_RESULT_REVIEW_NOTICE,
    "Los datos que propone esta función pueden contener errores. Revíselos y corríjalos antes de guardarlos; usted responde de los datos que usa en su avalúo.",
  );
  assert.equal(
    AI_TOOLS_LEGEND,
    "En la elaboración de este avalúo se usaron herramientas de software, incluida inteligencia artificial, bajo la revisión y responsabilidad del valuador que lo firma.",
  );
});

test("pasting a listing and uploading images show no notice each time: the Terms accepted at sign-up declare it (26 Nov 2026)", () => {
  const notices = source("src/features/valuations/legal-notices.ts");
  assert.doesNotMatch(notices, /Pegue solo el texto|derecho a usarla|pendiente de redacción/);
  for (const path of [
    "src/features/valuations/components/legal-notice.tsx",
    "src/features/valuations/components/calculation/paste-listing-dialog.tsx",
    "src/features/valuations/components/calculation/listing-images-picker.tsx",
    "src/features/valuations/components/calculation/comparable-dialog.tsx",
    "src/features/valuations/components/editor/caratula-editor.tsx",
    "src/features/valuations/components/editor/image-upload-control.tsx",
    "src/features/valuations/components/editor/content-creation-control.tsx",
  ]) {
    assert.doesNotMatch(source(path), /PasteListingReminder|ImageRightsNotice|remindImageRights|image-rights/, path);
  }
});

test("the third parties' notice shows once where the solicitante, the propietario and the comparables are captured", () => {
  const panel = source("src/features/valuations/components/workspace/valuation-editor-panel.tsx");
  assert.match(panel, /props\.valuationId && \(isCaratula \|\| isDatosGenerales\) \? <ThirdPartyDataNotice \/> : null/);
  assert.equal(panel.match(/<ThirdPartyDataNotice/g)?.length, 1, "once per tab, not per field");
  const sheet = source("src/features/valuations/components/calculation/comparable-dialog.tsx");
  assert.equal(sheet.match(/<ThirdPartyDataNotice/g)?.length, 1);
  // It informs: no checkbox, no confirmation, nothing blocked.
  assert.doesNotMatch(source("src/features/valuations/components/legal-notice.tsx"), /Checkbox|AlertDialog|disabled/);
});

test("«Pegar anuncio» warns next to the result; «Buscar con IA» warns too", () => {
  const paste = source("src/features/valuations/components/calculation/paste-listing-dialog.tsx");
  // Nothing is saved in the dialog: «Extraer datos y crear ficha» only opens the comparable's card (V8.12).
  assert.doesNotMatch(paste, /api\.market\.|saveComparable|createComparable/);
  // The result is the card itself: the notice goes right before what was read from the listing.
  assert.match(
    source("src/features/valuations/components/calculation/comparable-dialog.tsx"),
    /!comparable && props\.prefill && !readOnly \? <AiResultReviewNotice \/> : null}\s*\{!comparable && props\.listingEvidence && !readOnly \? <ListingEvidence/,
    "next to the result",
  );
  assert.match(source("src/features/valuations/components/calculation/ai-comparable-search.tsx"), /<AiResultReviewNotice \/>/);
});

/* ------------------------------------------------------------------ */
/*  1.5 bis: the comparable's fields                                   */
/* ------------------------------------------------------------------ */

const comparable = (extra: Partial<ComparableDto> = {}): ComparableDto => ({
  id: "c-1", reference: 1, location: "Calle Inventada, Arandas", area: null, price: null,
  landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
  sourceName: "Portal de prueba", contactName: "Persona Inventada", contactPhone: "333 000 0000", url: null, offerDate: null,
  photos: [], factors: [],
  ...extra,
});

test("a comparable saves with only its location; the calculation needs price, surface, the subject's and one comparable", () => {
  const nulls = Object.fromEntries(Object.keys(comparableInputSchema.shape).map((key) => [key, null]));
  const onlyLocation = { ...nulls, location: "Calle Inventada 10, Arandas", extra: {}, attributes: [], regressionExcluded: false, factors: [], formulas: {} };
  assert.equal(comparableInputSchema.safeParse(onlyLocation).success, true);
  assert.equal(comparableInputSchema.safeParse({ ...onlyLocation, location: "" }).success, false, "the location is the one field it needs");

  const settings = { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: null };
  assert.deepEqual(toMarketEngineInput({ settings, comparables: [comparable({ area: 150, price: 1_000_000 })] }), { ok: false, reason: "Captura la superficie del sujeto." });
  const withSubject = { ...settings, subjectArea: 160 };
  assert.deepEqual(toMarketEngineInput({ settings: withSubject, comparables: [comparable()] }), { ok: false, reason: "Captura al menos un comparable con superficie y precio." });
  assert.equal(toMarketEngineInput({ settings: withSubject, comparables: [comparable({ area: 150, price: 1_000_000 })] }).ok, true);
});

test("the warnings of a comparable inform and never stop the calculation", () => {
  const plain = comparable({ area: 300, price: 2_000_000, location: "Calle sin número, Arandas", contactName: "Portal de prueba", contactPhone: null });
  const warnings = comparableWarnings({ ...plain, hasScreenshot: false }, { type: "INMUEBLE_VENTA", subjectArea: 100, today: "2026-11-25" }).map((warning) => warning.key);
  for (const key of ["BUILT_AREA", "NO_NUMBER", "PORTAL_CONTACT", "NO_SCREENSHOT"]) assert.ok(warnings.includes(key as never), key);
  const settings = { ...defaultMarketSettings("INMUEBLE_VENTA"), subjectArea: 100 };
  assert.equal(toMarketEngineInput({ settings, comparables: [plain] }).ok, true, "the same comparable is calculated");
});

/* ------------------------------------------------------------------ */
/*  1.5 bis and 1.6: the advertiser's data                             */
/* ------------------------------------------------------------------ */

test("the advertiser's name and phone are out of the memoria unless the appraiser includes them", () => {
  const market = { settings: defaultMarketSettings("TERRENO_VENTA"), comparables: [comparable({ area: 150, price: 1_000_000 })], comparableValidityMonths: 6 };
  const valuation = { id: "v", folio: "PRB-1", title: null };
  const [left] = memoryComparableCards([market], valuation, "2026-11-25");
  assert.equal(left.comparable.contactName, null);
  assert.equal(left.comparable.contactPhone, null);
  assert.equal(left.comparable.sourceName, "Portal de prueba", "the portal is a source, not personal data");
  const [included] = memoryComparableCards([market], valuation, "2026-11-25", { advertiserData: true });
  assert.equal(included.comparable.contactName, "Persona Inventada");
  assert.equal(included.comparable.contactPhone, "333 000 0000");

  assert.deepEqual(printableAdvertiser({ contactName: "A", contactPhone: "1" }, false), { contactName: null, contactPhone: null });
  assert.deepEqual(printableMachineryContact({ contact: "A", phone: "1", email: "a@b.c", company: "Empresa" }, false), { contact: "", phone: "", email: "", company: "Empresa" });
});

test("a machinery offer prints its company but not the contact, the phone or the email by default", () => {
  const market = { ...DEFAULT_MACHINERY_MARKET, offers: [{ ...emptyOffer(0), contact: "Persona Inventada", company: "Equipos de Prueba", phone: "333 000 0000", email: "venta@ejemplo.test", price: 100 }] };
  const subject = { brand: "", model: "", year: "", hours: "", age: null, usefulLife: null } as never;
  const contactRow = (advertiserData: boolean) => {
    const blocks = machineryMarketBlocks(market, subject, null, { advertiserData });
    const table = blocks.flatMap((block) => block.apartados).flatMap((apartado) => apartado.tables).find((item) => item.id.endsWith("tabla-contacto"));
    assert.ok(table && "rows" in table);
    return JSON.stringify(table);
  };
  assert.doesNotMatch(contactRow(false), /Persona Inventada|333 000 0000|venta@ejemplo\.test/);
  assert.match(contactRow(false), /Equipos de Prueba/);
  assert.match(contactRow(true), /Persona Inventada/);
});

test("«Incluir datos del anunciante» and the legend are the carátula's choices, saved without a migration", () => {
  const sections = createInitialSections();
  assert.equal(printsAdvertiserData(sections), false, "off by default");
  assert.equal(printsAdvertiserData(sections.map((section) => (section.id === "caratula" ? { ...section, advertiserData: true } : section))), true);
  const stored = sectionMetadataFromContent({ enabled: true, advertiserData: true, aiToolsLegend: true });
  const read = hydrateSectionMetadata(JSON.parse(JSON.stringify(stored)));
  assert.equal(read.advertiserData, true);
  assert.equal(read.aiToolsLegend, true);
  assert.equal(sectionMetadataFromContent({ enabled: true }).advertiserData, undefined);
  // The dictamen follows the choice: the market pages are written again when it changes.
  const sync = source("src/features/valuations/components/workspace/hooks/use-calculation-document-sync.ts");
  assert.match(sync, /marketDocumentBlocks\(calculation, result, \{ advertiserData \}\)/);
  assert.match(sync, /reapplyAdvertiserData\(\)/);
  assert.match(source("src/features/valuations/memory/calculation-memory.service.ts"), /advertiserData: printsAdvertiserData\(sections\)/);
});

/* ------------------------------------------------------------------ */
/*  1.7: who signs, the legend and the logo                            */
/* ------------------------------------------------------------------ */

test("who signs prints name, cédula and specialty; the specialty comes from a verified accreditation", () => {
  const html = renderToStaticMarkup(<SignatureLines signatures={[{ name: "Ing. Persona Inventada", cedula: "1234567", role: "", specialty: "Maestría en Valuación Inmobiliaria" }]} />);
  assert.match(html, /Ing\. Persona Inventada/);
  assert.match(html, /Cédula profesional 1234567/);
  assert.match(html, /data-signature-specialty="true">Maestría en Valuación Inmobiliaria/);

  const parsed = parseSignatures([{ name: " Ing. Persona ", cedula: "1234567", specialty: "  Especialidad en Valuación " }]);
  assert.ok(parsed.ok);
  assert.equal(parsed.value[0].specialty, "Especialidad en Valuación");

  assert.equal(accreditedSpecialty({ SEstado: "ACREDITADO", SProgramaAcademico: "Maestría en Valuación" }), "Maestría en Valuación");
  assert.equal(accreditedSpecialty({ SEstado: "EN_REVISION", SProgramaAcademico: "Maestría en Valuación" }), null, "only a verified one");
  const filled = withAccreditedSpecialties(
    [{ name: "A", cedula: "12 345 67", role: "" }, { name: "B", cedula: "999", role: "", specialty: "La que escribió" }],
    [{ cedula: "1234567", specialty: "Maestría en Valuación" }, { cedula: "999", specialty: "Otra" }],
  );
  assert.equal(filled[0].specialty, "Maestría en Valuación");
  assert.equal(filled[1].specialty, "La que escribió", "what the appraiser wrote stays");
});

const caratula: CaratulaFormData = {
  tituloInmueble: "Casa de prueba", numeroAvaluo: "PRB-0001", folio: "PRB-0001", direccionEmpresa: "", telefonoEmpresa: "", correoEmpresa: "",
  solicitante: "", propietario: "", objeto: "", proposito: "", firmas: [{ name: "Ing. Persona Inventada", cedula: "1234567", role: "" }],
  valorTotal: "1500000", valorConLetra: "UN MILLÓN QUINIENTOS MIL PESOS 00/100 M.N.", fechaAvaluo: "2026-11-25", mesesVigencia: 6, fechaVigencia: "",
};
const meta = { folio: "PRB-0001", client: "", postalCode: "", location: "", valuationKind: "venta", propertyKind: "casa" } as const;
const letterhead: Letterhead = { name: "Despacho de prueba", legalName: null, rfc: null, address: null, phone: null, email: null, logoUrl: null };

test("the legend of AI tools prints only when the appraiser adds it, and there is no logo but the firm's", () => {
  const cover = createInitialSections().find((section) => section.id === "caratula")!;
  const print = (section: typeof cover, head = letterhead) =>
    renderToStaticMarkup(<SectionDocument caratula={caratula} letterhead={head} meta={meta} principalCoverImage={null} section={section} />);
  const plain = print(cover);
  assert.doesNotMatch(plain, /data-ai-tools-legend/);
  assert.doesNotMatch(plain, />VA</, "no logo of Valuaxis nor a placeholder");
  assert.doesNotMatch(plain, /data-header-logo/);
  assert.match(print({ ...cover, aiToolsLegend: true }), new RegExp(AI_TOOLS_LEGEND));
  assert.match(renderToStaticMarkup(<AiToolsLegend />), /data-ai-tools-legend/);
  assert.match(print(cover, { ...letterhead, logoUrl: "/logo-del-despacho.png" }), /data-header-logo="true"><img[^>]*src="\/logo-del-despacho\.png"/);
});

test("sending by email records the recipients, who and when, and the history shows it", () => {
  const route = source("src/app/api/avaluos/[id]/dictamen/correo/route.ts");
  assert.match(route, /channel: "email", recipients: body\.data\.to\.join\(", "\)/);
  const event = describeAudit({ id: "1", at: new Date("2026-11-25T18:00:00Z"), actor: "Persona Inventada", action: "VALUATION_EXPORT", metadata: { format: "pdf", channel: "email", recipients: "cliente@ejemplo.test", versionAvaluo: 2 } });
  assert.equal(event?.title, "Envió el dictamen por correo");
  assert.equal(event?.detail, "A: cliente@ejemplo.test");
  assert.equal(event?.actor, "Persona Inventada");
  assert.equal(event?.version, 2, "and the version it was sent from (matrix 3.3)");
});

/* ------------------------------------------------------------------ */
/*  3.3: the activity log                                              */
/* ------------------------------------------------------------------ */

test("every action on a valuation records the version it was in; AI use records who and how much", () => {
  const audit = source("src/features/valuations/services/valuation-audit.ts");
  assert.match(audit, /INumeroVersionActual/);
  assert.match(audit, /\{ \.\.\.input\.metadata, versionAvaluo \}/);
  assert.match(audit, /ip: clientIp\(input\.request\.headers\)/);
  const save = describeAudit({ id: "2", at: new Date(), actor: "Persona", action: "VALUATION_SAVE", metadata: { versionAvaluo: 3 } });
  assert.equal(save?.version, 3);
  assert.equal(describeAudit({ id: "3", at: new Date(), actor: "Persona", action: "VALUATION_SAVE", metadata: null })?.version, null, "a row of before has none");
  for (const path of ["src/features/ai/ai-assist.service.ts", "src/features/valuations/comparable-search/web-search.service.ts"]) {
    const text = source(path);
    assert.match(text, /userId:/, path);
    assert.match(text, /inputTokens/, path);
    assert.match(text, /outputTokens/, path);
  }
});

/* ------------------------------------------------------------------ */
/*  1.9: support and failure reports                                   */
/* ------------------------------------------------------------------ */

test("a failure report needs a date and a description; the valuation and the screenshot are optional", () => {
  assert.equal(failureReportSchema.safeParse({ valuationId: null, happenedOn: "2026-11-24", description: "El PDF no se descargó al concluir." }).success, true);
  assert.equal(failureReportSchema.safeParse({ valuationId: null, happenedOn: "", description: "El PDF no se descargó al concluir." }).success, false);
  assert.equal(failureReportSchema.safeParse({ valuationId: null, happenedOn: "2026-11-24", description: "Falla" }).success, false);
  assert.equal(failureReportSchema.safeParse({ valuationId: "no-es-uuid", happenedOn: "2026-11-24", description: "El PDF no se descargó." }).success, false);
  assert.equal(failureDateProblem("2026-11-26", "2026-11-25"), "La fecha de la falla no puede ser posterior a hoy.");
  assert.equal(failureDateProblem("2026-11-25", "2026-11-25"), null);
  assert.equal(failureResponseSchema.safeParse({ status: "RECIBIDO", response: "x" }).success, false, "the operator answers with a status of review");
  assert.equal(failureResponseSchema.safeParse({ status: "CORREGIDO", response: "Se corrigió la descarga." }).success, true);
});

test("a report's status is its last response; without one it is «Recibido»", () => {
  const report = { id: "r-1", at: new Date("2026-11-24T10:00:00Z"), organizationName: "Despacho de prueba", reporter: "Persona", reporterEmail: "persona@ejemplo.test", metadata: { avaluo: "PRB-1 · Casa", fecha: "2026-11-24", descripcion: "No guardó.", captura: null } };
  assert.equal(describeFailureReport(report, []).status, "RECIBIDO");
  const view = describeFailureReport(report, [
    { reportId: "r-1", at: new Date("2026-11-25T10:00:00Z"), by: "Operador", metadata: { estado: "CORREGIDO", respuesta: "Listo." } },
    { reportId: "r-1", at: new Date("2026-11-24T12:00:00Z"), by: "Operador", metadata: { estado: "EN_REVISION", respuesta: "Lo revisamos." } },
    { reportId: "otro", at: new Date("2026-11-25T12:00:00Z"), by: "Operador", metadata: { estado: "CERRADO", respuesta: "De otro." } },
  ]);
  assert.equal(view.status, "CORREGIDO");
  assert.deepEqual(view.responses.map((response) => response.response), ["Lo revisamos.", "Listo."]);
  assert.equal(view.valuation, "PRB-1 · Casa");
});

test("support shows the email and WhatsApp from one module, placeholders until the owner fills them; no refunds anywhere", () => {
  assert.deepEqual(Object.keys(SUPPORT_CONTACT).sort(), ["email", "whatsapp"]);
  assert.equal(whatsappLink("33 1234 5678"), "https://wa.me/523312345678");
  assert.equal(whatsappLink("+52 33 1234 5678"), "https://wa.me/523312345678");
  assert.equal(whatsappLink("123"), null);
  assert.match(source("src/app/(private)/soporte/page.tsx"), /SUPPORT_PENDING_TEXT/);
  assert.match(source("src/features/dashboard/components/user-menu.tsx"), /Ayuda y soporte/);
  const content = { reporterName: "Persona", reporterEmail: "p@ejemplo.test", organizationName: "Despacho", valuation: "", happenedOn: "2026-11-24", description: "No guardó.", hasScreenshot: false, reportsUrl: "https://ejemplo.test/operador/fallas" };
  assert.match(buildSupportReportText(content), /Fecha de la falla: 2026-11-24/);
  for (const path of [
    "src/features/support/failure-report.ts",
    "src/features/support/support-contact.ts",
    "src/features/support/components/failure-report-form.tsx",
    "src/features/support/components/failure-report-list.tsx",
    "src/features/support/components/failure-response-form.tsx",
    "src/app/(private)/soporte/page.tsx",
    "src/app/(private)/operador/fallas/page.tsx",
  ]) {
    assert.doesNotMatch(source(path).replace(/\/\*[\s\S]*?\*\//g, ""), /reembolso|devoluci[oó]n|bonificaci[oó]n|compensaci[oó]n/i, path);
  }
  assert.doesNotMatch(buildSupportReportHtml(content), /reembolso|devoluci/i);
});
