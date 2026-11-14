"use client";

import { Plus } from "lucide-react";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  captureColumnIds,
  computedColumnIds,
  isCaptureUnlinked,
  normalizeCapture,
  readCapture,
  withNewCaptureRow,
  type CaptureKind,
} from "@/features/valuations/calculation/construction-capture";
import { constructionTypesLinkedToCosts, costColumnsOf, type CostCalculationDto } from "@/features/valuations/calculation/cost-types";
import type { TableContent } from "@/features/valuations/model";
import { ensureTableV2 } from "@/features/valuations/services/table";
import { CalculationLinkBadge } from "../calculation/calculation-link-badge";
import { CalculatedTableProvider, type CalculatedTableLock } from "./calculated-table-context";
import { deleteConfirmation } from "./delete-confirm";
import { TableEditorItem } from "./table-editor";

/**
 * What the capture tables of the construction section need from the
 * workspace: which tables they are, the cost approach as the server holds it
 * (its conservation factors, the types it took in) and how to change the
 * link with it.
 */
export type ConstructionCaptureContextValue = {
  tables: ReadonlyMap<string, CaptureKind>;
  costs: CostCalculationDto | null;
  /** The references of the types left out of the cost approach («Desvincular»), or none («Volver a sincronizar»). */
  setExcludedTypes: (refs: string[]) => Promise<void>;
  /** A table linked again: the next reading of the cost approach is written in it. */
  relink: (kind: CaptureKind) => void;
};

const ConstructionCaptureContext = createContext<ConstructionCaptureContextValue | null>(null);

export const ConstructionCaptureProvider = ConstructionCaptureContext.Provider;

const WORDING: Record<CaptureKind, { add: string; describe: string; removeHint: string }> = {
  types: {
    add: "Tipo de construcción",
    describe: "Cada fila es un tipo de construcción: su tipo, clasificación, calidad, superficie, edad y vida útil entran solos al enfoque de costos, donde solo se capturan sus columnas de costo. Las cifras en gris las calcula el sistema.",
    removeHint: "Esta tabla es la captura de los tipos de construcción del enfoque de costos: oculta sus columnas o su subbloque en lugar de quitarla.",
  },
  installations: {
    add: "Instalación especial",
    describe: "Cada fila es una instalación especial, elemento accesorio u obra complementaria: su descripción, unidad, cantidad, edad, vida útil y mantenimiento entran al enfoque de costos, donde se capturan su valor y sus factores. Las cifras en gris las calcula el sistema.",
    removeHint: "Esta tabla es la captura de las instalaciones especiales del enfoque de costos: oculta sus columnas o su subbloque en lugar de quitarla.",
  },
};

const COST_LINK_LABELS = {
  linked: "Vinculado con Costos",
  unlinked: "Desvinculado de Costos",
  title: { linked: "Vinculado con el enfoque de costos", unlinked: "Desvinculado del enfoque de costos" },
  relink: "Volver a sincronizar",
};

/**
 * A table of the editor: a capture table of the construction section (video
 * 5.3, «una sola tabla») when the workspace says so, any table otherwise.
 */
export function EditorTable(props: {
  table: TableContent;
  readOnly: boolean;
  onAddColumn: (tableId: string) => void;
  onAddRow: (tableId: string) => void;
  onRemove: (tableId: string) => void;
  onUpdate: (tableId: string, updater: (table: TableContent) => TableContent) => void;
  footer?: ReactNode;
}) {
  const context = useContext(ConstructionCaptureContext);
  const kind = context?.tables.get(props.table.id);
  if (!context || !kind) return <TableEditorItem {...props} />;
  return <CaptureTableEditor {...props} kind={kind} context={context} />;
}

/**
 * The construction types (or the special installations) as one table of
 * the dictamen, edited as any table and saved as the capture of the cost
 * approach: «+ Tipo de construcción» adds a row with the next reference, the
 * right click inserts, duplicates, moves and deletes rows, and the figures
 * of the system (VUR, conservation, unit value) are locked in gray.
 */
