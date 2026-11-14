import type { Metadata } from "next";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { NotificationsPageList } from "@/features/notifications/components/notifications-page-list";
import { listNotifications } from "@/features/notifications/notifications.service";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Notificaciones" };

/** The person's notices in the open firm and their personal ones, the latest 50 of the last 90 days. Any role. */
export default async function NotificationsPage() {
  const user = await requireSession("/notificaciones");
  const initial = await listNotifications(user, { limit: 50 });

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} />
      <PageContainer width="narrow">
        <PageHeader title="Notificaciones" description={`Lo que pasó en ${user.organizationName} y en tu cuenta.`} />
        <NotificationsPageList initial={initial} />
      </PageContainer>
    </div>
  );
}
