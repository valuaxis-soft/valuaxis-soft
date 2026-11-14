import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QuickActions } from "../src/features/dashboard/components/quick-actions";
import { RecentValuations } from "../src/features/dashboard/components/recent-valuations";
import { StatsCards } from "../src/features/dashboard/components/stats-cards";
import { ValuationsFilters } from "../src/features/dashboard/components/valuations-filters";
import { ValuationsTable } from "../src/features/dashboard/components/valuations-table";
import { defaultValuationColumns, toggleValuationColumn } from "../src/features/dashboard/valuation-columns";
import { parseValuationListParams } from "../src/features/dashboard/valuation-list-params";
import type { ValuationPageItem } from "../src/features/valuations/repositories/valuation-list.repository";

const now = new Date("2026-09-23T18:00:00Z");
const statusKeys = ["nuevo", "en_edicion", "en_revision", "terminado", "reabierto", "cancelado"];
const allowed = { canCreate: true, canEdit: true, canPurge: true, canExport: true };

function item(overrides: Partial<ValuationPageItem> = {}): ValuationPageItem {
  return {
    id: "3f1c2a8e-0000-4000-8000-000000000001",
    folio: "VAL-001",
    title: "Casa en Zapopan",
    client: "",
    location: "",
    valuationKind: "compraventa",
    propertyKind: "casa_habitacion",
    propertyKindName: "Casa habitación",
    appraisalKindName: "Fiscal",
    status: "en_revision",
    statusName: "En revision",
    appraiserName: "Valuador Inventado",
    createdAt: now,
    updatedAt: now,
    concludedAt: null,
    version: 1,
    archivedAt: null,
    deletedAt: null,
    reviewApprovedAt: null,
    ...overrides,
  };
}

test("stats cards render the total plus every catalog status with Spanish labels", () => {
  const html = renderToString(
    createElement(StatsCards, {
      stats: {
        total: 9,
        byStatus: { nuevo: 1, en_edicion: 2, en_revision: 1, terminado: 3, reabierto: 1, cancelado: 1 },
      },
    }),
  );
  for (const label of ["Total de avalúos", "Nuevos", "En edición", "En revisión", "Terminados", "Reabiertos", "Cancelados"]) {
    assert.match(html, new RegExp(label));
  }
});

test("valuations table links each row to the workspace, sorts by every header and exports what is shown", () => {
  const html = renderToString(
    createElement(ValuationsTable, {
      items: [item()],
      params: parseValuationListParams({ q: "casa" }, statusKeys),
      permissions: allowed,
      initialLayout: defaultValuationColumns(),
    }),
  );
  assert.match(html, /href="\/workspace\?id=3f1c2a8e-0000-4000-8000-000000000001"/);
  assert.match(html, /En revisión/);
  assert.match(html, /Sin cliente/);
  assert.match(html, /Valuador Inventado/, "the appraiser has its own column");
  assert.match(html, /Abrir/);
  assert.match(html, /Más acciones del avalúo VAL-001/, "every row has its ··· menu");
  // The headers sort: the sorted column turns around, another starts in its natural direction.
  assert.match(html, /data-sort="modificacion" data-sort-active="true" data-href="\/avaluos\?q=casa&amp;orden=modificacion&amp;dir=asc"/);
  assert.match(html, /data-sort="folio" data-href="\/avaluos\?q=casa&amp;orden=folio&amp;dir=asc"/);
  assert.match(html, /data-sort="cliente" data-href="\/avaluos\?q=casa&amp;orden=cliente&amp;dir=asc"/, "the client sorts too");
  assert.match(html, /data-sort="valuador" data-href="\/avaluos\?q=casa&amp;orden=valuador&amp;dir=asc"/, "and the appraiser");
  assert.match(html, /aria-sort="descending"/);
  // «Exportar a Excel» carries the filters and the visible columns in their order.
  assert.match(html, /href="\/api\/exportar\/avaluos\?q=casa&amp;columnas=folio%2Ctitulo%2Ccliente%2Cubicacion%2Ctipo%2Cestado%2Cvaluador%2Cmodificacion"/);
});

test("the table shows the columns the person chose, in their order", () => {
  const layout = toggleValuationColumn(toggleValuationColumn(defaultValuationColumns(), "ubicacion"), "version");
  const html = renderToString(
    createElement(ValuationsTable, {
      items: [item({ version: 3 })],
      params: parseValuationListParams({}, statusKeys),
      permissions: allowed,
      initialLayout: layout,
    }),
  );
  assert.doesNotMatch(html, /data-column="ubicacion"/, "a hidden column does not show");
  assert.match(html, /data-column="version"/);
  assert.match(html, /V3/);
  assert.match(html, /columnas=folio%2Ctitulo%2Ccliente%2Ctipo%2Cestado%2Cvaluador%2Cmodificacion%2Cversion/);
});

