/**
 * The print rules a dictamen follows. A concluded valuation never changes,
 * whatever the update (Álvaro): it prints with the rules it was concluded
 * with. Concluding stamps the current version in the version's
 * `JConfiguracionCalculo`; one concluded before the stamp existed is 0. A
 * draft always prints with the current rules.
 *
 * Rule: any later change to what a concluded dictamen prints (a renderer, a
 * read in the repository, a template a saved valuation reads) adds a numbered
 * entry below, raises CURRENT_PRINT_VERSION and is gated with
 * `printsWith(version, n)`, keeping the old output for older versions.
 *
 * 1. Dictamen review of 14 Nov 2026: the construction section prints the
 *    concepts and images of its blocks, in the document's type (B-01, B-13),
 *    and long titles read whole instead of cut by their column (B-14).
 */
export const CURRENT_PRINT_VERSION = 1;

const PRINT_VERSION_KEY = "dictamenPrintVersion";

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Whether a dictamen with print rules `version` prints what entry `rule` added. */
export const printsWith = (version: number, rule: number) => version >= rule;

/** The print rules of a version: the current ones while it is a draft, the stamped ones once concluded. */
export function printVersionOf(config: unknown, concluded: boolean): number {
  if (!concluded) return CURRENT_PRINT_VERSION;
  const stamped = record(config)[PRINT_VERSION_KEY];
  return typeof stamped === "number" && Number.isInteger(stamped) ? stamped : 0;
}

/** The version's configuration with the current print rules stamped, the rest kept. */
export function withPrintVersion(config: unknown): Record<string, unknown> {
  return { ...record(config), [PRINT_VERSION_KEY]: CURRENT_PRINT_VERSION };
}
