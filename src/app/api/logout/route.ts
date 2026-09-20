import { NextResponse } from "next/server";
import { clearUserSession } from "@/features/auth/session";
import { buildPublicAppUrl } from "@/lib/public-url";

export async function POST() {
  await clearUserSession();
  return NextResponse.redirect(buildPublicAppUrl("/iniciar-sesion"));
}
