import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, List, Map as MapIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { EmptyState } from "@/features/dashboard/components/empty-state";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { googleMapsBrowserKey } from "@/features/maps/server/google-maps-keys";
import { comparableAttributeNames, comparableSourceNames, firmValidityMonths, listComparableBase } from "@/features/valuations/comparable-base/comparable-base.service";
import {
  COMPARABLE_LIST_PAGE_SIZE,
  buildComparableListHref,
  hasFilters,
  parseComparableListParams,
  type ComparableListParams,
  type ComparableView,
} from "@/features/valuations/comparable-base/comparable-list-params";
import { ComparableBaseActions } from "@/features/valuations/comparable-base/components/comparable-base-actions";
import { ComparableBaseFilters } from "@/features/valuations/comparable-base/components/comparable-base-filters";
import { ComparableBaseMap } from "@/features/valuations/comparable-base/components/comparable-base-map";
import { ComparableBaseTable } from "@/features/valuations/comparable-base/components/comparable-base-table";
import { cn } from "@/lib/utils";
import { requireSession } from "@/security/guards/require-session";
import { NONCE_HEADER } from "@/security/headers/security-headers";

export const metadata: Metadata = {
  title: "Comparables",
  robots: { index: false, follow: false },
};

/**
 * The firm's base of comparables: every comparable its valuations used,
 * searchable by every characteristic, as a list or on the map
 * (?vista=mapa, etapa 3 of the maps) with the same filters.
 */
export default async function ComparablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession("/comparables");
  if (!hasPermission(user, AUTH_PERMISSIONS.viewValuations)) redirect("/dashboard");

  const params = parseComparableListParams(await searchParams);
  const canEdit = hasPermission(user, AUTH_PERMISSIONS.editValuations);
  const mapView = params.view === "mapa";
  // The map loads its pins through the API, with these same filters; the list is not read for it.
  const [{ items, total }, months, attributeNames, sourceNames] = await Promise.all([
    mapView ? Promise.resolve({ items: [], total: 0 }) : listComparableBase(user.organizationId, params),
    firmValidityMonths(user.organizationId),
    comparableAttributeNames(user.organizationId),
    comparableSourceNames(user.organizationId),
  ]);
  const pages = Math.max(1, Math.ceil(total / COMPARABLE_LIST_PAGE_SIZE));
  if (total > 0 && params.page > pages) redirect(buildComparableListHref({ ...params, page: pages }));
  // Runtime variable: the Docker build has no production.env, the container loads it. The map view loads Google Maps with it.
  const googleMapsKey = mapView ? googleMapsBrowserKey() : null;
  const nonce = mapView ? ((await headers()).get(NONCE_HEADER) ?? undefined) : undefined;

  const firstItem = total === 0 ? 0 : (params.page - 1) * COMPARABLE_LIST_PAGE_SIZE + 1;
  const lastItem = Math.min(params.page * COMPARABLE_LIST_PAGE_SIZE, total);
  // The export takes the same filters and order, every page.
  const listHref = buildComparableListHref({ ...params, page: 1 });
  const exportHref = `/api/comparables/exportar${listHref.includes("?") ? listHref.slice(listHref.indexOf("?")) : ""}`;

  return (
    <div className="min-h-dvh bg-background">
      {/* Google Maps copies the nonce of the first <style nonce> it finds onto the styles it injects; without one, the CSP blocks them. */}
      {googleMapsKey && <style nonce={nonce}>{".maps-style-nonce{}"}</style>}
      <DashboardHeader user={user} active="comparables" />

      <PageContainer width="wide">
        <PageHeader
          title="Comparables"
          description={
            <>
              <p>La base de {user.organizationName}: los comparables de sus avalúos y los importados a la base general.</p>
              <p className="mt-1 text-sm">
                Cada uno vale {months} {months === 1 ? "mes" : "meses"} desde su alta o su última actualización (se cambia en Datos del despacho); uno
                vencido solo se marca y lo puedes seguir usando.
              </p>
            </>
          }
          actions={<ComparableBaseActions exportHref={exportHref} canEdit={canEdit} validityMonths={months} attributeNames={attributeNames} />}
        />

        <section aria-label="Base de comparables" className="grid gap-4 rounded-2xl border border-border bg-card p-3 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <ComparableBaseFilters params={params} attributeNames={attributeNames} sourceNames={sourceNames} />
            </div>
            <ViewToggle params={params} />
          </div>

          {mapView ? (
            <ComparableBaseMap
              googleMaps={{ apiKey: googleMapsKey, nonce }}
              query={listHref.includes("?") ? listHref.slice(listHref.indexOf("?") + 1) : ""}
              unlocatedHref={buildComparableListHref({ ...params, view: "lista", located: "sin", page: 1 })}
            />
          ) : items.length === 0 ? (
            hasFilters(params) ? (
              <EmptyState
                illustration="search"
                title="Ningún comparable coincide con la búsqueda"
                description="Quita algún filtro o prueba con otra colonia, municipio o número."
                action={
                  <Link href="/comparables" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4 sm:h-9")}>
                    Limpiar filtros
                  </Link>
                }
              />
            ) : (
              <EmptyState
                illustration="comparables"
                title="Aún no hay comparables"
                description={
                  canEdit
                    ? "Captura el primero con «Nuevo comparable», impórtalos de Excel o agrégalos desde un avalúo: todos llegan aquí."
                    : "Los comparables que tu despacho capture o importe aparecerán aquí."
                }
              />
            )
          ) : (
            <>
              <ComparableBaseTable items={items} params={params} userId={user.id} canEdit={canEdit} />
              <nav aria-label="Paginación" className="flex flex-col gap-3 border-t border-border pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>
                  {firstItem}–{lastItem} de {total} {total === 1 ? "comparable" : "comparables"} · Página {params.page} de {pages}
                </p>
                <div className="flex gap-2">
                  <PageLink href={buildComparableListHref({ ...params, page: params.page - 1 })} disabled={params.page <= 1}>
                    <ChevronLeft className="size-4" /> Anterior
                  </PageLink>
                  <PageLink href={buildComparableListHref({ ...params, page: params.page + 1 })} disabled={params.page >= pages}>
                    Siguiente <ChevronRight className="size-4" />
                  </PageLink>
                </div>
              </nav>
            </>
          )}
        </section>
      </PageContainer>
    </div>
  );
}

/** "Lista" or "Mapa", keeping the filters; the map starts on page 1. */
function ViewToggle({ params }: { params: ComparableListParams }) {
  const option = (view: ComparableView, label: string, icon: React.ReactNode) => {
    const active = params.view === view;
    return (
      <Link
        href={buildComparableListHref({ ...params, view, page: view === "mapa" ? 1 : params.page })}
        aria-current={active ? "page" : undefined}
        className={cn(buttonVariants({ variant: active ? "default" : "outline", size: "sm" }), "h-11 gap-1 rounded-none px-3 first:rounded-l-lg last:rounded-r-lg sm:h-8")}
      >
        {icon} {label}
      </Link>
    );
  };
  return (
    <nav aria-label="Vista" className="flex shrink-0 self-start">
      {option("lista", "Lista", <List className="size-4" aria-hidden="true" />)}
      {option("mapa", "Mapa", <MapIcon className="size-4" aria-hidden="true" />)}
    </nav>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className = cn(buttonVariants({ variant: "outline" }), "h-11 flex-1 gap-1 rounded-lg px-3 sm:h-8 sm:flex-none");
  if (disabled) {
    return <span aria-disabled="true" className={cn(className, "pointer-events-none opacity-50")}>{children}</span>;
  }
  return <Link href={href} className={className}>{children}</Link>;
}
