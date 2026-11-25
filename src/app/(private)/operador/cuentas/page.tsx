import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { listAccountRestrictions } from "@/features/account/standing/account-standing.service";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { AccountRestrictionsPanel } from "@/features/operator/components/account-restrictions-panel";
import { OPERATOR_ACCOUNTS_HREF, OPERATOR_USER_DIRECTORY_HREF } from "@/features/operator/operator-access";
import { cn } from "@/lib/utils";
import { requireOperatorPage } from "@/security/guards/operator-guard";

export const metadata: Metadata = {
  title: "Bajas y suspensiones",
  robots: { index: false, follow: false },
};

/**
 * Closures and suspensions of accounts, for the operator (OPERATOR_EMAILS;
 * docs/CUENTAS.md): the requests with their dates, the notices with their
 * deadline to clarify, and «Reactivar». Anyone else gets 404.
 */
export default async function OperatorAccountsPage() {
  const user = await requireOperatorPage(OPERATOR_ACCOUNTS_HREF);
  const entries = await listAccountRestrictions();
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "Operador",
    entityId: OPERATOR_ACCOUNTS_HREF,
    action: "OPERATOR_ACCOUNTS_VIEW",
    result: "OK",
    metadata: { rows: entries.length },
  });

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} />
      <PageContainer width="wide">
        <PageHeader
          eyebrow="Operación de la plataforma"
          title="Bajas y suspensiones"
          description="Las bajas que pidieron las personas, los avisos de inactividad y de suspensión con su plazo para aclarar, y las cuentas inhabilitadas o suspendidas. Reactivar devuelve el acceso con el saldo intacto: ninguna baja ni suspensión toca el saldo."
          actions={
            <Link href={OPERATOR_USER_DIRECTORY_HREF} className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4 sm:h-10")}>
              Usuarios de la plataforma
            </Link>
          }
        />
        <AccountRestrictionsPanel entries={entries} />
      </PageContainer>
    </div>
  );
}
