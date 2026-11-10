import type { Metadata } from "next";
import { getAccreditation } from "@/features/accreditation/accreditation.service";
import { AccreditationSection } from "@/features/accreditation/components/accreditation-section";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Mi cuenta" };

/** The signed-in person's own account: for now, the professional accreditation. Any role. */
export default async function AccountPage() {
  const user = await requireSession("/cuenta");
  const accreditation = await getAccreditation(user.id);

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} active="cuenta" />
      <PageContainer width="narrow">
        <PageHeader title="Mi cuenta" description={`${user.name} · ${user.email}`} />
        <AccreditationSection initial={accreditation} />
      </PageContainer>
    </div>
  );
}
