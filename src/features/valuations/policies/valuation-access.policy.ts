import type { ValuationDetail } from "@/features/valuations/repositories/valuation.repository";

export type PolicyResult = { ok: true } | { ok: false; error: string; status: number };

export function requireEditableValuationPolicy(valuation: Pick<ValuationDetail, "status">): PolicyResult {
  if (valuation.status === "terminado" || valuation.status === "finalizado") {
    return { ok: false, error: "El avaluo finalizado no permite edicion", status: 409 };
  }
  return { ok: true };
}
