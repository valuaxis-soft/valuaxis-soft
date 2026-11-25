import { NextResponse } from "next/server";
import { z } from "zod";
import { SUSPENSION_CAUSES, type SuspensionCause } from "@/features/account/standing/account-standing-rules";
import {
  AccountStandingError,
  applySuspension,
  endRestriction,
  noticeSuspension,
  recordClosureByEmail,
  recordSuspensionResponse,
} from "@/features/account/standing/account-standing.service";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireOperatorApi } from "@/security/guards/operator-guard";

const email = z.string().trim().email("Escribe un correo válido.").max(180);
const id = z.string().uuid();
const causes = Object.keys(SUSPENSION_CAUSES) as [SuspensionCause, ...SuspensionCause[]];

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("baja-por-correo"), email }).strict(),
  z
    .object({
      action: z.literal("aviso"),
      email,
      cause: z.enum(causes),
      detail: z.string().trim().max(2000).optional(),
      urgent: z.boolean(),
      blockAccess: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal("aplicar"), id }).strict(),
  z.object({ action: z.literal("respuesta"), id, response: z.string().trim().min(1, "Escribe la respuesta.").max(2000) }).strict(),
  z.object({ action: z.literal("reactivar"), id }).strict(),
  z.object({ action: z.literal("levantar"), id }).strict(),
]);

/**
 * The operator's actions on /operador/cuentas (docs/CUENTAS.md): record a
 * closure asked for by email, notice or apply a suspension, write down the
 * person's answer, and reactivate or lift. Operator only (OPERATOR_EMAILS);
 * anyone else gets 404. Every action is audited.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireOperatorApi("/api/operador/cuentas");
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, actionSchema, { maxBytes: 10_000 });
    if (!body.ok) return body.response;
    const operator = { id: auth.user.id, organizationId: auth.user.organizationId };
    const input = body.data;

    const data =
      input.action === "baja-por-correo"
        ? await recordClosureByEmail(operator, input.email)
        : input.action === "aviso"
          ? await noticeSuspension(operator, input)
          : input.action === "aplicar"
            ? await applySuspension(operator, input.id)
            : input.action === "respuesta"
              ? await recordSuspensionResponse(operator, input.id, input.response)
              : await endRestriction(operator, input.id, input.action === "reactivar" ? "REACTIVACION" : "ACLARADA");
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AccountStandingError) return NextResponse.json({ error: error.message }, { status: error.status });
    return internalError("OPERATOR_ACCOUNTS", error, "No se pudo completar la acción.");
  }
}
