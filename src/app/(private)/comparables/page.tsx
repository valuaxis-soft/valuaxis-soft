import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, MapPinned, SearchX } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { OFFER_MAX_AGE_MONTHS } from "@/features/valuations/calculation/comparable-review";
import { listComparableBase } from "@/features/valuations/comparable-base/comparable-base.service";
import {
  COMPARABLE_LIST_PAGE_SIZE,
  buildComparableListHref,
  hasFilters,
  parseComparableListParams,
} from "@/features/valuations/comparable-base/comparable-list-params";
import { ComparableBaseActions } from "@/features/valuations/comparable-base/components/comparable-base-actions";
import { ComparableBaseFilters } from "@/features/valuations/comparable-base/components/comparable-base-filters";
import { ComparableBaseTable } from "@/features/valuations/comparable-base/components/comparable-base-table";
import { cn } from "@/lib/utils";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = {
  title: "Comparables",
  robots: { index: false, follow: false },
};

/** The firm's base of comparables: every comparable its valuations used, searchable by every characteristic. */
export default async function ComparablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession("/comparables");
  if (!hasPermission(user, AUTH_PERMISSIONS.viewValuations)) redirect("/dashboard");

  const params = parseComparableListParams(await searchParams);
  const { items, total } = await listComparableBase(user.organizationId, params);
  const pages = Math.max(1, Math.ceil(total / COMPARABLE_LIST_PAGE_SIZE));
  if (total > 0 && params.page > pages) redirect(buildComparableListHref({ ...params, page: pages }));

  const firstItem = total === 0 ? 0 : (params.page - 1) * COMPARABLE_LIST_PAGE_SIZE + 1;
  const lastItem = Math.min(params.page * COMPARABLE_LIST_PAGE_SIZE, total);
  // The export takes the same filters and order, every page.
  const listHref = buildComparableListHref({ ...params, page: 1 });
  const exportHref = `/api/comparables/exportar${listHref.includes("?") ? listHref.slice(listHref.indexOf("?")) : ""}`;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} active="comparables" />

      <main className="mx-auto max-w-[1760px] px-4 py-8 lg:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Comparables</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              La base de comparables de {user.organizationName}: los de sus avalúos y los importados a la base general. Cada uno vale
              {" "}{OFFER_MAX_AGE_MONTHS} meses desde su alta o su última actualización; uno vencido solo se marca, se puede seguir usando.
            </p>
          </div>
          <ComparableBaseActions exportHref={exportHref} canImport={hasPermission(user, AUTH_PERMISSIONS.editValuations)} />
        </div>

        <Card className="rounded-2xl border-0 shadow-md shadow-primary/[0.03]">
          <CardContent className="grid gap-4 p-4 sm:p-6">
            <ComparableBaseFilters params={params} />

            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                {hasFilters(params) ? (
                  <>
                    <SearchX className="size-8 text-muted-foreground/40" aria-hidden="true" />
                    <p className="text-sm font-medium">Ningún comparable coincide con la búsqueda</p>
                    <p className="text-xs text-muted-foreground">Quita algún filtro o prueba con otra colonia, municipio o número.</p>
                    <Link href="/comparables" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}>Limpiar filtros</Link>
                  </>
                ) : (
                  <>
                    <MapPinned className="size-8 text-muted-foreground/40" aria-hidden="true" />
                    <p className="text-sm font-medium">Aún no hay comparables</p>
                    <p className="text-xs text-muted-foreground">
                      Los comparables que captures o importes en un avalúo, o que importes a la base con la plantilla maestra, aparecerán aquí.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <>
                <ComparableBaseTable items={items} />
                <nav aria-label="Paginación" className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className = cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1 rounded-lg");
  if (disabled) {
    return <span aria-disabled="true" className={cn(className, "pointer-events-none opacity-50")}>{children}</span>;
  }
  return <Link href={href} className={className}>{children}</Link>;
}
