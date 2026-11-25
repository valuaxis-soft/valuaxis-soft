import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { ValuaxisLogo } from "@/components/brand/valuaxis-logo";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions/logout.action";
import { LegalAcceptanceForm } from "@/features/legal/components/legal-acceptance-form";
import { SimplifiedNoticePanel } from "@/features/legal/components/simplified-notice-panel";
import { getAcceptanceGate, getLegalAcceptanceContext } from "@/features/legal/consent.service";
import { LEGAL_ACCEPTANCE_PATH, LEGAL_DOCUMENT_TITLES, legalDocumentHref } from "@/features/legal/legal-documents";
import { requireSession } from "@/security/guards/require-session";
import { safeRedirectPath } from "@/security/validation/redirect-safety";

export const metadata: Metadata = { title: "Documentos legales" };

/**
 * Accounts that existed before the documents were published, or before a
 * change that asks for acceptance (matrix 1.2; Terms 3.3 and 15.2): the
 * simplified notice in full and casillas 1 and T. No private page opens until
 * they accept; they can always sign out.
 */
export default async function LegalAcceptancePage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  const { redirectTo } = await searchParams;
  const target = safeRedirectPath(redirectTo);
  const user = await requireSession(LEGAL_ACCEPTANCE_PATH, { legalGate: false });
  const gate = await getAcceptanceGate(user.id);
  if (!gate.pending.length) redirect(target);
  const legal = await getLegalAcceptanceContext();

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Valuaxis Soft, inicio" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <ValuaxisLogo className="h-9" />
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="size-4" aria-hidden="true" />
              Cerrar sesión
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-8 pb-16 sm:px-6">
        <div className="grid gap-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">Antes de continuar</h1>
          <p className="text-muted-foreground">
            Valuaxis Soft publicó sus documentos legales o los actualizó. Para seguir usando la plataforma, lee el aviso de privacidad y acepta
            los documentos con las casillas de abajo.
          </p>
          <ul className="grid gap-1 text-sm" data-pending-documents="">
            {gate.pending.map((item) => (
              <li key={item.documento}>
                <a href={legalDocumentHref(item.documento, item.version)} target="_blank" rel="noopener" className="text-brand underline underline-offset-2">
                  {LEGAL_DOCUMENT_TITLES[item.documento]}
                </a>{" "}
                <span className="text-muted-foreground tabular-nums">· versión {item.version}</span>
              </li>
            ))}
          </ul>
        </div>
        {legal.notice ? <SimplifiedNoticePanel text={legal.notice.text} link={legal.notice.link} integral={legal.links["privacidad-integral"]} /> : null}
        <LegalAcceptanceForm boxTexts={legal.boxTexts} links={legal.links} versionIds={legal.versionIds} askAdult={gate.askAdult} redirectTo={target} />
      </main>
    </div>
  );
}
