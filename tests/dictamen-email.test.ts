import assert from "node:assert/strict";
import { test } from "node:test";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { buildDictamenEmailHtml, defaultDictamenSubject } from "../src/features/notifications/templates/dictamen-email";
import { buildValuationNoticeSubject } from "../src/features/notifications/templates/valuation-notice";
import { dictamenEmailSchema } from "../src/features/valuations/validations/dictamen-email.schema";
import { AmazonSesEmailService } from "../src/infrastructure/email/amazon-ses-email.service";
import { buildMimeMessage, encodeHeaderText, formatMailbox } from "../src/infrastructure/email/mime-message";

/** Splits a raw message into headers and the decoded parts of each MIME section. */
function parse(raw: string) {
  const [head] = raw.split("\r\n\r\n");
  const headers = Object.fromEntries(head.split("\r\n").map((line) => {
    const index = line.indexOf(":");
    return [line.slice(0, index), line.slice(index + 1).trim()];
  }));
  const parts = raw.split(/\r\n--[\w-]+(?:--)?\r\n/).slice(1).map((section) => {
    const [partHead, ...body] = section.split("\r\n\r\n");
    return { head: partHead, body: Buffer.from(body.join("\r\n\r\n").replace(/\r\n/g, ""), "base64") };
  });
  return { headers, parts };
}

const pdf = Buffer.from("%PDF-1.7 contenido de prueba ".repeat(200));

test("the MIME message carries both bodies and the PDF, with encoded headers", () => {
  const raw = buildMimeMessage({
    from: { name: "Valuadores de los Altos", email: "no-reply@example.test" },
    to: ["cliente@example.test", "otro@example.test"],
    replyTo: "contacto@despacho.mx",
    subject: "Dictamen de avalúo VDA-0001",
    text: "Le compartimos el dictamen.",
    html: "<p>Le compartimos el dictamen.</p>",
    attachments: [{ filename: "Dictamen-VDA-0001.pdf", contentType: "application/pdf", content: pdf }],
  }).toString("utf8");
  const { headers, parts } = parse(raw);

  assert.equal(headers.From, '"Valuadores de los Altos" <no-reply@example.test>');
  assert.equal(headers.To, "cliente@example.test, otro@example.test");
  assert.equal(headers["Reply-To"], "contacto@despacho.mx");
  assert.equal(headers.Subject, encodeHeaderText("Dictamen de avalúo VDA-0001"));
  assert.match(headers.Subject, /^=\?UTF-8\?B\?/);
  const text = parts.find((part) => part.head.includes("text/plain"));
  const attachment = parts.find((part) => part.head.includes("application/pdf"));
  assert.equal(text?.body.toString("utf8"), "Le compartimos el dictamen.");
  assert.match(attachment?.head ?? "", /filename="Dictamen-VDA-0001\.pdf"/);
  assert.ok(attachment?.body.equals(pdf));
  assert.ok(raw.split("\r\n").every((line) => line.length <= 998), "no line over the RFC limit");
});

test("header injection is not possible through names or subjects", () => {
  assert.equal(formatMailbox('Despacho"\r\nBcc: x@y', "a@b.mx"), '"DespachoBcc: x@y" <a@b.mx>');
  assert.equal(encodeHeaderText("Hola\r\nBcc: x@y"), "Hola Bcc: x@y");
  assert.match(formatMailbox("Peritos Núñez", "a@b.mx"), /^=\?UTF-8\?B\?.+\?= <a@b\.mx>$/);
});

test("Amazon SES sends the dictamen as a raw message in the firm's name", async () => {
  const commands: SendEmailCommand[] = [];
  const service = new AmazonSesEmailService(
    { async send(command) { commands.push(command); return {}; } },
    { region: "us-east-1", accessKeyId: "k", secretAccessKey: "s", fromEmail: "no-reply@example.test", fromName: "Valuaxis" },
  );
  await service.sendDictamenEmail({
    to: ["cliente@example.test"],
    replyTo: "contacto@despacho.mx",
    subject: defaultDictamenSubject("VDA-0001", "Valuadores de los Altos"),
    message: "Buen día,\n\nLe compartimos el dictamen.",
    folio: "VDA-0001",
    firm: { name: "Valuadores de los Altos", phone: "33 1111 1111", email: "contacto@despacho.mx" },
    pdf: { filename: "Dictamen-VDA-0001.pdf", content: pdf },
  });
  const input = commands[0].input;
  assert.deepEqual(input.Destination?.ToAddresses, ["cliente@example.test"]);
  assert.deepEqual(input.ReplyToAddresses, ["contacto@despacho.mx"]);
  const raw = Buffer.from(input.Content?.Raw?.Data ?? new Uint8Array()).toString("utf8");
  assert.match(raw, /^From: "Valuadores de los Altos" <no-reply@example\.test>/m);
  assert.match(raw, /filename="Dictamen-VDA-0001\.pdf"/);
});

test("the client's message keeps its paragraphs and cannot inject HTML", () => {
  const html = buildDictamenEmailHtml({
    message: "Buen día,\n\n<script>alert(1)</script>\nSaludos",
    folio: "VDA-0001",
    firm: { name: "Despacho", phone: null, email: "a@b.mx" },
  });
  assert.match(html, /<p>Buen día,<\/p><p>&lt;script&gt;alert\(1\)&lt;\/script&gt;<br>Saludos<\/p>/);
  assert.match(html, /a@b\.mx/);
});

test("recipients are validated, lowercased and deduplicated", () => {
  const parsed = dictamenEmailSchema.parse({ to: ["Cliente@Example.test", "cliente@example.test"], subject: "Asunto", message: "Mensaje" });
  assert.deepEqual(parsed.to, ["cliente@example.test"]);
  assert.equal(dictamenEmailSchema.safeParse({ to: [], subject: "a", message: "b" }).success, false);
  assert.equal(dictamenEmailSchema.safeParse({ to: ["x@y.mx", "no-es-correo"], subject: "a", message: "b" }).success, false);
  assert.equal(dictamenEmailSchema.safeParse({ to: Array.from({ length: 6 }, (_, i) => `p${i}@y.mx`), subject: "a", message: "b" }).success, false);
});

test("notices say who did what", () => {
  const base = { recipientName: "Mariana", actorName: "Álvaro", folio: "VDA-0007", title: "Casa", organizationName: "Despacho", valuationUrl: "https://x" };
  assert.equal(buildValuationNoticeSubject({ ...base, kind: "asignado" }), "Álvaro te asignó el avalúo VDA-0007 · Valuaxis");
  assert.equal(buildValuationNoticeSubject({ ...base, kind: "concluido" }), "Álvaro concluyó el avalúo VDA-0007 · Valuaxis");
});
