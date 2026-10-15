/**
 * A failure the caller can explain to the user: its message is safe to return.
 * Any other error from this service is internal and must not reach the client.
 */
export class ValuationWorkflowError extends Error {
  /** A page in the app where the user can fix the failure (e.g. buy credits), offered next to the message. */
  readonly link: string | null;

  constructor(message: string, readonly status: 400 | 404 | 409 | 413 | 500 | 502, options: { link?: string } = {}) {
    super(message);
    this.name = "ValuationWorkflowError";
    this.link = options.link ?? null;
  }
}
