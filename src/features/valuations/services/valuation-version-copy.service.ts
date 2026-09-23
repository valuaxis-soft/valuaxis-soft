import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type VersionCopyStats = {
  sections: number;
  nodes: number;
  values: number;
  tables: number;
  columns: number;
  rows: number;
  cells: number;
  caratula: boolean;
  comparables: number;
};

/** Prisma needs DbNull (SQL NULL) instead of a plain null for JSON columns on create. */
function json(value: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function isRemovedTable(config: Prisma.JsonValue | null) {
  return Boolean(config && typeof config === "object" && !Array.isArray(config) && config.removed === true);
}

/**
 * Copies the whole document of one valuation version into another: sections, the
 * full node tree, node values, tables with their columns, rows and cells, the
 * caratula and the selected comparables. Soft-deleted nodes, columns and rows,
 * and removed tables, are not copied.
 */
export async function copyVersionContent(
  tx: Tx,
  input: { fromVersionId: number; toVersionId: number },
): Promise<VersionCopyStats> {
  const stats: VersionCopyStats = {
    sections: 0,
    nodes: 0,
    values: 0,
    tables: 0,
    columns: 0,
    rows: 0,
    cells: 0,
    caratula: false,
    comparables: 0,
  };

  const sections = await tx.seccionDocumento.findMany({
    where: { IdVersionAvaluo: input.fromVersionId },
    include: { nodos: { where: { DFechaEliminacion: null } } },
    orderBy: { IOrden: "asc" },
  });

  const nodeIdMap = new Map<number, number>();
  for (const section of sections) {
    const copiedSection = await tx.seccionDocumento.create({
      data: {
        IdVersionAvaluo: input.toVersionId,
        IdSeccionPlantilla: section.IdSeccionPlantilla,
        SClave: section.SClave,
        SNombre: section.SNombre,
        SDescripcion: section.SDescripcion,
        IOrden: section.IOrden,
        BVisible: section.BVisible,
        BObligatoria: section.BObligatoria,
        BEliminable: section.BEliminable,
        JConfiguracion: json(section.JConfiguracion),
      },
    });
    stats.sections += 1;

    // Parents before children. A child whose parent was deleted is not copied.
    const liveIds = new Set(section.nodos.map((node) => node.IdNodoDocumento));
    let pending = section.nodos.filter((node) => node.IdNodoPadre === null || liveIds.has(node.IdNodoPadre));
    while (pending.length) {
      const ready = pending.filter((node) => node.IdNodoPadre === null || nodeIdMap.has(node.IdNodoPadre));
      if (!ready.length) break;
      for (const node of ready) {
        const copied = await tx.nodoDocumento.create({
          data: {
            IdSeccionDocumento: copiedSection.IdSeccionDocumento,
            IdNodoPadre: node.IdNodoPadre === null ? null : nodeIdMap.get(node.IdNodoPadre)!,
            IdNodoPlantilla: node.IdNodoPlantilla,
            IdTipoNodoDocumento: node.IdTipoNodoDocumento,
            IdTipoDato: node.IdTipoDato,
            SClave: node.SClave,
            STitulo: node.STitulo,
            SDescripcion: node.SDescripcion,
            IOrden: node.IOrden,
            BVisible: node.BVisible,
            BObligatorio: node.BObligatorio,
            BEliminable: node.BEliminable,
            BRepetible: node.BRepetible,
            JConfiguracion: json(node.JConfiguracion),
          },
        });
        nodeIdMap.set(node.IdNodoDocumento, copied.IdNodoDocumento);
        stats.nodes += 1;
      }
      const readyIds = new Set(ready.map((node) => node.IdNodoDocumento));
      pending = pending.filter((node) => !readyIds.has(node.IdNodoDocumento));
    }
  }

  const oldNodeIds = [...nodeIdMap.keys()];
  if (oldNodeIds.length) {
    const values = await tx.valorNodoDocumento.findMany({
      where: { IdVersionAvaluo: input.fromVersionId, IdNodoDocumento: { in: oldNodeIds } },
    });
    if (values.length) {
      const created = await tx.valorNodoDocumento.createMany({
        data: values.map((value) => ({
          IdNodoDocumento: nodeIdMap.get(value.IdNodoDocumento)!,
          IdVersionAvaluo: input.toVersionId,
          IdTipoDato: value.IdTipoDato,
          IdOrigenDato: value.IdOrigenDato,
          SValorTexto: value.SValorTexto,
          NValorNumerico: value.NValorNumerico,
          BValorBooleano: value.BValorBooleano,
          DValorFecha: value.DValorFecha,
          JValorComplejo: json(value.JValorComplejo),
        })),
      });
      stats.values = created.count;
    }

    const tables = await tx.tablaDocumento.findMany({
      where: { IdNodoDocumento: { in: oldNodeIds } },
      include: {
        columnas: { where: { DFechaEliminacion: null } },
        filas: { where: { BActivo: true }, include: { celdas: true } },
      },
    });
    for (const table of tables.filter((item) => !isRemovedTable(item.JConfiguracion))) {
      const copiedTable = await tx.tablaDocumento.create({
        data: {
          IdNodoDocumento: nodeIdMap.get(table.IdNodoDocumento)!,
          SNombre: table.SNombre,
          SDescripcion: table.SDescripcion,
          IOrden: table.IOrden,
          BPermiteFilas: table.BPermiteFilas,
          BPermiteColumnas: table.BPermiteColumnas,
          BMostrarTotales: table.BMostrarTotales,
          JConfiguracion: json(table.JConfiguracion),
        },
      });
      stats.tables += 1;

      const columnIdMap = new Map<number, number>();
      for (const column of table.columnas) {
        const copiedColumn = await tx.columnaTablaDocumento.create({
          data: {
            IdTablaDocumento: copiedTable.IdTablaDocumento,
            IdTipoDato: column.IdTipoDato,
            IdTipoColumna: column.IdTipoColumna,
            IdCalculoPermitido: column.IdCalculoPermitido,
            SClave: column.SClave,
            SNombre: column.SNombre,
            SDescripcion: column.SDescripcion,
            IOrden: column.IOrden,
            BEditable: column.BEditable,
            BObligatoria: column.BObligatoria,
            BVisible: column.BVisible,
            BPermiteNulos: column.BPermiteNulos,
            BResultadoSobrescribible: column.BResultadoSobrescribible,
            INumeroDecimales: column.INumeroDecimales,
            SFormatoVisual: column.SFormatoVisual,
            SUnidad: column.SUnidad,
            JConfiguracion: json(column.JConfiguracion),
            JValidaciones: json(column.JValidaciones),
          },
        });
        columnIdMap.set(column.IdColumnaTablaDocumento, copiedColumn.IdColumnaTablaDocumento);
        stats.columns += 1;
      }

      for (const row of table.filas) {
        const copiedRow = await tx.filaTablaDocumento.create({
          data: {
            IdTablaDocumento: copiedTable.IdTablaDocumento,
            SClave: row.SClave,
            IOrden: row.IOrden,
            BActivo: true,
            JMetadatos: json(row.JMetadatos),
          },
        });
        stats.rows += 1;

        const cells = row.celdas.filter((cell) => columnIdMap.has(cell.IdColumnaTablaDocumento));
        if (cells.length) {
          const created = await tx.celdaTablaDocumento.createMany({
            data: cells.map((cell) => ({
              IdFilaTablaDocumento: copiedRow.IdFilaTablaDocumento,
              IdColumnaTablaDocumento: columnIdMap.get(cell.IdColumnaTablaDocumento)!,
              IdOrigenDato: cell.IdOrigenDato,
              SValorTexto: cell.SValorTexto,
              NValorNumerico: cell.NValorNumerico,
              BValorBooleano: cell.BValorBooleano,
              DValorFecha: cell.DValorFecha,
              JValorComplejo: json(cell.JValorComplejo),
              BEsCalculado: cell.BEsCalculado,
            })),
          });
          stats.cells += created.count;
        }
      }
    }
  }

  const caratula = await tx.caratulaAvaluo.findUnique({ where: { IdVersionAvaluo: input.fromVersionId } });
  if (caratula) {
    const { IdCaratulaAvaluo: _id, DFechaCreacion: _created, DFechaModificacion: _modified, ...data } = caratula;
    await tx.caratulaAvaluo.create({ data: { ...data, IdVersionAvaluo: input.toVersionId } });
    stats.caratula = true;
  }

  const comparables = await tx.comparableAvaluo.findMany({
    where: { IdVersionAvaluo: input.fromVersionId },
    include: { ajustesComparables: true },
  });
  for (const comparable of comparables) {
    const copied = await tx.comparableAvaluo.create({
      data: {
        IdAvaluo: comparable.IdAvaluo,
        IdVersionAvaluo: input.toVersionId,
        IdPropiedad: comparable.IdPropiedad,
        IdPublicacionPropiedad: comparable.IdPublicacionPropiedad,
        IdUsuarioSeleccion: comparable.IdUsuarioSeleccion,
        IdTipoComparable: comparable.IdTipoComparable,
        IReferencia: comparable.IReferencia,
        IOrden: comparable.IOrden,
        NPorcentajeSimilitud: comparable.NPorcentajeSimilitud,
        NDistanciaMetros: comparable.NDistanciaMetros,
        NPrecioCapturado: comparable.NPrecioCapturado,
        NSuperficieTerrenoCapturada: comparable.NSuperficieTerrenoCapturada,
        NSuperficieConstruccionCapturada: comparable.NSuperficieConstruccionCapturada,
        NSuperficieRentableCapturada: comparable.NSuperficieRentableCapturada,
        NValorUnitarioCapturado: comparable.NValorUnitarioCapturado,
        BIncluido: comparable.BIncluido,
        SMotivoSeleccion: comparable.SMotivoSeleccion,
        SMotivoExclusion: comparable.SMotivoExclusion,
        JPropiedadSnapshot: comparable.JPropiedadSnapshot as Prisma.InputJsonValue,
        JPublicacionSnapshot: json(comparable.JPublicacionSnapshot),
        JDireccionSnapshot: comparable.JDireccionSnapshot as Prisma.InputJsonValue,
        JUbicacionSnapshot: comparable.JUbicacionSnapshot as Prisma.InputJsonValue,
        JImagenesSnapshot: json(comparable.JImagenesSnapshot),
        DFechaSeleccion: comparable.DFechaSeleccion,
        DFechaExclusion: comparable.DFechaExclusion,
      },
    });
    if (comparable.ajustesComparables.length) {
      await tx.ajusteComparable.createMany({
        data: comparable.ajustesComparables.map((ajuste) => ({
          IdComparableAvaluo: copied.IdComparableAvaluo,
          SConcepto: ajuste.SConcepto,
          NValorOriginal: ajuste.NValorOriginal,
          NFactor: ajuste.NFactor,
          NValorAjustado: ajuste.NValorAjustado,
          SJustificacion: ajuste.SJustificacion,
          IOrden: ajuste.IOrden,
        })),
      });
    }
    stats.comparables += 1;
  }

  return stats;
}
