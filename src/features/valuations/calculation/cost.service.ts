/**
 * Cost approach of a valuation version: land settings, constructions, special
 * installations and indirects, saved as a whole, and the stored result with its
 * trace. The land unit value defaults to the one adopted in the land market.
 */
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { DEFAULT_ENGINE_CONFIG, ENGINE_VERSION } from "../engine/config";
import { computeCostApproach } from "../engine/costs";
import { Trace } from "../engine/trace";
import { asRecord, catalogId, decimal, findValuation, writableVersion, type Tx } from "./access";
import type { CostInputPayload } from "./cost-schemas";
import {
  DEFAULT_LAND,
  toCostEngineInput,
  type CostCalculationDto,
  type CostInputDto,
  type CostLandDto,
} from "./cost-types";

const CALCULATION_KEY = "MOTOR.COSTOS";

async function landMarket(tx: Tx, versionId: number): Promise<CostCalculationDto["market"]> {
  const market = await tx.enfoqueMercado.findFirst({
    where: { IdVersionAvaluo: versionId, tipoComparable: { SClave: "TERRENO_VENTA" } },
    select: { NValorHomologadoUtilizado: true, NSuperficieSujeto: true, NSuperficieBase: true },
  });
  return {
    adoptedUnitValue: decimal(market?.NValorHomologadoUtilizado),
    subjectArea: decimal(market?.NSuperficieSujeto),
    baseArea: decimal(market?.NSuperficieBase),
  };
}

async function loadInput(tx: Tx, versionId: number): Promise<CostInputDto> {
  const [approach, construction, installations, indirects] = await Promise.all([
    tx.enfoqueCosto.findUnique({
      where: { IdVersionAvaluo: versionId },
      include: { costosConstrucciones: true, costosInstalaciones: true },
    }),
    tx.construccionAvaluo.findFirst({
      where: { IdVersionAvaluo: versionId },
      include: { tiposConstruccion: { orderBy: { IOrden: "asc" } } },
      orderBy: { IdConstruccionAvaluo: "asc" },
    }),
    tx.instalacionEspecialAvaluo.findMany({
      where: { IdVersionAvaluo: versionId },
      include: { tipoParticipacion: { select: { SClave: true } } },
      orderBy: { IOrden: "asc" },
    }),
    tx.costoIndirecto.findMany({ where: { IdVersionAvaluo: versionId }, orderBy: { IOrden: "asc" } }),
  ]);
  const land = asRecord(approach?.JConfiguracion ?? null).land as Partial<CostLandDto> | undefined;
  const costByType = new Map(approach?.costosConstrucciones.map((row) => [row.IdTipoConstruccionAvaluo, row]) ?? []);
  const costByInstallation = new Map(approach?.costosInstalaciones.map((row) => [row.IdInstalacionEspecialAvaluo, row]) ?? []);
  return {
    land: { ...DEFAULT_LAND, ...land, factors: { ...DEFAULT_LAND.factors, ...land?.factors } },
    constructions: (construction?.tiposConstruccion ?? []).map((type) => {
      const cost = costByType.get(type.IdTipoConstruccionAvaluo);
      return {
        ref: type.SReferencia ?? "",
        description: type.SDescripcion ?? "",
        classification: type.SClasificacion ?? "",
        quality: type.SCalidad ?? "",
        area: decimal(type.NSuperficie),
        age: decimal(type.NEdad),
        usefulLife: decimal(type.NVidaUtilTotal),
        conservation: decimal(cost?.NFactorConservacion),
        otherFactor: decimal(cost?.NFactorOtro) ?? 1,
        completion: decimal(type.NGradoTerminacion) ?? 1,
        undivided: decimal(type.NIndiviso) ?? 1,
        unitReplacementCost: decimal(cost?.NValorUnitarioReposicionNuevo),
      };
    }),
    installations: installations.map((row) => {
      const cost = costByInstallation.get(row.IdInstalacionEspecialAvaluo);
      return {
        ref: row.SReferencia ?? "",
        description: row.SDescripcion,
        share: row.tipoParticipacion.SClave === "COMUN" ? "C" as const : "P" as const,
        unit: row.SUnidad ?? "",
        quantity: decimal(row.NCantidad),
        age: decimal(row.NEdad),
        usefulLife: decimal(row.NVidaUtil),
        conservation: decimal(cost?.NFactorConservacion),
        maintenance: row.SMantenimiento ?? "",
        otherFactor: decimal(cost?.NFactorOtro) ?? 1,
        completion: decimal(row.NGradoTerminacion) ?? 1,
        undivided: decimal(row.NIndiviso) ?? 1,
        unitReplacementCost: decimal(cost?.NValorUnitarioVRN),
      };
    }),
    indirects: indirects.map((row) => ({ concept: row.SConcepto, percentage: decimal(row.NPorcentaje), base: decimal(row.NValorBase) })),
  };
}

