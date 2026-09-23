import { Prisma } from "@prisma/client";
import { ensureTableV2 } from "@/features/valuations/services/table";
import { encodeTableCell } from "@/features/valuations/services/table-persistence";
import {
  DOCUMENT_COLUMN_KEY_MAX_LENGTH,
  DOCUMENT_COLUMN_NAME_MAX_LENGTH,
  DOCUMENT_ROW_KEY_MAX_LENGTH,
  DOCUMENT_TABLE_NAME_MAX_LENGTH,
  emptyValueColumns,
  limitDbText,
  normalizeDbKey,
  slugDbKey,
} from "./db-values";
import type { DocumentPersistenceCatalogs, PersistenceStats } from "./persistence-context";
import type { TablePayload, Tx } from "./types";

export function normalizeDocumentTableColumnForPersistence(input: {
  generatedKey: string;
  label: string;
  index: number;
}) {
  const sourceKey = input.generatedKey.trim();
  const fallbackKey = `columna_${input.index}_${slugDbKey(input.label) || "valor"}`;
  const SClave = normalizeDbKey(sourceKey, fallbackKey, DOCUMENT_COLUMN_KEY_MAX_LENGTH);
  const SNombre = limitDbText(input.label.trim() || "Nueva columna", DOCUMENT_COLUMN_NAME_MAX_LENGTH);
  const JConfiguracion: Record<string, string> = {};

  if (SClave !== sourceKey) JConfiguracion.sourceKey = sourceKey;
  if (SNombre !== input.label) JConfiguracion.fullLabel = input.label;

  return { SClave, SNombre, JConfiguracion };
}

export function normalizeDocumentTableRowForPersistence(input: {
  tableId?: string;
  tableIndex: number;
  index: number;
}) {
  const legacyKey = `${input.tableId ?? `table-${input.tableIndex}`}-row-${input.index + 1}`;
  const SClave = normalizeDbKey(`fila_${input.index}`, `fila_${input.index}`, DOCUMENT_ROW_KEY_MAX_LENGTH);
  const JMetadatos: Record<string, string | number> = {
    clientIndex: input.index,
  };

  if (input.tableId) JMetadatos.sourceKey = input.tableId;
  if (legacyKey !== SClave) JMetadatos.legacyKey = legacyKey;

  return { SClave, legacyKey, JMetadatos };
}

