import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import sharp from "sharp";

import {
  requiresUnaccreditedNotice,
  UNACCREDITED_NOTICE_BODY,
  UNACCREDITED_NOTICE_TITLE,
  valuationIssuerUserId,
} from "../src/features/accreditation/accreditation-notice";
import {
  decideAccreditation,
  findSepVerificationLink,
  namesMatch,
  normalizeNameTokens,
  parseSepVerificationUrl,
  type SepCheck,
} from "../src/features/accreditation/accreditation-rules";
import { hashCurp } from "../src/features/accreditation/curp-hash";
import { detectUploadKind, readQrTexts } from "../src/features/accreditation/qr-reader";

/** Made-up data only: a CURP of the "foreigner" pattern and an invented folio. */
const CURP = "XEXX010101HNEXXXA4";
const FOLIO = "123456789";
const SEP_URL = `https://cedulaprofesional.sep.gob.mx/cedula-profesional/validar-folio?curp=${CURP}&id=${FOLIO}`;

/* ------------------------------------------------------------------ */
/*  The URL in the QR                                                  */
/* ------------------------------------------------------------------ */

test("the constancia's QR link is accepted and rebuilt from its parts", () => {
  const result = parseSepVerificationUrl(` ${SEP_URL}&utm=x#frag `);
  assert.ok(result.ok);
  assert.equal(result.link.curp, CURP);
  assert.equal(result.link.folio, FOLIO);
  assert.equal(result.link.url, SEP_URL, "extra parameters and fragments are dropped");
});

test("a lower-case CURP is normalized; the host is compared as the URL parser lowers it", () => {
  const result = parseSepVerificationUrl(`https://CEDULAPROFESIONAL.sep.gob.mx/cedula-profesional/validar-folio?curp=${CURP.toLowerCase()}&id=${FOLIO}`);
  assert.ok(result.ok);
  assert.equal(result.link.curp, CURP);
});

test("only https, the exact host and the exact path are accepted", () => {
  const rejected = [
    `http://cedulaprofesional.sep.gob.mx/cedula-profesional/validar-folio?curp=${CURP}&id=${FOLIO}`,
    `https://cedulaprofesional.sep.gob.mx.evil.com/cedula-profesional/validar-folio?curp=${CURP}&id=${FOLIO}`,
    `https://evilcedulaprofesional.sep.gob.mx/cedula-profesional/validar-folio?curp=${CURP}&id=${FOLIO}`,
    `https://www.cedulaprofesional.sep.gob.mx/cedula-profesional/validar-folio?curp=${CURP}&id=${FOLIO}`,
    `https://cedulaprofesional.sep.gob.mx@evil.com/cedula-profesional/validar-folio?curp=${CURP}&id=${FOLIO}`,
    `https://user:pass@cedulaprofesional.sep.gob.mx/cedula-profesional/validar-folio?curp=${CURP}&id=${FOLIO}`,
    `https://cedulaprofesional.sep.gob.mx:8443/cedula-profesional/validar-folio?curp=${CURP}&id=${FOLIO}`,
    `https://cedulaprofesional.sep.gob.mx/cedula-profesional/validar-folio/?curp=${CURP}&id=${FOLIO}`,
    `https://cedulaprofesional.sep.gob.mx/cedula-profesional/busqueda?curp=${CURP}&id=${FOLIO}`,
    `https://cedulaprofesional.sep.gob.mx/?curp=${CURP}&id=${FOLIO}`,
    `https://cedulaprofesional.sep.gob.mx./cedula-profesional/validar-folio?curp=${CURP}&id=${FOLIO}`,
    `javascript:alert(1)`,
    `cedulaprofesional.sep.gob.mx/cedula-profesional/validar-folio?curp=${CURP}&id=${FOLIO}`,
    "texto cualquiera",
  ];
  for (const url of rejected) assert.equal(parseSepVerificationUrl(url).ok, false, url);
});

test("the CURP and the folio must be there once and well formed", () => {
  const base = "https://cedulaprofesional.sep.gob.mx/cedula-profesional/validar-folio";
  for (const query of [
    `?id=${FOLIO}`,
    `?curp=${CURP}`,
    `?curp=${CURP}&curp=${CURP}&id=${FOLIO}`,
    `?curp=${CURP}&id=${FOLIO}&id=1234567`,
    `?curp=NOESUNACURP&id=${FOLIO}`,
    `?curp=${CURP}&id=12A456789`,
    `?curp=${CURP}&id=12`,
  ]) {
    assert.equal(parseSepVerificationUrl(base + query).ok, false, query);
  }
});

