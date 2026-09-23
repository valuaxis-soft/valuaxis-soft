import Link from "next/link";
import { LogOut, UserCircle2, Building2, ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AUTH_PERMISSIONS, type AuthUser } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { logoutAction } from "@/features/auth/actions/logout.action";
import { OrganizationScopeSelector } from "@/features/dashboard/components/organization-scope-selector";
import { cn } from "@/lib/utils";

const roleLabel: Record<string, string> = {
  ADMINISTRADOR: "Administrador",
  VALUADOR: "Valuador",
  REVISOR: "Revisor",
  CONSULTA: "Consulta",
  USUARIO: "Usuario",
};

type NavKey = "dashboard" | "avaluos";

export function DashboardHeader({ user, active }: { user: AuthUser; active?: NavKey }) {
  const navItems: Array<{ key: NavKey; label: string; href: string }> = [
    { key: "dashboard", label: "Inicio", href: "/dashboard" },
    ...(hasPermission(user, AUTH_PERMISSIONS.viewValuations)
      ? [{ key: "avaluos" as const, label: "Avalúos", href: "/avaluos" }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1760px] items-center justify-between px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link href="/dashboard" aria-label="Valuaxis, ir al inicio" className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md shadow-primary/20">
              <Building2 className="size-5 text-primary-foreground" />
            </div>
            <div className="hidden sm:block">
              <p className="text-base font-bold tracking-tight">Valuaxis</p>
              <p className="-mt-0.5 text-[11px] font-medium text-muted-foreground/60">
                Sistema de avalúos web
              </p>
            </div>
          </Link>
          <nav aria-label="Navegación principal" className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "rounded-lg text-sm",
                  active === item.key ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <OrganizationScopeSelector activeOrganizationName={user.organizationName} />
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(buttonVariants({ variant: "ghost" }), "h-9 gap-2 rounded-xl px-3 text-sm font-medium")}
            >
              <UserCircle2 className="size-4" />
              <span className="hidden sm:inline">{user.name}</span>
              <ChevronDown className="size-3.5 text-muted-foreground/60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <p className="text-xs text-muted-foreground">{user.organizationName}</p>
              </div>
              <div className="px-3 pb-2">
                <Badge variant="secondary" className="text-[10px] font-medium">
                  {roleLabel[user.role] ?? user.role}
                </Badge>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive">
                <form action={logoutAction}>
                  <button type="submit" className="flex items-center gap-2">
                    <LogOut className="size-4" />
                    Cerrar sesión
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
