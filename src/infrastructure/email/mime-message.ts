/**
 * A raw MIME message (RFC 5322 / 2045) with a text and an HTML body and
 * optional attachments, for providers that take the whole message, such as
 * Amazon SES with attachments. Headers with non-ASCII text are encoded.
 */
import { randomUUID } from "node:crypto";

export type MimeAttachment = { filename: string; contentType: string; content: Buffer };

export type MimeMessageInput = {
  from: { name: string; email: string };
  to: string[];
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
  attachments?: MimeAttachment[];
};

const CRLF = "\r\n";

/** Header text: plain ASCII as is, anything else as an RFC 2047 encoded word. */
export function encodeHeaderText(value: string) {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

export function formatMailbox(name: string, email: string) {
  const safeEmail = email.replace(/[\r\n<>]/g, "").trim();
  const safeName = name.replace(/[\r\n"]/g, "").trim();
  if (!safeName) return safeEmail;
  const encoded = encodeHeaderText(safeName);
  return encoded === safeName ? `"${safeName}" <${safeEmail}>` : `${encoded} <${safeEmail}>`;
}

/** Base64 in lines of 76 characters, as MIME requires. */
const base64Lines = (content: Buffer) => content.toString("base64").replace(/.{76}/g, `$&${CRLF}`);

const safeFilename = (filename: string) => filename.replace(/["\r\n\\]/g, "_");

export function buildMimeMessage(input: MimeMessageInput): Buffer {
  const mixed = `mixed-${randomUUID()}`;
  const alternative = `alt-${randomUUID()}`;
  const headers = [
    `From: ${formatMailbox(input.from.name, input.from.email)}`,
    `To: ${input.to.map((address) => address.replace(/[\r\n,<>]/g, "").trim()).join(", ")}`,
    ...(input.replyTo ? [`Reply-To: ${input.replyTo.replace(/[\r\n<>]/g, "").trim()}`] : []),
    `Subject: ${encodeHeaderText(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
  ];
  const parts = [
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    "",
    `--${alternative}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(input.text, "utf8")),
    `--${alternative}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(input.html, "utf8")),
    `--${alternative}--`,
    ...(input.attachments ?? []).flatMap((attachment) => [
      `--${mixed}`,
      `Content-Type: ${attachment.contentType}; name="${safeFilename(attachment.filename)}"`,
      `Content-Disposition: attachment; filename="${safeFilename(attachment.filename)}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(attachment.content),
    ]),
    `--${mixed}--`,
    "",
  ];
  return Buffer.from([...headers, "", ...parts].join(CRLF), "utf8");
}
