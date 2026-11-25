import { createHash } from "node:crypto";

/** SHA-256 of a document's text as UTF-8, hex: the fingerprint stored beside every version (matrix 3.1). */
export const legalTextHash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
