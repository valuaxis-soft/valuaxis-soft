/**
 * Test-only shim for server-side rendering of preview components.
 *
 * AutoPaginatedDocumentFlow renders a hidden measurement layer through
 * `createPortal(..., document.body)`. react-dom/server cannot render portals
 * and Node has no `document`, so these tests replace the portal with nothing.
 * The visible preview pages are still rendered normally.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const reactDom = require("react-dom") as { createPortal: (...args: unknown[]) => unknown };

reactDom.createPortal = () => null;

const globalWithDocument = globalThis as { document?: unknown };
if (typeof globalWithDocument.document === "undefined") {
  globalWithDocument.document = { body: {} };
}
