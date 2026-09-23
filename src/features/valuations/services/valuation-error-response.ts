import { NextResponse } from "next/server";
import { internalError } from "@/lib/api-response";
import { ValuationWorkflowError } from "./valuation-workflow.service";

/** Business failures return their message; anything else is logged and hidden from the client. */
export function valuationErrorResponse(context: string, error: unknown, fallbackMessage: string) {
  if (error instanceof ValuationWorkflowError) {
    if (error.status === 500) console.error(`[${context}]`, error);
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return internalError(context, error, fallbackMessage);
}
