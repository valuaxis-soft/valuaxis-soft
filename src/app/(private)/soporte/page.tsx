import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { todayInMexico } from "@/features/firm/firm-rules";
import { FailureReportForm } from "@/features/support/components/failure-report-form";
import { FailureReportList } from "@/features/support/components/failure-report-list";
import { listFailureReports } from "@/features/support/failure-report.service";
import { SUPPORT_CONTACT, SUPPORT_HREF, SUPPORT_PENDING_TEXT, whatsappLink } from "@/features/support/support-contact";
import { prisma } from "@/infrastructure/database/prisma-client";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Ayuda y soporte" };

/**
 * «Ayuda y soporte» (matrix 1.9): the support email and WhatsApp, the form to
 * report a failure and the user's own reports with their responses. Any role.
 */
export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSession(SUPPORT_HREF);
  const requested = (await searchParams).avaluo;
  const [valuations, reports] = await Promise.all([
    prisma.avaluo.findMany({
      where: { IdOrganizacion: user.organizationId, BActivo: true, DFechaEliminacion: null },
      orderBy: { DFechaModificacion: "desc" },
      take: 100,
      select: { UIdentificadorPublico: true, SFolio: true, STitulo: true },
    }),
    listFailureReports({ userId: user.id, take: 50 }),
  ]);
  const options = valuations.map((valuation) => ({ id: valuation.UIdentificadorPublico, label: [valuation.SFolio, valuation.STitulo].filter(Boolean).join(" · ") }));
  const initialValuationId = typeof requested === "string" && options.some((option) => option.id === requested) ? requested : null;
  const whatsapp = SUPPORT_CONTACT.whatsapp ? whatsappLink(SUPPORT_CONTACT.whatsapp) : null;

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} />
      <PageContainer width="narrow">
        <PageHeader title="Ayuda y soporte" description="Escríbenos por correo o WhatsApp, o reporta una falla con el avalúo, la fecha y lo que pasó." />
        <div className="grid gap-6">
          <Card data-support-contact="">
            <CardHeader>
              <CardTitle>Contacto de soporte</CardTitle>
              <CardDescription>Para dudas, soporte y quejas.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">Correo:</span>
                {SUPPORT_CONTACT.email
                  ? <a className="text-primary underline-offset-2 hover:underline" href={`mailto:${SUPPORT_CONTACT.email}`}>{SUPPORT_CONTACT.email}</a>
                  : <span className="text-muted-foreground">{SUPPORT_PENDING_TEXT}</span>}
              </p>
              <p className="flex items-center gap-2">
                <MessageCircle className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">WhatsApp:</span>
                {whatsapp
                  ? <a className="text-primary underline-offset-2 hover:underline" href={whatsapp} target="_blank" rel="noopener noreferrer">{SUPPORT_CONTACT.whatsapp}</a>
                  : <span className="text-muted-foreground">{SUPPORT_PENDING_TEXT}</span>}
              </p>
            </CardContent>
          </Card>

          <Card id="reportar-falla">
            <CardHeader>
              <CardTitle>Reportar una falla</CardTitle>
              <CardDescription>Revisamos cada reporte y registramos la respuesta, que verás abajo.</CardDescription>
            </CardHeader>
            <CardContent>
              <FailureReportForm valuations={options} today={todayInMexico()} initialValuationId={initialValuationId} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mis reportes</CardTitle>
            </CardHeader>
            <CardContent>
              <FailureReportList reports={reports} />
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </div>
  );
}
