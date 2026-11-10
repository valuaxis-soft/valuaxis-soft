/**
 * The destinations of the private area, filtered by the person's permissions.
 * Pure data (no icons, no JSX) so the header, the mobile menu and the command
 * palette share one list, and it can be tested without rendering.
 */
import { AUTH_PERMISSIONS, type AuthPermission, type AuthUser } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";

export type NavKey = "dashboard" | "avaluos" | "plantillas" | "comparables" | "equipo" | "despacho" | "facturacion" | "cuenta";

export type NavItem = {
  key: NavKey;
  label: string;
  href: string;
  /** One line for the command palette and the mobile menu. */
  description: string;
  /** Second key of the "g" shortcut (g a → Avalúos), when it has one. */
  shortcut?: string;
};

export type AppNavigation = {
  /** The work: always in the top bar. */
  primary: NavItem[];
  /** The firm's settings: under "Despacho". */
  organization: NavItem[];
  account: NavItem;
  /** "Nuevo avalúo" is offered (AVALUO_CREAR). */
  canCreateValuation: boolean;
};

export const NEW_VALUATION_HREF = "/workspace?action=new";

/** The main element of every private page carries this id: the skip link jumps to it. */
export const MAIN_CONTENT_ID = "contenido";

export function buildNavigation(user: AuthUser): AppNavigation {
  const can = (permission: AuthPermission) => hasPermission(user, permission);
  const primary: NavItem[] = [
    { key: "dashboard", label: "Inicio", href: "/dashboard", description: "Tu resumen del día", shortcut: "i" },
  ];
  if (can(AUTH_PERMISSIONS.viewValuations)) {
    primary.push({ key: "avaluos", label: "Avalúos", href: "/avaluos", description: "Todos los avalúos del despacho", shortcut: "a" });
    // The firm's base of comparables: whoever sees the valuations sees the comparables they used.
    primary.push({ key: "comparables", label: "Comparables", href: "/comparables", description: "La base de comparables del despacho", shortcut: "c" });
  }
  if (can(AUTH_PERMISSIONS.editValuations)) {
    primary.push({ key: "plantillas", label: "Plantillas", href: "/organizacion/plantillas", description: "Estructuras guardadas para empezar avalúos", shortcut: "p" });
  }

  const organization: NavItem[] = [];
  if (can(AUTH_PERMISSIONS.manageUsers)) {
    organization.push({ key: "equipo", label: "Equipo", href: "/organizacion/equipo", description: "Invitaciones, miembros y roles", shortcut: "e" });
    organization.push({ key: "despacho", label: "Datos del despacho", href: "/organizacion/despacho", description: "Membrete, perito y folios", shortcut: "d" });
  }
  if (can(AUTH_PERMISSIONS.viewBilling) || can(AUTH_PERMISSIONS.manageSubscription)) {
    organization.push({ key: "facturacion", label: "Plan y facturación", href: "/organizacion/facturacion", description: "Avalúos disponibles y forma de pago", shortcut: "f" });
  }

  return {
    primary,
    organization,
    account: { key: "cuenta", label: "Mi cuenta", href: "/cuenta", description: "Tu acreditación profesional", shortcut: "m" },
    canCreateValuation: can(AUTH_PERMISSIONS.createValuations),
  };
}

/** Initials for the avatar: first letter of the first two words of the name. */
export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("");
  return letters || "?";
}
