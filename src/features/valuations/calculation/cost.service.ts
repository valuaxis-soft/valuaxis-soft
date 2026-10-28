/**
 * Cost approach of a valuation version: land settings, the construction types
 * it picks (with its own columns), special installations and indirects, saved
 * as a whole, and the stored result with its trace. The land unit value and
 * the lote tipo default to the ones of the land market. The types themselves
 * are captured in the construction section (construction-types.service.ts).
 */
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { ENGINE_VERSION } from "../engine/config";
import { computeCostApproach } from "../engine/costs";
import { Trace } from "../engine/trace";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";
import { asRecord, catalogId, decimal, findValuation, formulasOrThrow, writableVersion, type Tx } from "./access";
import { renumberFormulas, storedFormulas, type CapturedFormulas } from "./captured-formulas";
import { recomputeConclusion } from "./conclusion.service";
import { constructionOf, createConstructionType, loadConstructionTypes, typeFormulasOf, updateBuiltArea } from "./construction-types.service";
import type { CostInputPayload } from "./cost-schemas";
import {
  COST_PERCENT_FIELDS,
  DEFAULT_COST_ROUNDING,
  DEFAULT_LAND,
  costColumnsOf,
  costEngineConfig,
  isConservationRating,
  toCostEngineInput,
  type CostCalculationDto,
  type CostColumnsDto,
  type CostLandDto,
  type CostRoundingDto,
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

type StoredCost = Omit<CostCalculationDto, "market" | "configured" | "typesCaptured" | "locked">;

/**
 * Factors typed over their Excel formula, and the calificación of the
 * conservation; a row missing here (or an older capture) takes the formulas
 * and has no calificación.
 */
type CapturedFactors = {
  ageFactor: number | null;
  resultantFactor: number | null;
  conservationRating: number | null;
  /** The factors added after "Otro" (CostColumnsDto), in the order of their columns. */
  extraFactors: number[];
};
type StoredFactors = {
  /** By construction type id, as the cost rows themselves. */
  constructions?: Record<string, CapturedFactors>;
  /** By installation reference: the installations are rewritten on every save. */
  installations?: Record<string, CapturedFactors>;
};

const capturedOf = (stored: Partial<CapturedFactors> | undefined): CapturedFactors => ({
  ageFactor: typeof stored?.ageFactor === "number" ? stored.ageFactor : null,
  resultantFactor: typeof stored?.resultantFactor === "number" ? stored.resultantFactor : null,
  conservationRating: isConservationRating(stored?.conservationRating) ? stored.conservationRating : null,
  extraFactors: Array.isArray(stored?.extraFactors)
    ? stored.extraFactors.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    : [],
});
const refKey = (ref: string) => ref.trim().toLowerCase();

async function loadInput(tx: Tx, versionId: number): Promise<StoredCost> {
  const [approach, types, installations, indirects] = await Promise.all([
    tx.enfoqueCosto.findUnique({
      where: { IdVersionAvaluo: versionId },
      include: { costosConstrucciones: { orderBy: { IOrden: "asc" } }, costosInstalaciones: true },
    }),
    loadConstructionTypes(tx, versionId),
    tx.instalacionEspecialAvaluo.findMany({
      where: { IdVersionAvaluo: versionId },
      include: { tipoParticipacion: { select: { SClave: true } } },
      orderBy: { IOrden: "asc" },
    }),
    tx.costoIndirecto.findMany({ where: { IdVersionAvaluo: versionId }, orderBy: { IOrden: "asc" } }),
  ]);
  const configuration = asRecord(approach?.JConfiguracion ?? null);
  const land = configuration.land as Partial<CostLandDto> | undefined;
  const rounding = configuration.rounding as CostRoundingDto | undefined;
  const factors = (configuration.factors ?? {}) as StoredFactors;
  const typeById = new Map(types.map((type) => [type.id, type]));
  const costByInstallation = new Map(approach?.costosInstalaciones.map((row) => [row.IdInstalacionEspecialAvaluo, row]) ?? []);
  // The grade of completion and the undivided share live with the type row but belong to the cost capture.
  const typeShares = new Map((await tx.tipoConstruccionAvaluo.findMany({
    where: { IdTipoConstruccionAvaluo: { in: types.map((type) => type.id) } },
    select: { IdTipoConstruccionAvaluo: true, NGradoTerminacion: true, NIndiviso: true },
  })).map((row) => [row.IdTipoConstruccionAvaluo, row]));
  return {
    land: { ...DEFAULT_LAND, ...land, factors: { ...DEFAULT_LAND.factors, ...land?.factors } },
    types,
    // A construction of the cost approach is a type it picked, in the order it picked them.
    constructions: (approach?.costosConstrucciones ?? []).flatMap((cost) => {
      const type = typeById.get(cost.IdTipoConstruccionAvaluo);
      if (!type) return [];
      const shares = typeShares.get(type.id);
      const captured = capturedOf(factors.constructions?.[String(type.id)]);
      return [{
        ...type,
        conservation: decimal(cost.NFactorConservacion),
        conservationRating: captured.conservationRating,
        ageFactor: captured.ageFactor,
        otherFactor: decimal(cost.NFactorOtro) ?? 1,
        extraFactors: captured.extraFactors,
        resultantFactor: captured.resultantFactor,
        completion: decimal(shares?.NGradoTerminacion) ?? 1,
        undivided: decimal(shares?.NIndiviso) ?? 1,
        unitReplacementCost: decimal(cost.NValorUnitarioReposicionNuevo),
      }];
    }),
    installations: installations.map((row) => {
      const cost = costByInstallation.get(row.IdInstalacionEspecialAvaluo);
      const captured = capturedOf(factors.installations?.[refKey(row.SReferencia ?? "")]);
      return {
        ref: row.SReferencia ?? "",
        description: row.SDescripcion,
        share: row.tipoParticipacion.SClave === "COMUN" ? "C" as const : "P" as const,
        unit: row.SUnidad ?? "",
        quantity: decimal(row.NCantidad),
        age: decimal(row.NEdad),
        usefulLife: decimal(row.NVidaUtil),
        conservation: decimal(cost?.NFactorConservacion),
        conservationRating: captured.conservationRating,
        maintenance: row.SMantenimiento ?? "",
        ageFactor: captured.ageFactor,
        otherFactor: decimal(cost?.NFactorOtro) ?? 1,
        extraFactors: captured.extraFactors,
        resultantFactor: captured.resultantFactor,
        completion: decimal(row.NGradoTerminacion) ?? 1,
        undivided: decimal(row.NIndiviso) ?? 1,
        unitReplacementCost: decimal(cost?.NValorUnitarioVRN),
      };
    }),
    indirects: indirects.map((row) => ({ concept: row.SConcepto, percentage: decimal(row.NPorcentaje), base: decimal(row.NValorBase) })),
    ...(rounding ? { rounding: { ...DEFAULT_COST_ROUNDING, ...rounding } } : {}),
    columns: costColumnsOf(configuration.columns),
    formulas: storedFormulas(configuration.formulas),
  };
}

export async function getCostCalculation(publicId: string, organizationId: number): Promise<CostCalculationDto> {
  return prisma.$transaction(async (tx) => {
    const avaluo = await findValuation(tx, publicId, organizationId);
    const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
    if (!versionId) {
      return {
        land: DEFAULT_LAND, constructions: [], types: [], installations: [], indirects: [], columns: costColumnsOf(null),
        market: { adoptedUnitValue: null, subjectArea: null, baseArea: null }, configured: false, typesCaptured: false, locked: avaluo.BBloqueado,
      };
    }
    const [input, market, approach, construction] = await Promise.all([
      loadInput(tx, versionId),
      landMarket(tx, versionId),
      tx.enfoqueCosto.findUnique({ where: { IdVersionAvaluo: versionId }, select: { IdEnfoqueCosto: true } }),
      tx.construccionAvaluo.findFirst({ where: { IdVersionAvaluo: versionId }, orderBy: { IdConstruccionAvaluo: "asc" }, select: { IdConstruccionAvaluo: true, JDatosAdicionales: true } }),
    ]);
    return {
      ...input,
      typeFormulas: typeFormulasOf(construction),
      market,
      configured: Boolean(approach),
      typesCaptured: Boolean(construction),
      locked: avaluo.BBloqueado,
    };
  });
}

const storedConfiguration = (payload: CostInputPayload, factors: StoredFactors, formulas: CapturedFormulas, columns: CostColumnsDto) =>
  ({ land: payload.land, ...(payload.rounding ? { rounding: payload.rounding } : {}), columns, factors, formulas }) as Prisma.InputJsonValue;

const capturedFactors = (row: Partial<CapturedFactors>): CapturedFactors => capturedOf(row);
const hasCaptured = (row: Partial<CapturedFactors>) => {
  const factors = capturedOf(row);
  return factors.ageFactor !== null || factors.resultantFactor !== null || factors.conservationRating !== null || factors.extraFactors.length > 0;
};

/** Replaces the whole capture of the version and recomputes the approach. */
export async function saveCostCalculation(publicId: string, user: AuthUser, payload: CostInputPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    // Indirects without a concept are not kept: the formulas of the ones that are follow their new position.
    const keptIndirects = payload.indirects.flatMap((row, index) => (row.concept.trim() ? [index] : []));
    const indirects = keptIndirects.map((index) => payload.indirects[index]);
    const previous = await loadInput(tx, versionId);
    const formulas = formulasOrThrow({
      next: { ...payload, indirects },
      sent: payload.formulas && renumberFormulas(payload.formulas, "indirects", keptIndirects),
      previous,
      previousFormulas: previous.formulas ?? {},
      percent: COST_PERCENT_FIELDS,
    });
    // A client that sends no columns (older ones) keeps the names and factors already set.
    const columns = costColumnsOf(payload.columns ?? previous.columns);
    const factors: Required<StoredFactors> = {
      constructions: {},
      installations: Object.fromEntries(payload.installations.filter(hasCaptured).map((row) => [refKey(row.ref), capturedFactors(row)])),
    };
    const approach = await tx.enfoqueCosto.upsert({
      where: { IdVersionAvaluo: versionId },
      create: { IdVersionAvaluo: versionId, JConfiguracion: storedConfiguration(payload, factors, formulas, columns) },
      update: { JConfiguracion: storedConfiguration(payload, factors, formulas, columns) },
    });

    await tx.costoConstruccion.deleteMany({ where: { IdEnfoqueCosto: approach.IdEnfoqueCosto } });
    await tx.costoInstalacion.deleteMany({ where: { IdEnfoqueCosto: approach.IdEnfoqueCosto } });
    await tx.costoTerreno.deleteMany({ where: { IdEnfoqueCosto: approach.IdEnfoqueCosto } });
    await tx.costoIndirecto.deleteMany({ where: { IdVersionAvaluo: versionId } });
    await tx.instalacionEspecialAvaluo.deleteMany({ where: { IdVersionAvaluo: versionId } });

    // The types stay as the construction section captured them; the cost approach only picks them.
    // The construction record is created only when a capture needs it (see constructionTablesFollowCapture).
    let construction: { IdConstruccionAvaluo: number } | null = null;
    const types = await loadConstructionTypes(tx, versionId);
    const typeByRef = new Map(types.map((type) => [type.ref.trim().toLowerCase(), type]));
    let createdTypes = 0;
    for (const [index, row] of payload.constructions.entries()) {
      let type = typeByRef.get(row.ref.trim().toLowerCase());
      if (!type) {
        // A capture that still carries the type's data (saved before the types had their own panel) creates it.
        const carriesType = row.area !== undefined || row.age !== undefined || row.usefulLife !== undefined || row.description !== undefined;
        if (!carriesType) throw new ValuationWorkflowError(`La construcción ${row.ref} no está en los tipos de la sección de construcciones.`, 400);
        construction ??= await constructionOf(tx, versionId);
        const created = await createConstructionType(tx, construction.IdConstruccionAvaluo, {
          ref: row.ref, description: row.description ?? "", classification: row.classification ?? "", quality: row.quality ?? "",
          area: row.area ?? null, age: row.age ?? null, usefulLife: row.usefulLife ?? null,
        }, types.length + createdTypes++);
        type = { id: created.IdTipoConstruccionAvaluo, ref: row.ref, description: "", classification: "", quality: "", area: null, age: null, usefulLife: null };
        typeByRef.set(row.ref.trim().toLowerCase(), type);
      }
      if (hasCaptured(row)) factors.constructions[String(type.id)] = capturedFactors(row);
      await tx.tipoConstruccionAvaluo.update({
        where: { IdTipoConstruccionAvaluo: type.id },
        data: { NGradoTerminacion: row.completion, NIndiviso: row.undivided },
      });
      await tx.costoConstruccion.create({
        data: {
          IdEnfoqueCosto: approach.IdEnfoqueCosto,
          IdTipoConstruccionAvaluo: type.id,
          NValorUnitarioReposicionNuevo: row.unitReplacementCost,
          NFactorConservacion: row.conservation,
          NFactorOtro: row.otherFactor,
          IOrden: index,
        },
      });
    }
    if (construction && createdTypes) await updateBuiltArea(tx, construction.IdConstruccionAvaluo);
    if (Object.keys(factors.constructions).length) {
      await tx.enfoqueCosto.update({ where: { IdEnfoqueCosto: approach.IdEnfoqueCosto }, data: { JConfiguracion: storedConfiguration(payload, factors, formulas, columns) } });
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

    for (const [index, row] of indirects.entries()) {
      await tx.costoIndirecto.create({
        data: { IdVersionAvaluo: versionId, SConcepto: row.concept, NPorcentaje: row.percentage, NValorBase: row.base, IOrden: index },
      });
    }

    await recomputeCosts(tx, versionId);
  });
}

/** Recomputes the approach from what is stored, saves the result and its trace, and updates the conclusion. */
export async function recomputeCosts(tx: Tx, versionId: number) {
  await recomputeCostsValues(tx, versionId);
  await recomputeConclusion(tx, versionId);
}

async function recomputeCostsValues(tx: Tx, versionId: number) {
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
  const config = costEngineConfig(input);
  const result = computeCostApproach(engineInput.input, config, trace);
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
        NFactorEdad: value(`${key}.factorEdad`),
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
      SPoliticaRedondeo: JSON.stringify(config.rounding.costs).slice(0, 120),
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
