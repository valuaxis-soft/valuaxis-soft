import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { currentTime } from "@/features/dashboard/attention";
import { EmptyState } from "@/features/dashboard/components/empty-state";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { ValuationsFilters } from "@/features/dashboard/components/valuations-filters";
import { ValuationsTable } from "@/features/dashboard/components/valuations-table";
import { NEW_VALUATION_HREF } from "@/features/dashboard/navigation";
import {
  VALUATION_LIST_PAGE_SIZE,
  buildValuationListHref,
  parseValuationListParams,
  totalPages,
} from "@/features/dashboard/valuation-list-params";
import { getStatusPresentation } from "@/features/dashboard/valuation-status";
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
    archived: params.archived,
    sort: params.sort,
    direction: params.direction,
  });

  const pages = totalPages(total);
  if (total > 0 && params.page > pages) redirect(buildValuationListHref({ ...params, page: pages }));

  const canCreate = hasPermission(user, AUTH_PERMISSIONS.createValuations);
  const canEdit = hasPermission(user, AUTH_PERMISSIONS.editValuations);
  const hasFilters = Boolean(params.q || params.status || params.archived);
  const firstItem = total === 0 ? 0 : (params.page - 1) * VALUATION_LIST_PAGE_SIZE + 1;
  const lastItem = Math.min(params.page * VALUATION_LIST_PAGE_SIZE, total);
  const onlyArchived = params.archived && !params.q && !params.status;
  const statusLabel = params.status ? getStatusPresentation(params.status).label.toLowerCase() : null;

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} active="avaluos" />

      <PageContainer>
        <PageHeader
          title={params.archived ? "Avalúos archivados" : "Avalúos"}
          description={
            params.archived
              ? "Los que apartaste de la lista principal. Desde el menú ··· los devuelves."
              : `Todos los avalúos de ${user.organizationName}. Abre uno para continuar o usa el menú ··· para duplicarlo o archivarlo.`
          }
          actions={
            canCreate ? (
              <Link href={NEW_VALUATION_HREF} className={cn(buttonVariants(), "h-11 gap-2 px-4 sm:h-10")}>
                <Plus className="size-4" aria-hidden="true" />
                Nuevo avalúo
              </Link>
            ) : null
          }
        />

        <section aria-label="Lista de avalúos" className="grid gap-4 rounded-2xl border border-border bg-card p-3 sm:p-5">
          <ValuationsFilters
            q={params.q}
            status={params.status}
            statuses={statuses}
            archived={params.archived}
            sort={params.sort}
            direction={params.direction}
          />

          {items.length === 0 ? (
            hasFilters ? (
              <EmptyState
                illustration="search"
                title={onlyArchived ? "No hay avalúos archivados" : "Ningún avalúo coincide con la búsqueda"}
                description={
                  onlyArchived
                    ? "Cuando archives uno desde el menú ··· de su renglón, lo encontrarás aquí."
                    : `Prueba con otro folio, título o cliente${statusLabel ? `, o quita el filtro «${statusLabel}»` : ""}.`
                }
                action={
                  <Link href="/avaluos" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4 sm:h-9")}>
                    Limpiar filtros
                  </Link>
                }
              />
            ) : (
              <EmptyState
                illustration="valuations"
                title="Aún no hay avalúos"
                description={
                  canCreate
                    ? "Crea tu primer avalúo: eliges el tipo y una plantilla, y el folio se asigna solo."
                    : "Cuando tu despacho cree avalúos, aparecerán aquí."
                }
                action={
                  canCreate ? (
                    <Link href={NEW_VALUATION_HREF} className={cn(buttonVariants(), "h-11 gap-2 px-4 sm:h-9")}>
                      <Plus className="size-4" aria-hidden="true" />
                      Crear mi primer avalúo
                    </Link>
                  ) : null
                }
              />
            )
          ) : (
            <>
              <ValuationsTable items={items} params={params} canCreate={canCreate} canDelete={canEdit} now={currentTime()} />
              <nav
                aria-label="Paginación"
                className="flex flex-col gap-3 border-t border-border pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
              >
                <p aria-live="polite">
                  <span className="font-medium text-foreground">
                    {firstItem}–{lastItem}
                  </span>{" "}
                  de {total} {total === 1 ? "avalúo" : "avalúos"}
                  {pages > 1 ? ` · Página ${params.page} de ${pages}` : ""}
                </p>
                {pages > 1 ? (
                  <div className="flex gap-2">
                    <PageLink href={buildValuationListHref({ ...params, page: params.page - 1 })} disabled={params.page <= 1}>
                      <ChevronLeft className="size-4" aria-hidden="true" />
                      Anterior
                    </PageLink>
                    <PageLink href={buildValuationListHref({ ...params, page: params.page + 1 })} disabled={params.page >= pages}>
                      Siguiente
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </PageLink>
                  </div>
                ) : null}
              </nav>
            </>
          )}
        </section>
      </PageContainer>
    </div>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className = cn(buttonVariants({ variant: "outline" }), "h-11 flex-1 gap-1 rounded-lg px-3 sm:h-8 sm:flex-none");
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
