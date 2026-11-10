import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Building2, CreditCard, FileText, House, LayoutTemplate, MapPinned, Users } from "lucide-react";
import type { NavKey } from "@/features/dashboard/navigation";

/** One icon per destination, the same in the bar, the mobile menu and the palette. */
export const NAV_ICONS: Record<NavKey, LucideIcon> = {
  dashboard: House,
  avaluos: FileText,
  comparables: MapPinned,
  plantillas: LayoutTemplate,
  equipo: Users,
  despacho: Building2,
  facturacion: CreditCard,
  cuenta: BadgeCheck,
};
