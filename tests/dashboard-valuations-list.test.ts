import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QuickActions } from "../src/features/dashboard/components/quick-actions";
import { RecentValuations } from "../src/features/dashboard/components/recent-valuations";
import { StatsCards } from "../src/features/dashboard/components/stats-cards";
import { ValuationsFilters } from "../src/features/dashboard/components/valuations-filters";
import { ValuationsTable } from "../src/features/dashboard/components/valuations-table";

const now = new Date("2026-09-23T18:00:00Z");

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

test("valuations table links each row to the workspace and shows the status badge", () => {
  const html = renderToString(
    createElement(ValuationsTable, {
      items: [
        {
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
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        },
      ],
      params: { q: "", status: null, sort: "modificacion", direction: "desc", archived: false },
      canCreate: true,
      canDelete: true,
    }),
  );
  assert.match(html, /href="\/workspace\?id=3f1c2a8e-0000-4000-8000-000000000001"/);
  assert.match(html, /En revisión/);
  assert.match(html, /Sin cliente/);
  assert.match(html, /Abrir/);
  assert.match(html, /Más acciones del avalúo VAL-001/, "every row has its ··· menu");
  // The headers sort: the sorted column turns around, another starts in its natural direction.
  assert.match(html, /data-sort="modificacion" data-sort-active="true" href="\/avaluos\?orden=modificacion&amp;dir=asc"/);
  assert.match(html, /data-sort="folio" href="\/avaluos\?orden=folio&amp;dir=asc"/);
  assert.match(html, /aria-sort="descending"/);
});

test("filters keep the current search and status, and every status is a visible filter", () => {
  const html = renderToString(
    createElement(ValuationsFilters, {
      q: "zapopan",
      status: "terminado",
      statuses: [
        { key: "nuevo", name: "Nuevo" },
        { key: "terminado", name: "Terminado" },
      ],
    }),
  );
  assert.match(html, /value="zapopan"/);
  assert.match(html, /type="hidden" name="estado" value="terminado"/, "searching keeps the status");
  assert.match(html, /aria-current="true"[^>]*data-status-filter="terminado" href="\/avaluos\?q=zapopan"/, "the active status is marked and clicking it again removes it");
  assert.match(html, /data-status-filter="nuevo" href="\/avaluos\?q=zapopan&amp;estado=nuevo"/, "another status keeps the search");
  assert.match(html, /data-archived-filter="true" href="\/avaluos\?q=zapopan&amp;estado=terminado&amp;archivados=1"/, "the archived ones are a filter");
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
      items: [
        {
          id: "3f1c2a8e-0000-4000-8000-000000000002",
          folio: "VAL-002",
          title: "Casa en Tlaquepaque",
          client: "Cliente inventado",
          location: "",
          valuationKind: "compraventa",
          propertyKind: "casa_habitacion",
          propertyKindName: "Casa habitación",
          appraisalKindName: "Comercial",
          status: "en_edicion",
          statusName: "En edicion",
          createdAt: now,
          updatedAt: new Date("2026-09-20T18:00:00Z"),
          archivedAt: null,
        },
      ],
      now,
    }),
  );
  assert.match(html, /<ul class="grid gap-2 md:hidden" aria-label="Avalúos">/);
  assert.match(html, /hace 3 días/);
  assert.match(html, /data-status="en_edicion"/);
});