test("an approved valuation in review says it is ready to conclude", () => {
  const html = renderToString(
    createElement(ValuationsTable, {
      items: [item({ reviewApprovedAt: now })],
      params: parseValuationListParams({}, statusKeys),
      permissions: allowed,
      initialLayout: defaultValuationColumns(),
    }),
  );
  assert.match(html, /Aprobado: listo para concluir/);
});

test("in the trash the rows do not open the editor and say when they were deleted", () => {
  const html = renderToString(
    createElement(ValuationsTable, {
      items: [item({ deletedAt: new Date("2026-09-18T18:00:00Z") })],
      params: parseValuationListParams({ papelera: "1" }, statusKeys),
      permissions: allowed,
      initialLayout: defaultValuationColumns(),
      now,
    }),
  );
  assert.doesNotMatch(html, /href="\/workspace\?id=/, "a deleted valuation cannot be edited");
  assert.match(html, /Eliminado/);
  assert.match(html, /hace 5 días/);
  assert.match(html, /papelera=1/, "the export reads the trash");
});

test("filters keep the current search and status, and every status, the archive and the trash are visible", () => {
  const html = renderToString(
    createElement(ValuationsFilters, {
      params: parseValuationListParams({ q: "zapopan", estado: "terminado", valuador: "7", desde: "2026-11-01" }, statusKeys),
      statuses: [
        { key: "nuevo", name: "Nuevo" },
        { key: "terminado", name: "Terminado" },
      ],
      propertyKinds: [{ key: "casa_habitacion", name: "Casa habitación" }],
      appraisalKinds: [{ key: "comercial", name: "Comercial" }],
      appraisers: [{ id: 7, name: "Valuadora Inventada" }],
    }),
  );
  assert.match(html, /value="zapopan"/);
  assert.match(html, /type="hidden" name="estado" value="terminado"/, "searching keeps the status");
  assert.match(html, /aria-current="true"[^>]*data-status-filter="terminado" href="\/avaluos\?q=zapopan&amp;valuador=7&amp;desde=2026-11-01"/, "the active status is marked and clicking it again removes it");
  assert.match(html, /data-status-filter="nuevo" href="\/avaluos\?q=zapopan&amp;estado=nuevo&amp;valuador=7&amp;desde=2026-11-01"/, "another status keeps the rest");
  assert.match(html, /data-archived-filter="true" href="\/avaluos\?q=zapopan&amp;estado=terminado&amp;archivados=1/, "the archived ones are a list of their own");
  assert.match(html, /data-trash-filter="true" href="\/avaluos\?q=zapopan&amp;estado=terminado&amp;papelera=1/, "so is the trash");
  assert.match(html, /name="valuador"/);
  assert.match(html, /value="7" selected="">Valuadora Inventada<\/option>/);
  assert.match(html, /name="desde" value="2026-11-01"/);
  assert.match(html, /<details open=""/, "the extra filters open when one is in use");
  assert.match(html, /data-page-search/, "the / shortcut finds the search");
  assert.match(html, /Limpiar/);
});

test("dashboard links point to /avaluos and hide what the role does not allow", () => {
  const actions = renderToString(createElement(QuickActions, { canCreateValuation: false }));
  assert.match(actions, /href="\/avaluos"/);
  assert.doesNotMatch(actions, /Nuevo avalúo/);
  assert.doesNotMatch(actions, /comparables|plantillas|href="#"/);

  const full = renderToString(createElement(QuickActions, { canCreateValuation: true, canViewValuations: true, canEditValuations: true }));
  assert.match(full, /href="\/workspace\?action=new"/);
  assert.match(full, /href="\/comparables"/);
  assert.match(full, /href="\/organizacion\/plantillas"/);

  const recent = renderToString(createElement(RecentValuations, { valuations: [] }));
  assert.match(recent, /href="\/avaluos"/);
  assert.match(recent, /Aún no hay avalúos/);
  assert.doesNotMatch(recent, /Crear mi primer avalúo/, "no create button without permission");
  assert.match(renderToString(createElement(RecentValuations, { valuations: [], canCreate: true })), /Crear mi primer avalúo/);
});

test("the list shows cards on a phone and a table from md up, with relative dates", () => {
  const html = renderToString(
    createElement(ValuationsTable, {
      items: [item({ id: "3f1c2a8e-0000-4000-8000-000000000002", folio: "VAL-002", status: "en_edicion", updatedAt: new Date("2026-09-20T18:00:00Z") })],
      params: parseValuationListParams({}, statusKeys),
      permissions: allowed,
      initialLayout: defaultValuationColumns(),
      now,
    }),
  );
  assert.match(html, /<ul class="grid gap-2 md:hidden" aria-label="Avalúos">/);
  assert.match(html, /hace 3 días/);
  assert.match(html, /data-status="en_edicion"/);
});
