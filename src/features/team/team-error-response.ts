import { NextResponse } from "next/server";
import { internalError } from "@/lib/api-response";
import { TeamError } from "./team.service";

/** Business failures return their message; anything else is logged and hidden from the client. */
export function teamErrorResponse(context: string, error: unknown, fallbackMessage: string) {
  if (error instanceof TeamError) return NextResponse.json({ error: error.message }, { status: error.status });
  return internalError(context, error, fallbackMessage);
}
