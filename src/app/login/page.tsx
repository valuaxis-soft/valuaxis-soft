export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; redirectTo?: string }>;
}) {
  const { redirect } = await import("next/navigation");
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.reason) query.set("reason", params.reason);
  if (params.redirectTo) query.set("redirectTo", params.redirectTo);
  redirect(`/iniciar-sesion${query.size ? `?${query.toString()}` : ""}`);
}
