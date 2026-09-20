"use client";

import { useEffect, useState } from "react";
import { Building2, Check, ChevronsUpDown, Loader2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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

export function OrganizationScopeSelector({ activeOrganizationName }: { activeOrganizationName: string }) {
  const [organizations, setOrganizations] = useState<OrganizationScope[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    if (window.sessionStorage.getItem(scopeChangedKey)) {
      window.sessionStorage.removeItem(scopeChangedKey);
      toast.success("Ámbito cambiado correctamente");
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
        toast.error("No se pudo cargar la lista de ámbitos.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadOrganizations();
    return () => controller.abort();
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
      toast.error("No se pudo cambiar el ámbito. Verifica tu acceso.");
    } finally {
      setChangingId(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="h-10 max-w-[240px] justify-between gap-2 rounded-xl px-3 shadow-none"
            disabled={loading || organizations.length <= 1 || changingId !== null}
            aria-label="Cambiar ámbito activo"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {scopeType === "PERSONAL" ? <UserRound /> : <Building2 />}
          <span className="hidden min-w-0 truncate text-left text-sm font-medium md:block">{displayName}</span>
          {loading ? (
            <Skeleton className="hidden h-5 w-14 rounded-full sm:block" />
          ) : (
            <Badge variant={scopeType === "TEAM" ? "default" : "secondary"} className="text-[10px]">
              {scopeType === "TEAM" ? "Team" : scopeType === "PERSONAL" ? "Personal" : "Ámbito"}
            </Badge>
          )}
        </span>
        {changingId !== null ? <Loader2 className="animate-spin" /> : <ChevronsUpDown />}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72 rounded-xl">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Ámbito activo</div>
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
                  {isPersonal ? "Personal" : "Team"} · {organization.rol}
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