export async function getCostCalculation(publicId: string, organizationId: number): Promise<CostCalculationDto> {
  return prisma.$transaction(async (tx) => {
    const avaluo = await findValuation(tx, publicId, organizationId);
    const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
    if (!versionId) {
      return {
        land: DEFAULT_LAND, constructions: [], installations: [], indirects: [],
        market: { adoptedUnitValue: null, subjectArea: null, baseArea: null }, configured: false, locked: avaluo.BBloqueado,
      };
    }
    const [input, market, approach] = await Promise.all([
      loadInput(tx, versionId),
      landMarket(tx, versionId),
      tx.enfoqueCosto.findUnique({ where: { IdVersionAvaluo: versionId }, select: { IdEnfoqueCosto: true } }),
    ]);
    return { ...input, market, configured: Boolean(approach), locked: avaluo.BBloqueado };
  });
}

/** Replaces the whole capture of the version and recomputes the approach. */
export async function saveCostCalculation(publicId: string, user: AuthUser, payload: CostInputPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const approach = await tx.enfoqueCosto.upsert({
      where: { IdVersionAvaluo: versionId },
      create: { IdVersionAvaluo: versionId, JConfiguracion: { land: payload.land } },
      update: { JConfiguracion: { land: payload.land } },
    });

    await tx.costoConstruccion.deleteMany({ where: { IdEnfoqueCosto: approach.IdEnfoqueCosto } });
    await tx.costoInstalacion.deleteMany({ where: { IdEnfoqueCosto: approach.IdEnfoqueCosto } });
    await tx.costoTerreno.deleteMany({ where: { IdEnfoqueCosto: approach.IdEnfoqueCosto } });
    await tx.costoIndirecto.deleteMany({ where: { IdVersionAvaluo: versionId } });
    await tx.instalacionEspecialAvaluo.deleteMany({ where: { IdVersionAvaluo: versionId } });

    const construction = (await tx.construccionAvaluo.findFirst({ where: { IdVersionAvaluo: versionId }, orderBy: { IdConstruccionAvaluo: "asc" } }))
      ?? (await tx.construccionAvaluo.create({ data: { IdVersionAvaluo: versionId } }));
    await tx.tipoConstruccionAvaluo.deleteMany({ where: { IdConstruccionAvaluo: construction.IdConstruccionAvaluo } });
    await tx.construccionAvaluo.update({
      where: { IdConstruccionAvaluo: construction.IdConstruccionAvaluo },
      data: { NSuperficieConstruida: payload.constructions.reduce((sum, row) => sum + (row.area ?? 0), 0) || null },
    });

    for (const [index, row] of payload.constructions.entries()) {
      const type = await tx.tipoConstruccionAvaluo.create({
        data: {
          IdConstruccionAvaluo: construction.IdConstruccionAvaluo,
          SReferencia: row.ref,
          SDescripcion: row.description || null,
          SClasificacion: row.classification || null,
          SCalidad: row.quality || null,
          NEdad: row.age,
          NVidaUtilTotal: row.usefulLife,
          NVidaUtilRemanente: row.usefulLife !== null && row.age !== null ? Math.max(row.usefulLife - row.age, 0) : null,
          NSuperficie: row.area,
          NGradoTerminacion: row.completion,
          NIndiviso: row.undivided,
          IOrden: index,
        },
      });
      await tx.costoConstruccion.create({
        data: {
          IdEnfoqueCosto: approach.IdEnfoqueCosto,
          IdTipoConstruccionAvaluo: type.IdTipoConstruccionAvaluo,
          NValorUnitarioReposicionNuevo: row.unitReplacementCost,
          NFactorConservacion: row.conservation,
          NFactorOtro: row.otherFactor,
          IOrden: index,
        },
      });
    }

    const shares = await tx.tipoParticipacion.findMany({ where: { SClave: { in: ["PRIVATIVA", "COMUN"] } } });
    const shareId = (share: "P" | "C") => {
      const row = shares.find((item) => item.SClave === (share === "C" ? "COMUN" : "PRIVATIVA"));
      if (!row) throw new Error("Falta el tipo de participación en el catálogo.");
      return row.IdTipoParticipacion;
    };
    for (const [index, row] of payload.installations.entries()) {
      const installation = await tx.instalacionEspecialAvaluo.create({
        data: {
          IdVersionAvaluo: versionId,
          IdTipoParticipacion: shareId(row.share),
          SReferencia: row.ref,
          SDescripcion: row.description,
          SUnidad: row.unit || null,
          NCantidad: row.quantity,
          NEdad: row.age,
          NVidaUtil: row.usefulLife,
          NVidaRemanente: row.usefulLife !== null && row.age !== null ? Math.max(row.usefulLife - row.age, 0) : null,
          SMantenimiento: row.maintenance || null,
          NGradoTerminacion: row.completion,
          NIndiviso: row.undivided,
          IOrden: index,
        },
      });
      await tx.costoInstalacion.create({
        data: {
          IdEnfoqueCosto: approach.IdEnfoqueCosto,
          IdInstalacionEspecialAvaluo: installation.IdInstalacionEspecialAvaluo,
          NValorUnitarioVRN: row.unitReplacementCost,
          NFactorConservacion: row.conservation,
          NFactorOtro: row.otherFactor,
          IOrden: index,
        },
      });
    }

    for (const [index, row] of payload.indirects.entries()) {
      if (!row.concept.trim()) continue;
      await tx.costoIndirecto.create({
        data: { IdVersionAvaluo: versionId, SConcepto: row.concept, NPorcentaje: row.percentage, NValorBase: row.base, IOrden: index },
      });
    }

    await recomputeCosts(tx, versionId);
  });
}

