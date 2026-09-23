import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, Plus, SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { ValuationsFilters } from "@/features/dashboard/components/valuations-filters";
import { ValuationsTable } from "@/features/dashboard/components/valuations-table";
import {
  VALUATION_LIST_PAGE_SIZE,
  buildValuationListHref,
  parseValuationListParams,
  totalPages,
} from "@/features/dashboard/valuation-list-params";
import {
  listValuationStatuses,
  listValuationsPage,
} from "@/features/valuations/repositories/valuation.repository";
import { cn } from "@/lib/utils";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = {
  title: "Avalúos",
  robots: { index: false, follow: false },
};

export default async function ValuationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession("/avaluos");
  if (!hasPermission(user, AUTH_PERMISSIONS.viewValuations)) redirect("/dashboard");

  const statuses = await listValuationStatuses();
  const params = parseValuationListParams(
    await searchParams,
    statuses.map((status) => status.key),
  );
  const { items, total } = await listValuationsPage({
    organizationId: user.organizationId,
    page: params.page,
    pageSize: VALUATION_LIST_PAGE_SIZE,
    q: params.q,
    status: params.status,
  });

  const pages = totalPages(total);
  if (total > 0 && params.page > pages) redirect(buildValuationListHref({ ...params, page: pages }));

  const canCreate = hasPermission(user, AUTH_PERMISSIONS.createValuations);
  const hasFilters = Boolean(params.q || params.status);
  const firstItem = total === 0 ? 0 : (params.page - 1) * VALUATION_LIST_PAGE_SIZE + 1;
  const lastItem = Math.min(params.page * VALUATION_LIST_PAGE_SIZE, total);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} active="avaluos" />

      <main className="mx-auto max-w-[1760px] px-4 py-8 lg:px-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Avalúos</h1>
            <p className="mt-1 text-sm text-muted-foreground">{user.organizationName}</p>
          </div>
          {canCreate ? (
            <Link href="/workspace?action=new" className={cn(buttonVariants(), "h-9 gap-1.5 self-start px-3 sm:self-auto")}>
              <Plus className="size-4" />
              Nuevo avalúo
            </Link>
          ) : null}
        </div>

        <Card className="rounded-2xl border-0 shadow-md shadow-primary/[0.03]">
          <CardContent className="grid gap-4 p-4 sm:p-6">
            <ValuationsFilters q={params.q} status={params.status} statuses={statuses} />

            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                {hasFilters ? (
                  <>
                    <SearchX className="size-8 text-muted-foreground/40" aria-hidden="true" />
                    <p className="text-sm font-medium">Ningún avalúo coincide con la búsqueda</p>
                    <p className="text-xs text-muted-foreground">Prueba con otro folio, título, cliente o estado.</p>
                    <Link href="/avaluos" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}>
                      Limpiar filtros
                    </Link>
                  </>
                ) : (
                  <>
                    <FileText className="size-8 text-muted-foreground/40" aria-hidden="true" />
                    <p className="text-sm font-medium">Aún no hay avalúos</p>
                    <p className="text-xs text-muted-foreground">
                      {canCreate
                        ? "Crea tu primer avalúo para empezar."
                        : "Cuando tu organización cree avalúos aparecerán aquí."}
                    </p>
                    {canCreate ? (
                      <Link href="/workspace?action=new" className={cn(buttonVariants({ size: "sm" }), "mt-2 gap-1.5")}>
                        <Plus className="size-3.5" />
                        Nuevo avalúo
                      </Link>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <>
                <ValuationsTable items={items} />
                <nav
                  aria-label="Paginación"
                  className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
                >
                  <p>
                    {firstItem}–{lastItem} de {total} {total === 1 ? "avalúo" : "avalúos"} · Página {params.page} de {pages}
                  </p>
                  <div className="flex gap-2">
                    <PageLink href={buildValuationListHref({ ...params, page: params.page - 1 })} disabled={params.page <= 1}>
                      <ChevronLeft className="size-4" />
                      Anterior
                    </PageLink>
                    <PageLink href={buildValuationListHref({ ...params, page: params.page + 1 })} disabled={params.page >= pages}>
                      Siguiente
                      <ChevronRight className="size-4" />
                    </PageLink>
                  </div>
                </nav>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className = cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1 rounded-lg");
  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(className, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
