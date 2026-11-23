import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { OPERATOR_USER_DIRECTORY_HREF } from "@/features/operator/operator-access";
import { auditUserDirectory } from "@/features/operator/user-directory-audit";
import {
  ACCREDITATION_LABELS,
  USER_DIRECTORY_PAGE_SIZE,
  USER_DIRECTORY_SEARCH_MAX_LENGTH,
  parseUserDirectoryParams,
  userDirectoryQuery,
  type UserDirectoryParams,
} from "@/features/operator/user-directory-params";
import { listUserDirectoryPage, type UserDirectoryEntry } from "@/features/operator/user-directory.repository";
import { cn } from "@/lib/utils";
import { requireOperatorPage } from "@/security/guards/operator-guard";
import { clientIp } from "@/security/rate-limit/rate-limiter";

export const metadata: Metadata = {
  title: "Usuarios de la plataforma",
  robots: { index: false, follow: false },
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });
const dayFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" });

const href = (params: Partial<UserDirectoryParams>) => {
  const query = userDirectoryQuery(params);
  return query ? `${OPERATOR_USER_DIRECTORY_HREF}?${query}` : OPERATOR_USER_DIRECTORY_HREF;
};

/**
 * The registry of every person on the platform, for the operator
 * (OPERATOR_EMAILS): who they are and where they work, so the owner can say
 * who made a valuation if an authority asks. Never what they made: only how
 * many valuations they created and concluded. Anyone else gets 404. Every view
 * is audited.
 */
export default async function OperatorUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireOperatorPage(OPERATOR_USER_DIRECTORY_HREF);
  const params = parseUserDirectoryParams(await searchParams);
  const { items, total } = await listUserDirectoryPage(params, USER_DIRECTORY_PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / USER_DIRECTORY_PAGE_SIZE));
  if (total > 0 && params.page > pages) redirect(href({ ...params, page: pages }));

  const requestHeaders = await headers();
  await auditUserDirectory({
    kind: "view",
    user,
    params,
    rows: items.length,
    total,
    ip: clientIp(requestHeaders),
    userAgent: requestHeaders.get("user-agent"),
  });

  const firstItem = total === 0 ? 0 : (params.page - 1) * USER_DIRECTORY_PAGE_SIZE + 1;
  const lastItem = Math.min(params.page * USER_DIRECTORY_PAGE_SIZE, total);
  const exportQuery = userDirectoryQuery({ ...params, page: 1 });
  const filtered = Boolean(params.q) || params.accredited !== "todos";

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} />
      <PageContainer width="wide">
        <PageHeader
          eyebrow="Operación de la plataforma"
          title="Usuarios de la plataforma"
          description="Quién es cada persona registrada y en qué despachos trabaja. No muestra ni da acceso al contenido de sus avalúos: solo cuántos creó y concluyó. Cada consulta y cada exportación quedan registradas."
          actions={
            <a
              href={`/api/operador/usuarios/exportar${exportQuery ? `?${exportQuery}` : ""}`}
              className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2 px-4 sm:h-10")}
              download
            >
              <Download className="size-4" aria-hidden="true" />
              Exportar a Excel
            </a>
          }
        />

        <section aria-label="Usuarios" className="grid gap-4 rounded-2xl border border-border bg-card p-3 sm:p-5">
          <form method="get" action={OPERATOR_USER_DIRECTORY_HREF} className="flex flex-col gap-3 md:flex-row md:items-end" role="search">
            <label className="grid flex-1 gap-1.5 text-sm font-medium">
              Buscar
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  name="q"
                  defaultValue={params.q}
                  maxLength={USER_DIRECTORY_SEARCH_MAX_LENGTH}
                  placeholder="Nombre, correo o teléfono"
                  autoComplete="off"
                  className="h-11 pl-8 sm:h-9"
                />
              </span>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Acreditación
              <NativeSelect name="acreditado" defaultValue={params.accredited} className="w-full md:w-44 [&_select]:h-11 sm:[&_select]:h-9">
                <NativeSelectOption value="todos">Todos</NativeSelectOption>
                <NativeSelectOption value="si">Acreditados</NativeSelectOption>
                <NativeSelectOption value="no">No acreditados</NativeSelectOption>
              </NativeSelect>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Ordenar por
              <NativeSelect name="orden" defaultValue={params.sort} className="w-full md:w-44 [&_select]:h-11 sm:[&_select]:h-9">
                <NativeSelectOption value="alta">Fecha de alta</NativeSelectOption>
                <NativeSelectOption value="acceso">Último acceso</NativeSelectOption>
              </NativeSelect>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Orden
              <NativeSelect name="dir" defaultValue={params.direction} className="w-full md:w-40 [&_select]:h-11 sm:[&_select]:h-9">
                <NativeSelectOption value="desc">Más recientes</NativeSelectOption>
                <NativeSelectOption value="asc">Más antiguos</NativeSelectOption>
              </NativeSelect>
            </label>
            <div className="flex gap-2">
              <button type="submit" className={cn(buttonVariants(), "h-11 flex-1 px-4 sm:h-9 md:flex-none")}>
                Buscar
              </button>
              {filtered ? (
                <Link href={OPERATOR_USER_DIRECTORY_HREF} className={cn(buttonVariants({ variant: "ghost" }), "h-11 px-3 sm:h-9")}>
                  Limpiar
                </Link>
              ) : null}
            </div>
          </form>

          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              {filtered ? "Nadie coincide con la búsqueda. Prueba con otro nombre, correo o teléfono." : "Aún no hay usuarios registrados."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Despachos y rol</TableHead>
                  <TableHead>Acreditación</TableHead>
                  <TableHead>Alta</TableHead>
                  <TableHead>Último acceso</TableHead>
                  <TableHead className="text-right">Creados</TableHead>
                  <TableHead className="text-right">Concluidos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry) => (
                  <DirectoryRow key={entry.publicId} entry={entry} />
                ))}
              </TableBody>
            </Table>
          )}

          <nav
            aria-label="Paginación"
            className="flex flex-col gap-3 border-t border-border pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
          >
            <p aria-live="polite">
              <span className="font-medium text-foreground tabular-nums">
                {firstItem}–{lastItem}
              </span>{" "}
              de <span className="tabular-nums">{total}</span> {total === 1 ? "usuario" : "usuarios"}
              {pages > 1 ? ` · Página ${params.page} de ${pages}` : ""}
            </p>
            {pages > 1 ? (
              <div className="flex gap-2">
                <PageLink href={href({ ...params, page: params.page - 1 })} disabled={params.page <= 1}>
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Anterior
                </PageLink>
                <PageLink href={href({ ...params, page: params.page + 1 })} disabled={params.page >= pages}>
                  Siguiente
                  <ChevronRight className="size-4" aria-hidden="true" />
                </PageLink>
              </div>
            ) : null}
          </nav>
        </section>
      </PageContainer>
    </div>
  );
}

