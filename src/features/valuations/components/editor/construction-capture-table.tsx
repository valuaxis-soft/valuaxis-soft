"use client";

import { Link2, Plus } from "lucide-react";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  captureColumnIds,
  captureLinkPlan,
  computedColumnIds,
  findCaptureTable,
  isCaptureUnlinked,
  normalizeCapture,
  readCapture,
  withNewCaptureRow,
  type CaptureKind,
} from "@/features/valuations/calculation/construction-capture";
import { constructionTypesLinkedToCosts, costColumnsOf, type CostCalculationDto } from "@/features/valuations/calculation/cost-types";
import type { AppSection, TableContent } from "@/features/valuations/model";
import { ensureTableV2 } from "@/features/valuations/services/table";
import { CalculationLinkBadge } from "../calculation/calculation-link-badge";
import { openValuationPlace } from "../calculation/calculation-precision-control";
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
  /** The other tables of the construction section: any of them can be linked with the cost approach. */
  linkable: ReadonlySet<string>;
  /** «Vincular con Costos»: the table becomes the capture of the installations. */
  linkInstallations: (tableId: string) => void;
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
 * Above a construction section that has no capture table (its subbloque was
 * deleted, or the valuation was created without it): the way to put it back,
 * since the types and the installations are captured there. Nothing is
 * captured here.
 */
export function ConstructionCaptureAccess({ section, readOnly, onAdd }: {
  section: AppSection;
  readOnly: boolean;
  onAdd: (kind: CaptureKind) => void;
}) {
  const missing = (["types", "installations"] as const).filter((kind) => !findCaptureTable(section, kind));
  if (!missing.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground" data-capture-access="">
      <p className="min-w-0 flex-1">
        {missing.length === 2
          ? "Esta sección no tiene la tabla de tipos de construcción ni la de instalaciones especiales: son la captura del enfoque de costos."
          : missing[0] === "types"
            ? "Esta sección no tiene la tabla de tipos de construcción: es la captura de los tipos del enfoque de costos."
            : "Esta sección no tiene la tabla de instalaciones especiales: es la captura de las instalaciones del enfoque de costos."}
      </p>
      {!readOnly ? missing.map((kind) => (
        <Button key={kind} type="button" size="sm" variant="outline" onClick={() => onAdd(kind)}>
          <Plus data-icon="inline-start" /> {kind === "types" ? "Tabla de tipos de construcción" : "Tabla de instalaciones especiales"}
        </Button>
      )) : null}
    </div>
  );
}

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
  if (context && !kind && context.linkable.has(props.table.id)) {
    return <TableEditorItem {...props} actions={<LinkWithCosts table={props.table} context={context} readOnly={props.readOnly} />} />;
  }
  if (!context || !kind) return <TableEditorItem {...props} />;
  return <CaptureTableEditor {...props} kind={kind} context={context} />;
}

/**
 * «Vincular con Costos» on any table of the construction section (video 7.4,
 * 21:53: his installations were in a «Tabla configurable» of his own and the
 * cost approach did not take them). It says which columns it takes by their
 * headers, which ones the system writes and what the cost approach had, and
 * asks before linking.
 */
function LinkWithCosts({ table, context, readOnly }: { table: TableContent; context: ConstructionCaptureContextValue; readOnly: boolean }) {
  const link = () => {
    const plan = captureLinkPlan(table, "installations");
    if (!plan.ok) {
      window.alert(plan.reason);
      return;
    }
    const before = context.costs?.installations.length ?? 0;
    const current = findCaptureTableId(context);
    const lines = [
      `¿Vincular «${table.title.trim() || "esta tabla"}» con Costos como la tabla de instalaciones especiales?`,
      "",
      `Columnas que se toman: ${plan.taken.map((item) => (item.header === item.field ? item.header : `${item.header} → ${item.field}`)).join(", ")}.`,
      ...(plan.addsRef ? ["Se agrega una columna # con el número de cada instalación."] : []),
      ...(plan.computed.length ? [`Columnas que escribe el sistema (se reemplaza lo que tengan): ${plan.computed.join(", ")}.`] : []),
      `Sus ${plan.rows === 1 ? "1 instalación" : `${plan.rows} instalaciones`} reemplazan ${before === 1 ? "la 1 que tiene" : `las ${before} que tiene`} Costos; las de igual número conservan su valor unitario y sus factores.`,
      ...(current ? ["La tabla de instalaciones que estaba vinculada queda como tabla tuya, desvinculada."] : []),
    ];
    if (window.confirm(lines.join("\n"))) context.linkInstallations(table.id);
  };
  return (
    <Button type="button" size="sm" variant="outline" disabled={readOnly || !context.costs} title="Usar esta tabla como la captura de las instalaciones especiales del enfoque de costos" onClick={link} data-capture-link={table.id}>
      <Link2 data-icon="inline-start" /> Vincular con Costos
    </Button>
  );
}

const findCaptureTableId = (context: ConstructionCaptureContextValue) => [...context.tables].find(([, kind]) => kind === "installations")?.[0] ?? null;

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
/** The tables of the cost approach a capture table of the construction section feeds, as the «Vinculado» popover lists them. */
const COST_PLACES: Record<CaptureKind, Array<{ label: string; detail: string; table: string }>> = {
  types: [
    { label: "Enfoque de costos › B) Construcciones", detail: "Tipos de construcción: referencia, descripción, superficie, edad y vida útil vienen de aquí; Cons. y los factores se capturan allá.", table: "tabla-construcciones-tipos" },
    { label: "Enfoque de costos › B) Valor de las construcciones", detail: "El valor unitario de reposición nuevo se captura allá y se muestra aquí.", table: "tabla-construcciones-valores" },
  ],
  installations: [
    { label: "Enfoque de costos › C) Instalaciones especiales", detail: "Descripción, unidad, cantidad, edad y vida útil vienen de aquí; la conservación (Cons.) y los factores se capturan allá y se muestran aquí.", table: "tabla-instalaciones-partidas" },
    { label: "Enfoque de costos › C) Valor de las instalaciones", detail: "El valor unitario de reposición nuevo se captura allá.", table: "tabla-instalaciones-valores" },
  ],
};

const costPlaces = (kind: CaptureKind) => COST_PLACES[kind].map((place) => ({
  label: place.label,
  detail: place.detail,
  onOpen: () => openValuationPlace({ sectionKey: "COSTOS", selector: `[data-generated-table$="-${place.table}" i]` }),
}));

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
        places={costPlaces(kind)}
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
      places={costPlaces(kind)}
      disabled={!named.length}
      onUnlink={() => {
        if (window.confirm("¿Desvincular los tipos del enfoque de costos? Dejarán de entrar solos; los que ya tienen renglón ahí lo conservan y vuelven con «+ Construcción».")) void context.setExcludedTypes(named);
      }}
      onRelink={() => void context.setExcludedTypes([])}
    />
  );
}
