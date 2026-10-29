import type { Metadata } from "next";
import { getAccreditation } from "@/features/accreditation/accreditation.service";
import { AccreditationSection } from "@/features/accreditation/components/accreditation-section";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Mi cuenta" };

/** The signed-in person's own account: for now, the professional accreditation. Any role. */
export default async function AccountPage() {
  const user = await requireSession("/cuenta");
  const accreditation = await getAccreditation(user.id);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Mi cuenta</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.name} · {user.email}
          </p>
        </div>
        <AccreditationSection initial={accreditation} />
      </main>
    </div>
  );
}