test("the first SEP link among several texts wins; without any, the first reason is given", () => {
  const found = findSepVerificationLink(["https://example.com", SEP_URL]);
  assert.ok(found.ok);
  const none = findSepVerificationLink(["https://cedulaprofesional.sep.gob.mx.evil.com/cedula-profesional/validar-folio"]);
  assert.equal(none.ok, false);
  assert.match(!none.ok ? none.reason : "", /no lleva a cedulaprofesional\.sep\.gob\.mx/);
  const empty = findSepVerificationLink([]);
  assert.match(!empty.ok ? empty.reason : "", /No encontramos un código QR/);
});

/* ------------------------------------------------------------------ */
/*  Names                                                              */
/* ------------------------------------------------------------------ */

test("names are compared without accents, case, punctuation or particles", () => {
  assert.deepEqual(normalizeNameTokens("José de la Peña-Núñez"), ["JOSE", "PENA", "NUNEZ"]);
  assert.equal(namesMatch("José Pérez López", "JOSE PEREZ LOPEZ"), true);
  assert.equal(namesMatch("Pérez López José", "JOSE PEREZ LOPEZ"), true, "any order");
  assert.equal(namesMatch("María de los Ángeles Ruiz", "MARIA ANGELES RUIZ"), true);
});

test("one word more on either side is tolerated, two are not", () => {
  assert.equal(namesMatch("Juan Pérez López", "JUAN CARLOS PEREZ LOPEZ"), true);
  assert.equal(namesMatch("Juan Carlos Pérez López", "JUAN PEREZ LOPEZ"), true);
  assert.equal(namesMatch("Juan Pérez", "JUAN CARLOS PEREZ LOPEZ"), false);
});

test("different names, or a single word, do not match", () => {
  assert.equal(namesMatch("Juan Pérez López", "JUAN PEREZ GARCIA"), false);
  assert.equal(namesMatch("Ana Ruiz", "JUAN PEREZ"), false);
  assert.equal(namesMatch("Juan", "JUAN"), false);
  assert.equal(namesMatch("Juan Juan Pérez", "JUAN PEREZ LOPEZ"), false, "a repeated word counts once");
});

/* ------------------------------------------------------------------ */
/*  CURP hash                                                          */
/* ------------------------------------------------------------------ */

test("the CURP is stored as a hash: never in clear, stable, and keyed when there is a secret", () => {
  const plain = hashCurp(CURP, null);
  assert.match(plain, /^sha256:[0-9a-f]{64}$/);
  assert.equal(hashCurp(` ${CURP.toLowerCase()} `, null), plain, "normalized before hashing");
  assert.ok(!plain.includes(CURP));

  const secret = "s".repeat(32);
  const keyed = hashCurp(CURP, secret);
  assert.match(keyed, /^hmac:[0-9a-f]{64}$/);
  assert.equal(hashCurp(CURP, secret), keyed);
  assert.notEqual(hashCurp(CURP, "t".repeat(32)), keyed);
  assert.notEqual(hashCurp("XAXX010101MNEXXXA8", secret), keyed);
});

/* ------------------------------------------------------------------ */
/*  Outcome of an upload                                               */
/* ------------------------------------------------------------------ */

const read = (name: string | null, validCedula = true): SepCheck => ({ kind: "read", validCedula, cedulaNumber: "1234567", name });
const decide = (check: SepCheck, extra: Partial<Parameters<typeof decideAccreditation>[0]> = {}) =>
  decideAccreditation({ userName: "Juan Pérez López", check, curpUsedByAnotherUser: false, previouslyRevoked: false, ...extra });

test("only a valid cédula whose name matches accredits on its own", () => {
  assert.deepEqual(decide(read("JUAN PEREZ LOPEZ")), { status: "ACREDITADO", automatic: "COINCIDE", reason: null });
  assert.equal(decide(read("ANA RUIZ")).status, "EN_REVISION");
  assert.equal(decide(read("ANA RUIZ")).automatic, "NO_COINCIDE");
  assert.equal(decide(read(null)).automatic, "NO_COINCIDE");
  assert.equal(decide(read("JUAN PEREZ LOPEZ", false)).automatic, "CEDULA_NO_VALIDA");
  assert.equal(decide(read("JUAN PEREZ LOPEZ", false)).status, "EN_REVISION");
  const unavailable = decide({ kind: "unavailable", reason: "captcha" });
  assert.equal(unavailable.status, "EN_REVISION");
  assert.equal(unavailable.automatic, "NO_DISPONIBLE");
});

