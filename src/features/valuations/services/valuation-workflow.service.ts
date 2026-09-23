/**
 * Public API of the valuation workflow. The implementation lives in
 * `./valuation-workflow/`, split by responsibility:
 * - errors: ValuationWorkflowError
 * - types: editor payloads and the transaction client type
 * - working-version: working version setup and initial section structure
 * - save-sections: saveValuationSections (sections, nodes, concepts, images, tables)
 * - document-nodes / document-tables: node, value and table persistence
 * - caratula: saveCaratula
 * - lifecycle: concludeValuation, reopenValuation
 * - db-values: database key, text and value-column helpers
 */
export { ValuationWorkflowError } from "./valuation-workflow/errors";
export type { CaratulaPayload, SectionPayload } from "./valuation-workflow/types";
export { initializeWorkingVersionStructure } from "./valuation-workflow/working-version";
export { saveCaratula } from "./valuation-workflow/caratula";
export { saveValuationSections } from "./valuation-workflow/save-sections";
export { concludeValuation, reopenValuation } from "./valuation-workflow/lifecycle";
export {
  normalizeDocumentTableColumnForPersistence,
  normalizeDocumentTableRowForPersistence,
} from "./valuation-workflow/document-tables";
export {
  emptyValueColumns,
  hasCapturableValue,
  limitDbText,
  normalizeDbKey,
  valueColumns,
} from "./valuation-workflow/db-values";
