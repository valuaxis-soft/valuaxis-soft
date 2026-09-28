/**
 * A failure the caller can explain to the user: its message is safe to return.
 * Any other error from this service is internal and must not reach the client.
 */
export class ValuationWorkflowError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 413 | 500 | 502) {
    super(message);
    this.name = "ValuationWorkflowError";
  }
}
