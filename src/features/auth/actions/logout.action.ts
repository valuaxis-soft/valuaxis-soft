"use server";

import { redirect } from "next/navigation";
import { revokeCurrentSession } from "../services/session.service";

export async function logoutAction() {
  await revokeCurrentSession();
  redirect("/iniciar-sesion");
}