function DirectoryRow({ entry }: { entry: UserDirectoryEntry }) {
  return (
    <TableRow className="align-top">
      <TableCell className="min-w-56 whitespace-normal">
        <p className="font-medium">{entry.name || "Sin nombre"}</p>
        <p className="text-xs text-muted-foreground">{entry.email}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge variant={entry.emailVerified ? "secondary" : "outline"}>{entry.emailVerified ? "Correo verificado" : "Correo sin verificar"}</Badge>
          {entry.active ? null : <Badge variant="destructive">Cuenta inactiva</Badge>}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {entry.phone ?? <span className="text-muted-foreground">—</span>}
        {entry.phone ? <p className="text-xs text-muted-foreground">Sin verificar</p> : null}
      </TableCell>
      <TableCell className="min-w-56 whitespace-normal">
        {entry.memberships.length ? (
          <ul className="grid gap-0.5">
            {entry.memberships.map((member, index) => (
              <li key={index}>
                {member.organization}
                <span className="text-muted-foreground"> · {member.role}{member.kind === "PERSONAL" ? " (personal)" : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">Sin despacho activo</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Badge variant={entry.accreditation === "ACREDITADO" ? "default" : entry.accreditation === "EN_REVISION" ? "secondary" : "outline"}>
          {ACCREDITATION_LABELS[entry.accreditation] ?? entry.accreditation}
        </Badge>
        {entry.accreditationLevel ? <p className="mt-0.5 text-xs text-muted-foreground">{entry.accreditationLevel}</p> : null}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{dayFormatter.format(entry.signedUpAt)}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {entry.lastAccessAt ? dateFormatter.format(entry.lastAccessAt) : <span className="text-muted-foreground">Nunca</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{entry.valuationsCreated}</TableCell>
      <TableCell className="text-right tabular-nums">{entry.valuationsConcluded}</TableCell>
    </TableRow>
  );
}

function PageLink({ href: target, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className = cn(buttonVariants({ variant: "outline" }), "h-11 flex-1 gap-1 rounded-lg px-3 sm:h-8 sm:flex-none");
  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(className, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={target} className={className}>
      {children}
    </Link>
  );
}