function CaptureTableEditor({ table, kind, context, readOnly, onAddColumn, onRemove, onUpdate, footer }: {
  table: TableContent;
  kind: CaptureKind;
  context: ConstructionCaptureContextValue;
  readOnly: boolean;
  onAddColumn: (tableId: string) => void;
  onRemove: (tableId: string) => void;
  onUpdate: (tableId: string, updater: (table: TableContent) => TableContent) => void;
  footer?: ReactNode;
}) {
  const wording = WORDING[kind];
  const linked = !isCaptureUnlinked(table);
  const { costs } = context;
  const lock = useMemo<CalculatedTableLock | null>(() => {
    if (!linked) return null;
    const computed = new Set(computedColumnIds(table));
    const keys = new Set(captureColumnIds(table));
    const saved = new Set(readCapture(table, kind, null).flatMap(({ rowId, item }) => {
      const onServer = kind === "types"
        ? costs?.types.some((type) => type.ref.trim().toLowerCase() === item.ref.trim().toLowerCase())
        : costs?.installations.some((row) => row.ref.trim().toLowerCase() === item.ref.trim().toLowerCase());
      return onServer ? [rowId] : [];
    }));
    const refOf = (rowId: string) => readCapture(table, kind, null).find((entry) => entry.rowId === rowId)?.item.ref;
    return {
      row: () => true,
      column: (columnId) => computed.has(columnId),
      capture: {
        keyColumn: (columnId) => keys.has(columnId),
        rowRemoval: (rowId) => (saved.has(rowId) ? deleteConfirmation(kind === "types" ? "constructionType" : "installation", refOf(rowId)) : null),
        removeHint: wording.removeHint,
      },
    };
  }, [costs, kind, linked, table, wording.removeHint]);

  // Every edit leaves the table as the capture keeps it: references, VUR, conservation.
  const edit = (tableId: string, change: (current: TableContent) => TableContent) =>
    onUpdate(tableId, (current) => {
      const next = change(current);
      return isCaptureUnlinked(next) ? next : normalizeCapture(next, costs);
    });
  const addRow = () => {
    const { columnId } = withNewCaptureRow(table);
    onUpdate(table.id, (current) => withNewCaptureRow(current).table);
    // The new row's first datum takes the focus, to be written at once.
    window.setTimeout(() => {
      const column = columnId ? `[data-column-id="${window.CSS.escape(columnId)}"]` : "";
      const inputs = document.querySelectorAll<HTMLInputElement>(`input[data-table-cell="${window.CSS.escape(table.id)}"]${column}`);
      inputs[inputs.length - 1]?.focus();
    }, 80);
  };
  const setLinked = (next: boolean) => onUpdate(table.id, (current) => {
    const v2 = ensureTableV2(current);
    const schema = { ...(v2.schema ?? { zones: [] }), capture: { kind, ...(next ? {} : { unlinked: true }) } };
    return { ...v2, schema } as unknown as TableContent;
  });

  return (
    <CalculatedTableProvider value={lock}>
      <div className="min-w-0" data-capture-table={kind}>
        <TableEditorItem
          table={table}
          readOnly={readOnly}
          onAddColumn={onAddColumn}
          onAddRow={addRow}
          onRemove={onRemove}
          onUpdate={edit}
          actions={(
            <CaptureLinkBadge
              kind={kind}
              table={table}
              context={context}
              readOnly={readOnly}
              onUnlinkTable={() => setLinked(false)}
              onRelinkTable={() => {
                setLinked(true);
                context.relink(kind);
              }}
            />
          )}
          footer={(
            <>
              {footer}
              <div className="mt-2 flex flex-wrap items-center gap-3" data-capture-footer="">
                {!readOnly ? (
                  <Button type="button" size="sm" variant="outline" onClick={addRow} data-capture-add={kind}>
                    <Plus data-icon="inline-start" /> {wording.add}
                  </Button>
                ) : null}
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {linked ? wording.describe : "Desvinculada: lo que escribas aquí no entra al enfoque de costos ni el enfoque de costos escribe aquí."}
                </p>
              </div>
            </>
          )}
        />
      </div>
    </CalculatedTableProvider>
  );
}

/**
 * «Vinculado con Costos» on the table. For the types, «Desvincular» takes
 * every type out of the cost approach (they stay described here); for the
 * installations it leaves the table as the appraiser's own, and the cost
 * approach keeps what it has.
 */
function CaptureLinkBadge({ kind, table, context, readOnly, onUnlinkTable, onRelinkTable }: {
  kind: CaptureKind;
  table: TableContent;
  context: ConstructionCaptureContextValue;
  readOnly: boolean;
  onUnlinkTable: () => void;
  onRelinkTable: () => void;
}) {
  const { costs } = context;
  if (kind === "installations") {
    const linked = !isCaptureUnlinked(table);
    return (
      <CalculationLinkBadge
        linked={linked}
        labels={COST_LINK_LABELS}
        description={linked
          ? "Lo que escribas en esta tabla (descripción, unidad, cantidad, edad, vida útil y mantenimiento) entra al enfoque de costos, y lo que cambies allá se escribe aquí. Al desvincularla, la tabla queda como tuya y el enfoque de costos conserva lo que tiene."
          : "La tabla es tuya: lo que escribas aquí no entra al enfoque de costos. Al volver a sincronizar, cada instalación de costos llena su fila y las filas nuevas entran a costos."}
        readOnly={readOnly}
        onUnlink={() => {
          if (window.confirm("¿Desvincular la tabla del enfoque de costos? Lo que escribas en ella ya no entrará a costos; costos conserva las instalaciones que tiene.")) onUnlinkTable();
        }}
        onRelink={onRelinkTable}
      />
    );
  }
  if (!costs) return null;
  const columns = costColumnsOf(costs.columns);
  const types = readCapture(table, "types", null).map(({ item }) => item);
  const linked = constructionTypesLinkedToCosts(types, columns);
  const named = types.map((type) => type.ref.trim()).filter(Boolean);
  return (
    <CalculationLinkBadge
      linked={linked}
      labels={COST_LINK_LABELS}
      description={linked
        ? "Cada tipo entra solo al enfoque de costos con su referencia, descripción, clasificación, calidad, superficie, edad y vida útil; ahí solo se capturan sus columnas de costo. Al cambiar un tipo aquí, el cálculo se rehace."
        : "Los tipos no entran solos al enfoque de costos. Los que ya tienen renglón ahí lo conservan y siguen leyendo sus datos de esta tabla; los demás vuelven con «+ Construcción» o al sincronizar."}
      notice={costs.configured ? undefined : "El enfoque de costos aún no se ha capturado: el vínculo se podrá soltar cuando exista."}
      readOnly={readOnly}
      disabled={!named.length}
      onUnlink={() => {
        if (window.confirm("¿Desvincular los tipos del enfoque de costos? Dejarán de entrar solos; los que ya tienen renglón ahí lo conservan y vuelven con «+ Construcción».")) void context.setExcludedTypes(named);
      }}
      onRelink={() => void context.setExcludedTypes([])}
    />
  );
}
