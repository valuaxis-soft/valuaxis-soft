import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/iniciar-sesion?reason=required");
  redirect("/dashboard");
}
