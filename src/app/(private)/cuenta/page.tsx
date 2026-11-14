import type { Metadata } from "next";
import { getAccreditation } from "@/features/accreditation/accreditation.service";
import { AccreditationSection } from "@/features/accreditation/components/accreditation-section";
import { AutosavePreferenceSection } from "@/features/account/components/autosave-preference-section";
import { NotificationPreferencesSection } from "@/features/account/components/notification-preferences-section";
import { getAccountPreferences } from "@/features/account/user-preferences.service";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Mi cuenta" };

/** The signed-in person's own account: the professional accreditation, the editor's autosave and the notifications. Any role. */
export default async function AccountPage() {
  const user = await requireSession("/cuenta");
  const [accreditation, preferences] = await Promise.all([getAccreditation(user.id), getAccountPreferences(user.id)]);

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} active="cuenta" />
      <PageContainer width="narrow">
        <PageHeader title="Mi cuenta" description={`${user.name} · ${user.email}`} />
        <div className="grid gap-6">
          <AccreditationSection initial={accreditation} />
          <AutosavePreferenceSection initialSeconds={preferences.autosaveSeconds} />
          <NotificationPreferencesSection initial={preferences.notifications} />
        </div>
      </PageContainer>
    </div>
  );
}
