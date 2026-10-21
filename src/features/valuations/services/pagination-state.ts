/**
 * Every paginated flow of the document carries this attribute; its value is
 * "ready" once the pages it shows come from a measurement of the current
 * content, and "pending" while one is due. The server's PDF renderer prints
 * only when no flow is pending.
 */
export const PAGINATION_STATE_ATTRIBUTE = "data-document-pagination";
export const PAGINATION_PENDING_SELECTOR = `[${PAGINATION_STATE_ATTRIBUTE}]:not([${PAGINATION_STATE_ATTRIBUTE}="ready"])`;

/**
 * The measuring copy has boxes only on screen: it is hidden while printing
 * (print media), where every height would read 0 and fit the whole flow on
 * one page. The pages measured on screen are the ones that print.
 */
export function canMeasure(measurePage: Pick<Element, "getClientRects">): boolean {
  return measurePage.getClientRects().length > 0;
}
