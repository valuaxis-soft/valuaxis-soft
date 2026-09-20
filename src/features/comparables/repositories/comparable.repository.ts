import { prisma } from "@/infrastructure/database/prisma-client";
import type { ComparableDto } from "@/features/valuations/repositories/valuation.repository";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";

export async function listComparables(params: {
  organizationId: number;
  valuationId?: string | null;
  postalCode?: string | null;
}) {
  if (params.valuationId) {
    const valuation = await getValuationByPublicId(params.valuationId, params.organizationId);
    return valuation?.comparables ?? [];
  }

  const comparables = await prisma.comparableAvaluo.findMany({
    where: {
      avaluo: {
        IdOrganizacion: params.organizationId,
        BActivo: true,
        DFechaEliminacion: null,
      },
      propiedad: params.postalCode
        ? { direccionesPropiedad: { some: { SCodigoPostal: params.postalCode, BEsDireccionActual: true } } }
        : undefined,
    },
    include: {
      propiedad: { include: { tipoInmueble: true, direccionesPropiedad: true } },
      publicacionPropiedad: {
        include: { fuenteInmobiliaria: true, tipoOperacion: true, imagenes: true },
      },
      tipoComparable: true,
    },
    orderBy: { DFechaSeleccion: "desc" },
    take: 100,
  });

  return comparables.map((comparable): ComparableDto => {
    const address = comparable.propiedad.direccionesPropiedad.find((item) => item.BEsDireccionActual);
    const publication = comparable.publicacionPropiedad;
    const area = comparable.NSuperficieConstruccionCapturada ?? comparable.NSuperficieTerrenoCapturada;

    return {
      id: comparable.UIdentificadorPublico,
      title: publication?.STitulo ?? comparable.propiedad.SNombre ?? "Comparable",
      source: publication?.fuenteInmobiliaria.SNombre ?? comparable.tipoComparable.SNombre,
      status: comparable.BIncluido ? "activo" : "historial",
      operation: publication?.tipoOperacion.SClave.toLowerCase() ?? "venta",
      propertyKind: comparable.propiedad.tipoInmueble.SClave.toLowerCase(),
      postalCode: address?.SCodigoPostal ?? "",
      price: comparable.NPrecioCapturado?.toString() ?? publication?.NPrecio?.toString() ?? "",
      area: area ? `${area.toString()} m2` : "",
      pricePerMeter: comparable.NValorUnitarioCapturado?.toString() ?? "",
      distance: comparable.NDistanciaMetros ? `${comparable.NDistanciaMetros.toString()} m` : "",
      link: publication?.SURL ?? "",
      imageUrl: publication?.imagenes.find((image) => image.BPrincipal)?.SURLOrigen ?? null,
      selected: comparable.BIncluido,
      location: address?.SDireccionCompleta ?? null,
      bedrooms: comparable.propiedad.IRecamaras?.toString() ?? null,
      bathrooms: comparable.propiedad.IBanosCompletos?.toString() ?? null,
      parking: comparable.propiedad.IEstacionamientos?.toString() ?? null,
      antiquity: comparable.propiedad.NEdad?.toString() ?? null,
    };
  });
}

export async function setComparableIncluded(id: string, organizationId: number, included: boolean) {
  const existing = await prisma.comparableAvaluo.findFirst({
    where: {
      UIdentificadorPublico: id,
      avaluo: { IdOrganizacion: organizationId, DFechaEliminacion: null },
    },
    select: { IdComparableAvaluo: true },
  });
  if (!existing) return null;

  return prisma.comparableAvaluo.update({
    where: { IdComparableAvaluo: existing.IdComparableAvaluo },
    data: {
      BIncluido: included,
      DFechaExclusion: included ? null : new Date(),
    },
  });
}