test("a CURP of another account, or a revoked account, always goes to review", () => {
  assert.equal(decide(read("JUAN PEREZ LOPEZ"), { curpUsedByAnotherUser: true }).status, "EN_REVISION");
  assert.match(decide(read("JUAN PEREZ LOPEZ"), { curpUsedByAnotherUser: true }).reason ?? "", /otra cuenta/);
  assert.equal(decide(read("JUAN PEREZ LOPEZ"), { previouslyRevoked: true }).status, "EN_REVISION");
});

/* ------------------------------------------------------------------ */
/*  Notice rules                                                       */
/* ------------------------------------------------------------------ */

test("the notice prints for every state but ACREDITADO", () => {
  assert.equal(requiresUnaccreditedNotice("ACREDITADO"), false);
  for (const status of ["NO_ACREDITADO", "EN_REVISION", "RECHAZADO", null, undefined] as const) {
    assert.equal(requiresUnaccreditedNotice(status), true, String(status));
  }
});

test("the issuer is the responsible user, or the creator when there is none", () => {
  assert.equal(valuationIssuerUserId({ IdUsuarioResponsable: 7, IdUsuarioCreador: 3 }), 7);
  assert.equal(valuationIssuerUserId({ IdUsuarioResponsable: null, IdUsuarioCreador: 3 }), 3);
});

test("the notice text is the one agreed, word for word", () => {
  assert.equal(UNACCREDITED_NOTICE_TITLE, "AVISO: DOCUMENTO SIN VALIDEZ OFICIAL");
  assert.equal(
    UNACCREDITED_NOTICE_BODY,
    "El presente documento constituye únicamente una estimación u opinión de valor, debido a que no se ha acreditado una cédula profesional o registro oficial vigente que respalde la facultad de su emisor para realizar avalúos. Por lo tanto, carece de validez oficial y no deberá considerarse como un avalúo certificado ni como una determinación acreditada del valor de mercado del inmueble.",
  );
});

/* ------------------------------------------------------------------ */
/*  Reading the QR                                                     */
/* ------------------------------------------------------------------ */

const qrPng = (text: string, scale: number) => QRCode.toBuffer(text, { type: "png", margin: scale === 1 ? 0 : 4, scale });

test("the QR is read from a photo-like JPEG and from a tiny one-pixel-per-module PNG", async () => {
  const photo = await sharp(await qrPng(SEP_URL, 8))
    .extend({ top: 300, bottom: 200, left: 150, right: 400, background: "#e5e5e5" })
    .jpeg({ quality: 70 })
    .toBuffer();
  assert.equal(await detectUploadKind(photo), "image");
  assert.deepEqual(await readQrTexts(photo, "image"), [SEP_URL]);

  const tiny = await qrPng(SEP_URL, 1);
  assert.deepEqual(await readQrTexts(tiny, "image"), [SEP_URL]);
});

test("the QR is read from the images a PDF embeds (PNG and JPEG) and from its links", async () => {
  for (const format of ["png", "jpeg"] as const) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    page.drawText("Constancia de prueba (datos ficticios)", { x: 50, y: 720, size: 12 });
    const png = await qrPng(SEP_URL, 6);
    const image = format === "png" ? await pdf.embedPng(png) : await pdf.embedJpg(await sharp(png).jpeg().toBuffer());
    page.drawImage(image, { x: 420, y: 60, width: 130, height: 130 });
    const bytes = await pdf.save();
    assert.equal(await detectUploadKind(bytes), "pdf");
    assert.deepEqual(await readQrTexts(bytes, "pdf"), [SEP_URL], format);
  }

  const linked = await PDFDocument.create();
  const page = linked.addPage([612, 792]);
  const annotation = linked.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [50, 50, 200, 70],
    A: { Type: "Action", S: "URI", URI: PDFString.of(SEP_URL) },
  });
  page.node.set(PDFName.of("Annots"), linked.context.obj([linked.context.register(annotation)]));
  assert.deepEqual(await readQrTexts(await linked.save(), "pdf"), [SEP_URL]);
});

test("a file that is neither a PDF nor an image is not read; one without a QR reads nothing", async () => {
  assert.equal(await detectUploadKind(Buffer.from("hola, no soy un archivo")), null);
  const blank = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#ffffff" } }).png().toBuffer();
  assert.deepEqual(await readQrTexts(blank, "image"), []);
});