/** Recomputes the approach from what is stored and saves the result and its trace. */
export async function recomputeCosts(tx: Tx, versionId: number) {
  const approach = await tx.enfoqueCosto.findUnique({ where: { IdVersionAvaluo: versionId } });
  if (!approach) return;
  const [input, market] = await Promise.all([loadInput(tx, versionId), landMarket(tx, versionId)]);
  const engineInput = toCostEngineInput({ ...input, market });
  await tx.ejecucionCalculo.deleteMany({ where: { IdVersionAvaluo: versionId, SClaveCalculo: CALCULATION_KEY } });
  await tx.costoTerreno.deleteMany({ where: { IdEnfoqueCosto: approach.IdEnfoqueCosto } });

  if (!engineInput.ok) {
    await tx.enfoqueCosto.update({
      where: { IdEnfoqueCosto: approach.IdEnfoqueCosto },
      data: { NValorTerreno: null, NValorConstrucciones: null, NValorInstalaciones: null, NValorIndirectos: null, NValorFisicoTotal: null },
    });
    return;
  }

  const trace = new Trace();
  const result = computeCostApproach(engineInput.input, DEFAULT_ENGINE_CONFIG, trace);
  const value = (key: string) => trace.find(key)?.value ?? null;

  await tx.enfoqueCosto.update({
    where: { IdEnfoqueCosto: approach.IdEnfoqueCosto },
    data: {
      NValorTerreno: engineInput.input.land ? result.land : null,
      NValorConstrucciones: result.constructions,
      NValorInstalaciones: result.specialInstallations,
      NValorIndirectos: result.indirects,
      NValorFisicoTotal: result.physicalValue,
    },
  });

  const land = engineInput.input.land;
  if (land?.kind === "urban") {
    const factors = input.land.factors;
    await tx.costoTerreno.create({
      data: {
        IdEnfoqueCosto: approach.IdEnfoqueCosto,
        SFraccion: "I",
        NSuperficieSujeto: land.subjectArea,
        NValorUnitario: value("costos.terreno.valorUnitario"),
        NFactorNegociacion: factors.negotiation,
        NFactorUbicacion: factors.location,
        NFactorSuperficie: value("costos.terreno.factorSuperficie"),
        NFactorServicios: factors.services,
        NFactorClasificacion: factors.classification,
        NFactorTopografia: factors.topography,
        NFactorResultante: value("costos.terreno.factorResultante"),
        NValorUnitarioNeto: value("costos.terreno.valorUnitarioNeto"),
        NValorParcial: value("costos.terreno.valorParcial"),
      },
    });
  }

  const types = await tx.tipoConstruccionAvaluo.findMany({
    where: { construccionAvaluo: { IdVersionAvaluo: versionId } },
    select: { IdTipoConstruccionAvaluo: true, SReferencia: true },
  });
  for (const type of types) {
    const key = `costos.construcciones.${type.SReferencia}`;
    if (!trace.find(`${key}.vnrParcial`)) continue;
    await tx.costoConstruccion.updateMany({
      where: { IdEnfoqueCosto: approach.IdEnfoqueCosto, IdTipoConstruccionAvaluo: type.IdTipoConstruccionAvaluo },
      data: {
        NValorParcialVRN: value(`${key}.vrnParcial`),
        NFactorEdad: value(`${key}.factorEdad`),
        NFactorResultante: value(`${key}.factorResultante`),
        NValorUnitarioVNR: value(`${key}.vnrUnitario`),
        NValorParcialVNR: value(`${key}.vnrParcial`),
      },
    });
  }

  const installations = await tx.instalacionEspecialAvaluo.findMany({
    where: { IdVersionAvaluo: versionId },
    select: { IdInstalacionEspecialAvaluo: true, SReferencia: true },
  });
  for (const installation of installations) {
    const key = `costos.instalaciones.${installation.SReferencia}`;
    const resultant = trace.find(`${key}.factorResultante`);
    if (!resultant) continue;
    await tx.costoInstalacion.updateMany({
      where: { IdEnfoqueCosto: approach.IdEnfoqueCosto, IdInstalacionEspecialAvaluo: installation.IdInstalacionEspecialAvaluo },
      data: {
        NValorParcialVRN: value(`${key}.vrnParcial`),
        NFactorEdad: typeof resultant.inputs.factorEdad === "number" ? resultant.inputs.factorEdad : null,
        NFactorResultante: resultant.value,
        NValorUnitarioVNR: value(`${key}.vnrUnitario`),
        NValorParcialVNR: value(`${key}.vnrParcial`),
      },
    });
  }

  const indirects = await tx.costoIndirecto.findMany({ where: { IdVersionAvaluo: versionId }, orderBy: { IOrden: "asc" } });
  const usedIndirects = engineInput.input.indirects ?? [];
  for (const [index, row] of indirects.entries()) {
    const used = usedIndirects.findIndex((item) => item.concept === row.SConcepto);
    await tx.costoIndirecto.update({
      where: { IdCostoIndirecto: row.IdCostoIndirecto },
      data: { NValorCalculado: used === -1 ? null : value(`costos.indirectos.${used + 1}`), IOrden: index },
    });
  }

  const calculation = await catalogId(
    (key) => tx.calculoPermitido.findUnique({ where: { SClave: key } }),
    "VALOR_NETO_REPOSICION",
    (row) => row.IdCalculoPermitido,
  );
  await tx.ejecucionCalculo.create({
    data: {
      IdVersionAvaluo: versionId,
      IdCalculoPermitido: calculation,
      SClaveCalculo: CALCULATION_KEY,
      SVersionCalculo: ENGINE_VERSION,
      JValoresEntrada: engineInput.input as unknown as Prisma.InputJsonValue,
      JValoresSalida: result as unknown as Prisma.InputJsonValue,
      SPoliticaRedondeo: JSON.stringify(DEFAULT_ENGINE_CONFIG.rounding.costs).slice(0, 120),
      BExitoso: true,
      resultados: {
        create: trace.steps.map((step, index) => ({
          SClaveResultado: step.key.slice(0, 120),
          NValorNumerico: Number.isFinite(step.value) ? step.value : null,
          IOrden: index,
        })),
      },
    },
  });
}
