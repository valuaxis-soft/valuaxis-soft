import { Badge } from "@/components/ui/badge";
import { formatDay } from "@/features/valuations/calculation/comparable-card";
import { comparableValidity, type ComparableValidity } from "@/features/valuations/calculation/comparable-validity";

/** "Vigente" or "Vencido": a mark only, an expired comparable can still be used. */
export function ValidityBadge({ validity }: { validity: Pick<ComparableValidity, "expired"> }) {
  return validity.expired ? (
    <Badge variant="destructive" data-validity="VENCIDO">Vencido</Badge>
  ) : (
    <Badge variant="secondary" data-validity="VIGENTE">Vigente</Badge>
  );
}

/** "Fecha de alta / actualización 23 oct 2026 · Vigente hasta 23 abr 2027", with its mark. */
export function ComparableValidityLine({ updatedOn, validity, months }: { updatedOn?: string; validity?: ComparableValidity; /** Its months of validity; six when not given. */ months?: number | null }) {
  const value = validity ?? (updatedOn ? comparableValidity(updatedOn, undefined, months) : null);
  if (!value) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-comparable-validity>
      <span>Fecha de alta / actualización: <span className="font-medium text-foreground">{formatDay(value.updatedOn)}</span></span>
      <span>Vigente hasta: <span className="font-medium text-foreground">{formatDay(value.validUntil)}</span></span>
      <ValidityBadge validity={value} />
      {value.expired ? <span>Actualiza sus datos para renovar su vigencia.</span> : null}
    </p>
  );
}
