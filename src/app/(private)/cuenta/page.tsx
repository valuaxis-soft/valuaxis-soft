import type { Metadata } from "next";
import { getAccreditation } from "@/features/accreditation/accreditation.service";
import { AccreditationSection } from "@/features/accreditation/components/accreditation-section";
import { AccountClosureSection } from "@/features/account/components/account-closure-section";
import { AutosavePreferenceSection } from "@/features/account/components/autosave-preference-section";
import { NotificationPreferencesSection } from "@/features/account/components/notification-preferences-section";
import { PhoneVerificationSection } from "@/features/account/components/phone-verification-section";
import { getPhoneVerification } from "@/features/account/phone/phone-verification.service";
import { getAccountPreferences } from "@/features/account/user-preferences.service";
import { PrivacySection } from "@/features/legal/components/privacy-section";
import { getLegalAcceptanceContext, getPrivacyOverview } from "@/features/legal/consent.service";
import { arcoEmailFrom } from "@/features/legal/privacy-facts";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Mi cuenta" };

/** The signed-in person's own account: the verified phone, the professional accreditation, the editor's autosave, the notifications, privacy and what closing it means for the balance. Any role. */
export default async function AccountPage() {
  const user = await requireSession("/cuenta");
  const [accreditation, preferences, phone, privacy, legal] = await Promise.all([
    getAccreditation(user.id),
    getAccountPreferences(user.id),
    getPhoneVerification(user.id),
    getPrivacyOverview(user.id),
    getLegalAcceptanceContext(),
  ]);
  const integralNotice = legal.versions.find((version) => version.documento === "privacidad-integral");

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} active="cuenta" />
      <PageContainer width="narrow">
        <PageHeader title="Mi cuenta" description={`${user.name} · ${user.email}`} />
        <div className="grid gap-6">
          <PhoneVerificationSection initial={phone} />
          <AccreditationSection initial={accreditation} />
          <AutosavePreferenceSection initialSeconds={preferences.autosaveSeconds} />
          <NotificationPreferencesSection initial={preferences.notifications} />
          <PrivacySection initial={privacy.optional} boxTexts={legal.boxTexts} history={privacy.history} arcoEmail={arcoEmailFrom(integralNotice?.text)} />
          <AccountClosureSection />
        </div>
      </PageContainer>
    </div>
  );
}
