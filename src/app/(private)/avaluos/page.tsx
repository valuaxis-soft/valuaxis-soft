import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getUserPreferences } from "@/features/account/user-preferences.service";
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
  hasValuationFilters,
  parseValuationListParams,
  totalPages,
} from "@/features/dashboard/valuation-list-params";
import { listValuationStatuses } from "@/features/valuations/repositories/valuation.repository";
import {
  TRASH_RETENTION_DAYS,
  listValuationAppraisers,
  listValuationKinds,
  listValuationsPage,
} from "@/features/valuations/repositories/valuation-list.repository";
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

  const [statuses, kinds, appraisers, preferences] = await Promise.all([
    listValuationStatuses(),
    listValuationKinds(),
    listValuationAppraisers(user.organizationId),
    getUserPreferences(user.id),
  ]);
  const params = parseValuationListParams(
    await searchParams,
    statuses.map((status) => status.key),
  );
  const { items, total } = await listValuationsPage({
    ...params,
    organizationId: user.organizationId,
    pageSize: VALUATION_LIST_PAGE_SIZE,
  });

  const pages = totalPages(total);
  if (total > 0 && params.page > pages) redirect(buildValuationListHref({ ...params, page: pages }));

  const canCreate = hasPermission(user, AUTH_PERMISSIONS.createValuations);
  const permissions = {
    canCreate,
    canEdit: hasPermission(user, AUTH_PERMISSIONS.editValuations),
    canPurge: hasPermission(user, AUTH_PERMISSIONS.purgeValuations),
    canExport: hasPermission(user, AUTH_PERMISSIONS.exportValuations),
  };
  const hasFilters = hasValuationFilters(params);
  const firstItem = total === 0 ? 0 : (params.page - 1) * VALUATION_LIST_PAGE_SIZE + 1;
  const lastItem = Math.min(params.page * VALUATION_LIST_PAGE_SIZE, total);

  const title = params.trash ? "Papelera de avalúos" : params.archived ? "Avalúos archivados" : "Avalúos";
  const description = params.trash
    ? `Los avalúos eliminados esperan aquí ${TRASH_RETENTION_DAYS} días: desde el menú ··· los restauras tal como estaban. Después se eliminan definitivamente.`
    : params.archived
      ? "Los que apartaste de la lista principal. Desde el menú ··· los devuelves."
      : `Todos los avalúos de ${user.organizationName}. Abre uno para continuar o usa el menú ··· para ver su historial, duplicarlo o archivarlo.`;

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} active="avaluos" />

      <PageContainer>
        <PageHeader
          title={title}
          description={description}
          actions={
            canCreate && !params.trash ? (
              <Link href={NEW_VALUATION_HREF} className={cn(buttonVariants(), "h-11 gap-2 px-4 sm:h-10")}>
                <Plus className="size-4" aria-hidden="true" />
                Nuevo avalúo
              </Link>
            ) : null
          }
        />

        <section aria-label="Lista de avalúos" className="grid gap-4 rounded-2xl border border-border bg-card p-3 sm:p-5">
          <ValuationsFilters
            params={params}
            statuses={statuses}
            propertyKinds={kinds.propertyKinds}
            appraisalKinds={kinds.appraisalKinds}
            appraisers={appraisers}
          />

          {items.length === 0 ? (
            hasFilters || params.archived || params.trash ? (
              <EmptyState
                illustration="search"
                title={
                  hasFilters
                    ? "Ningún avalúo coincide con los filtros"
                    : params.trash ? "La papelera está vacía" : "No hay avalúos archivados"
                }
                description={
                  hasFilters
                    ? "Prueba con otro folio, título o cliente, o quita algún filtro."
                    : params.trash
                      ? `Cuando elimines un avalúo, lo encontrarás aquí durante ${TRASH_RETENTION_DAYS} días.`
                      : "Cuando archives uno desde el menú ··· de su renglón, lo encontrarás aquí."
                }
                action={
                  <Link href="/avaluos" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4 sm:h-9")}>
                    {hasFilters ? "Limpiar filtros" : "Volver a la lista"}
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
              <ValuationsTable
                items={items}
                params={params}
                permissions={permissions}
                initialLayout={preferences.valuationListColumns}
                now={currentTime()}
              />
              <nav
                aria-label="Paginación"
                className="flex flex-col gap-3 border-t border-border pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
              >
                <p aria-live="polite">
                  <span className="font-medium text-foreground tabular-nums">
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
