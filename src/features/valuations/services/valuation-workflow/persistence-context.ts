import { ValuationWorkflowError } from "./errors";
import type { SectionPayload, Tx } from "./types";

export type DocumentPersistenceCatalogs = {
  nodeTypes: Record<string, number>;
  dataTypes: Record<string, number>;
  originId: number;
  columnTypeId: number;
};

export type PersistenceStats = {
  sectionsReceived: number;
  nodesReceived: number;
  tablesReceived: number;
  nodesCreated: number;
  nodesUpdated: number;
  nodesSoftDeleted: number;
  valuesUpserted: number;
  tablesUpserted: number;
  columnsUpserted: number;
  rowsUpserted: number;
  cellsUpserted: number;
};

export async function getDocumentPersistenceCatalogs(tx: Tx): Promise<DocumentPersistenceCatalogs> {
  const [nodeTypes, dataTypes, origin, columnType] = await Promise.all([
    tx.tipoNodoDocumento.findMany({ where: { BActivo: true }, select: { IdTipoNodoDocumento: true, SClave: true } }),
    tx.tipoDato.findMany({ where: { BActivo: true }, select: { IdTipoDato: true, SClave: true } }),
    tx.origenDato.findFirst({
      where: { BActivo: true, SClave: { equals: "USUARIO", mode: "insensitive" } },
      orderBy: { IOrden: "asc" },
      select: { IdOrigenDato: true },
    }),
    tx.tipoColumna.findFirst({
      where: { BActivo: true, SClave: { equals: "CAPTURA", mode: "insensitive" } },
      orderBy: { IOrden: "asc" },
      select: { IdTipoColumna: true },
    }),
  ]);
  if (!origin) throw new ValuationWorkflowError("No existe origen de dato USUARIO activo", 500);
  if (!columnType) throw new ValuationWorkflowError("No existe tipo de columna CAPTURA activo", 500);

  return {
    nodeTypes: Object.fromEntries(nodeTypes.map((item) => [item.SClave, item.IdTipoNodoDocumento])),
    dataTypes: Object.fromEntries(dataTypes.map((item) => [item.SClave, item.IdTipoDato])),
    originId: origin.IdOrigenDato,
    columnTypeId: columnType.IdTipoColumna,
  };
}

export function logPersistenceOperation(operation: string, details: Record<string, unknown>) {
  if (process.env.VALUATION_SAVE_DEBUG === "1") {
    console.debug("[VALUATION_PERSISTENCE]", operation, details);
  }
}

export function createPersistenceStats(sections: SectionPayload[]): PersistenceStats {
  const nodesReceived = sections.reduce(
    (total, section) =>
      total +
      (section.blocks ?? []).reduce(
        (blockTotal, block) =>
          blockTotal +
          1 +
          (block.concepts?.length ?? 0) +
          (block.images?.length ?? 0) +
          (block.subBlocks ?? []).reduce(
            (subTotal, subBlock) =>
              subTotal +
              1 +
              (subBlock.concepts?.length ?? 0) +
              (subBlock.images?.length ?? 0),
            0,
          ),
        0,
      ),
    0,
  );
  const tablesReceived = sections.reduce(
    (total, section) =>
      total +
      (section.blocks ?? []).reduce(
        (blockTotal, block) =>
          blockTotal +
          (block.tables?.length ?? 0) +
          (block.subBlocks ?? []).reduce((subTotal, subBlock) => subTotal + (subBlock.tables?.length ?? 0), 0),
        0,
      ),
    0,
  );
  return {
    sectionsReceived: sections.length,
    nodesReceived,
    tablesReceived,
    nodesCreated: 0,
    nodesUpdated: 0,
    nodesSoftDeleted: 0,
    valuesUpserted: 0,
    tablesUpserted: 0,
    columnsUpserted: 0,
    rowsUpserted: 0,
    cellsUpserted: 0,
  };
}

export function logPersistenceStats(stats: PersistenceStats) {
  if (process.env.VALUATION_PERSISTENCE_DEBUG === "1") {
    console.info("[valuation-persistence]", stats);
  }
}
