"use client";

import Link from "next/link";
import { BadgeCheck, ChevronDown, Keyboard, LogOut, Monitor, Moon, RotateCw, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRef } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/features/auth/actions/logout.action";
import { openCommandPalette } from "@/features/dashboard/components/command-palette";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  ADMINISTRADOR: "Administrador",
  VALUADOR: "Valuador",
  REVISOR: "Revisor",
  CONSULTA: "Consulta",
  USUARIO: "Usuario",
};

export const roleLabel = (role: string) => ROLE_LABEL[role] ?? role;

/** The initials on the account button, in the primary tint. */
export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary ring-1 ring-primary/20", className)}
    >
      {initials}
    </span>
  );
}

/** The account menu: who is signed in, "Mi cuenta", the shortcuts, "Recargar página", the theme and "Cerrar sesión". */
export function UserMenu({
  name,
  email,
  organizationName,
  role,
  initials,
}: {
  name: string;
  email: string;
  organizationName: string;
  role: string;
  initials: string;
}) {
  const { theme, setTheme } = useTheme();
  const logoutForm = useRef<HTMLFormElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Cuenta de ${name}`}
          className="flex h-11 items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm font-medium transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted lg:h-10"
        >
          <Avatar initials={initials} />
          <span className="hidden max-w-36 truncate 2xl:inline">{name}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-xl p-1.5">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar initials={initials} className="size-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {roleLabel(role)} · {organizationName}
              </p>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-9 gap-2 px-2" render={<Link href="/cuenta" />}>
            <BadgeCheck />
            Mi cuenta y acreditación
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-9 gap-2 px-2" onClick={() => openCommandPalette("shortcuts")}>
            <Keyboard />
            Atajos de teclado
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>
          {/* The installed app (PWA) has no reload button of its own. */}
          <DropdownMenuItem className="min-h-9 gap-2 px-2" onClick={() => window.location.reload()}>
            <RotateCw />
            Recargar página
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 text-xs text-muted-foreground">Tema</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={(value) => setTheme(String(value))}>
              <DropdownMenuRadioItem value="light" className="min-h-9 gap-2">
                <Sun />
                Claro
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" className="min-h-9 gap-2">
                <Moon />
                Oscuro
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system" className="min-h-9 gap-2">
                <Monitor />
                Como el sistema
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className="min-h-9 gap-2 px-2" onClick={() => logoutForm.current?.requestSubmit()}>
            <LogOut />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <form ref={logoutForm} action={logoutAction} hidden />
    </>
  );
}
