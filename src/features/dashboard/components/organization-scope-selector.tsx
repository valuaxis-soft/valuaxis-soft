"use client";

import { useEffect, useState } from "react";
import { Building2, Check, ChevronsUpDown, Loader2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

type OrganizationScope = {
  IdOrganizacion: number;
  UIdentificadorPublico: string;
  SNombre: string;
  SSlug: string;
  STipoAmbito: string;
  rol: string;
  BEsAmbitoActivo: boolean;
};

const scopeChangedKey = "valuo:organization-scope-changed";
/** Fired on window when the active organization's name or type changes (e.g. a space becomes a team). */
export const ORGANIZATIONS_CHANGED_EVENT = "valuaxis:organizations-changed";

export function OrganizationScopeSelector({ activeOrganizationName }: { activeOrganizationName: string }) {
  const [organizations, setOrganizations] = useState<OrganizationScope[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    if (window.sessionStorage.getItem(scopeChangedKey)) {
      window.sessionStorage.removeItem(scopeChangedKey);
      toast.success("Listo, cambiaste de despacho.");
    }

    async function loadOrganizations() {
      try {
        const response = await fetch("/api/auth/organizations", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("ORGANIZATIONS_NOT_AVAILABLE");

        const payload = (await response.json()) as { data?: OrganizationScope[] };
        setOrganizations(Array.isArray(payload.data) ? payload.data : []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.error("No pudimos cargar tus despachos. Recarga la página para intentarlo de nuevo.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadOrganizations();
    const reload = () => void loadOrganizations();
    window.addEventListener(ORGANIZATIONS_CHANGED_EVENT, reload);
    return () => {
      controller.abort();
      window.removeEventListener(ORGANIZATIONS_CHANGED_EVENT, reload);
    };
  }, []);

  const activeOrganization = organizations.find((organization) => organization.BEsAmbitoActivo);
  const displayName = activeOrganization?.SNombre ?? activeOrganizationName;
  const scopeType = activeOrganization?.STipoAmbito.toUpperCase();

  async function changeOrganization(organization: OrganizationScope) {
    if (organization.BEsAmbitoActivo || changingId !== null) return;

    setChangingId(organization.IdOrganizacion);
    try {
      const response = await fetch("/api/auth/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ UIdentificadorPublico: organization.UIdentificadorPublico }),
      });
      if (!response.ok) throw new Error("ORGANIZATION_CHANGE_REJECTED");

      setOrganizations((current) =>
        current.map((item) => ({
          ...item,
          BEsAmbitoActivo: item.IdOrganizacion === organization.IdOrganizacion,
        })),
      );
      window.sessionStorage.setItem(scopeChangedKey, "1");
      window.location.reload();
    } catch {
      toast.error("No pudimos cambiarte de despacho. Revisa que sigas teniendo acceso.");
    } finally {
      setChangingId(null);
    }
  }

  const typeLabel = scopeType === "TEAM" ? "Equipo" : scopeType === "PERSONAL" ? "Personal" : "Despacho";
  const ScopeIcon = scopeType === "PERSONAL" ? UserRound : Building2;
  const label = (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <ScopeIcon className="size-4" aria-hidden="true" />
      </span>
      <span className="hidden min-w-0 text-left xl:block">
        <span className="block truncate text-sm leading-tight font-medium">{displayName}</span>
        {loading ? (
          <Skeleton className="mt-0.5 h-3 w-12" />
        ) : (
          <span className="block text-[11px] leading-tight text-muted-foreground">{typeLabel}</span>
        )}
      </span>
    </span>
  );

  // With a single firm there is nothing to switch: the name is shown, not a disabled-looking button.
  if (!loading && organizations.length <= 1) {
    return (
      <div className="flex h-11 max-w-[220px] items-center rounded-lg px-1.5 lg:h-10 xl:px-2" title={displayName} aria-label={`Despacho activo: ${displayName}`} role="note">
        {label}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-11 max-w-[240px] justify-between gap-2 rounded-lg px-1.5 lg:h-10 xl:px-2"
            disabled={loading || changingId !== null}
            aria-label={`Cambiar de despacho. Activo: ${displayName}`}
          />
        }
      >
        {label}
        {changingId !== null ? <Loader2 className="animate-spin" /> : <ChevronsUpDown className="text-muted-foreground" />}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72 rounded-xl p-1.5">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Cambiar de despacho</div>
        <DropdownMenuSeparator />
        {organizations.map((organization) => {
          const isPersonal = organization.STipoAmbito.toUpperCase() === "PERSONAL";
          return (
            <DropdownMenuItem
              key={organization.IdOrganizacion}
              className="items-start gap-3 px-3 py-2.5"
              disabled={organization.BEsAmbitoActivo || changingId !== null}
              onClick={() => void changeOrganization(organization)}
            >
              {isPersonal ? <UserRound className="mt-0.5" /> : <Users className="mt-0.5" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{organization.SNombre}</span>
                <span className="block text-xs text-muted-foreground">
                  {isPersonal ? "Personal" : "Equipo"} · {organization.rol}
                </span>
              </span>
              {organization.BEsAmbitoActivo ? <Check className="mt-0.5 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