export async function syncTablesForNode(input: {
  tx: Tx;
  catalogs: DocumentPersistenceCatalogs;
  nodeId: number;
  tables: TablePayload[];
  stats: PersistenceStats;
}) {
  for (const [tableIndex, table] of input.tables.entries()) {
    const tableTitle = table.title ?? `Tabla ${tableIndex + 1}`;
    const tableName = limitDbText(tableTitle, DOCUMENT_TABLE_NAME_MAX_LENGTH);
    const tableConfig: Record<string, unknown> = {
      clientId: table.id ?? null,
      enabled: table.enabled ?? true,
      version: 2,
    };
    if (table.boundaryDistanceFormats?.length) {
      tableConfig.boundaryDistanceFormats = table.boundaryDistanceFormats.map((format) => ({
        ...(format.valueFormat ? { valueFormat: format.valueFormat } : {}),
        ...(format.customUnit?.trim() ? { customUnit: format.customUnit.trim() } : {}),
      }));
    }
    if (tableName !== tableTitle) tableConfig.fullTitle = tableTitle;
    if (table.schema) tableConfig.schema = table.schema;
    const savedTable = await input.tx.tablaDocumento.upsert({
      where: {
        IdNodoDocumento_IOrden: {
          IdNodoDocumento: input.nodeId,
          IOrden: tableIndex,
        },
      },
      update: {
        SNombre: tableName,
        BPermiteColumnas: true,
        JConfiguracion: tableConfig as Prisma.InputJsonObject,
      },
      create: {
        IdNodoDocumento: input.nodeId,
        SNombre: tableName,
        IOrden: tableIndex,
        BPermiteColumnas: true,
        JConfiguracion: tableConfig as Prisma.InputJsonObject,
      },
    });
    input.stats.tablesUpserted += 1;

    // Normalize to V2 — handles legacy, V2, and mixed tables uniformly
    const tableV2 = ensureTableV2(table);
    if (tableV2.schema) tableConfig.schema = tableV2.schema;

    const savedColumns = [];
    for (const [columnIndex, col] of tableV2.columns.entries()) {
      const generatedKey = col.id;
      const normalizedColumn = normalizeDocumentTableColumnForPersistence({
        generatedKey,
        label: col.name,
        index: columnIndex,
      });
      const columnKey = normalizedColumn.SClave;
      const existing = await input.tx.columnaTablaDocumento.findFirst({
        where: { IdTablaDocumento: savedTable.IdTablaDocumento, SClave: columnKey, DFechaEliminacion: null },
        select: { IdColumnaTablaDocumento: true },
      });
      const columnData = {
        IdTipoDato: input.catalogs.dataTypes.TEXTO,
        IdTipoColumna: input.catalogs.columnTypeId,
        SClave: normalizedColumn.SClave,
        SNombre: normalizedColumn.SNombre,
        IOrden: columnIndex,
        BVisible: true,
        JConfiguracion: {
          clientIndex: columnIndex,
          clientId: col.id,
          ...(col.format ? { format: col.format } : {}),
          ...normalizedColumn.JConfiguracion,
        } as Prisma.InputJsonObject,
        DFechaEliminacion: null,
      };
      const savedColumn = existing
        ? await input.tx.columnaTablaDocumento.update({
            where: { IdColumnaTablaDocumento: existing.IdColumnaTablaDocumento },
            data: columnData,
          })
        : await input.tx.columnaTablaDocumento.create({
            data: {
              ...columnData,
              IdTablaDocumento: savedTable.IdTablaDocumento,
            },
          });
      input.stats.columnsUpserted += 1;
      savedColumns.push(savedColumn);
    }

    const savedRowIds: bigint[] = [];
    for (const [rowIndex, row] of tableV2.rows.entries()) {
      const normalizedRow = normalizeDocumentTableRowForPersistence({
        tableId: tableV2.id,
        tableIndex,
        index: rowIndex,
      });
      const rowKey = normalizedRow.SClave;
      const legacyRowKey = normalizedRow.legacyKey;
      const rowMetadata = { ...normalizedRow.JMetadatos, clientId: row.id } as Prisma.InputJsonObject;
      const existingRow = await input.tx.filaTablaDocumento.findFirst({
        where: {
          IdTablaDocumento: savedTable.IdTablaDocumento,
          OR: [
            { SClave: rowKey },
            ...(legacyRowKey !== rowKey && legacyRowKey.length <= DOCUMENT_ROW_KEY_MAX_LENGTH
              ? [{ SClave: legacyRowKey }]
              : []),
          ],
        },
        select: { IdFilaTablaDocumento: true },
      });
      const savedRow = existingRow
        ? await input.tx.filaTablaDocumento.update({
            where: { IdFilaTablaDocumento: existingRow.IdFilaTablaDocumento },
            data: {
              SClave: rowKey,
              IOrden: rowIndex,
              BActivo: true,
              JMetadatos: rowMetadata,
            },
          })
        : await input.tx.filaTablaDocumento.create({
            data: {
              IdTablaDocumento: savedTable.IdTablaDocumento,
              SClave: rowKey,
              IOrden: rowIndex,
              BActivo: true,
              JMetadatos: rowMetadata,
            },
          });
      input.stats.rowsUpserted += 1;
      savedRowIds.push(savedRow.IdFilaTablaDocumento);

      for (const [colIndex, savedColumn] of savedColumns.entries()) {
        const col = tableV2.columns[colIndex];
        if (!col) continue;
        const stored = encodeTableCell(row.cells[col.id]);
        const cellData = {
          IdOrigenDato: input.catalogs.originId,
          ...emptyValueColumns(),
          SValorTexto: stored.text,
          BEsCalculado: stored.calculated,
          ...(stored.complex ? { JValorComplejo: stored.complex as unknown as Prisma.InputJsonObject } : {}),
        };
        await input.tx.celdaTablaDocumento.upsert({
          where: {
            IdFilaTablaDocumento_IdColumnaTablaDocumento: {
              IdFilaTablaDocumento: savedRow.IdFilaTablaDocumento,
              IdColumnaTablaDocumento: savedColumn.IdColumnaTablaDocumento,
            },
          },
          update: cellData,
          create: {
            IdFilaTablaDocumento: savedRow.IdFilaTablaDocumento,
            IdColumnaTablaDocumento: savedColumn.IdColumnaTablaDocumento,
            ...cellData,
          },
        });
        input.stats.cellsUpserted += 1;
      }
    }

    // Columns and rows the editor removed must not come back on reload.
    await input.tx.columnaTablaDocumento.updateMany({
      where: {
        IdTablaDocumento: savedTable.IdTablaDocumento,
        DFechaEliminacion: null,
        IdColumnaTablaDocumento: { notIn: savedColumns.map((column) => column.IdColumnaTablaDocumento) },
      },
      data: { DFechaEliminacion: new Date() },
    });
    await input.tx.filaTablaDocumento.updateMany({
      where: {
        IdTablaDocumento: savedTable.IdTablaDocumento,
        BActivo: true,
        IdFilaTablaDocumento: { notIn: savedRowIds },
      },
      data: { BActivo: false },
    });
  }

  // Tables the editor removed from this node are marked so the loader skips them.
  await input.tx.tablaDocumento.updateMany({
    where: { IdNodoDocumento: input.nodeId, IOrden: { gte: input.tables.length } },
    data: { JConfiguracion: { removed: true } as Prisma.InputJsonObject },
  });
}
