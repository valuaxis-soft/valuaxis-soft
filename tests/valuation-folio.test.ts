import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
  reserveNextValuationFolio,
} from "../src/features/valuations/services/valuation-folio.service";

const root = process.cwd();

function folioTransaction(...consecutives: number[]) {
  const organizationIds: number[] = [];
  let call = 0;
  const tx = {
    $queryRaw: async (query: Prisma.Sql) => {
      organizationIds.push(query.values[0] as number);
      return [{ IUltimoConsecutivo: consecutives[call++] }];
    },
  } as Pick<Prisma.TransactionClient, "$queryRaw">;

  return { organizationIds, tx };
}

test("genera VLO-0001 cuando el contador reservado es 1", async () => {
  const { tx } = folioTransaction(1);
  assert.equal(await reserveNextValuationFolio(tx, 10), "VLO-0001");
});

test("genera VLO-0016 cuando el contador previo era 15", async () => {
  const { tx } = folioTransaction(16);
  assert.equal(await reserveNextValuationFolio(tx, 10), "VLO-0016");
});

test("dos reservaciones consecutivas producen folios distintos", async () => {
  const { tx } = folioTransaction(1, 2);
  assert.equal(await reserveNextValuationFolio(tx, 10), "VLO-0001");
  assert.equal(await reserveNextValuationFolio(tx, 10), "VLO-0002");
});

test("reserva el folio para la organizacion activa recibida de la sesion", async () => {
  const { organizationIds, tx } = folioTransaction(1);
  await reserveNextValuationFolio(tx, 42);
  assert.deepEqual(organizationIds, [42]);

  const saveAction = readFileSync(join(root, "src/features/valuations/actions/save-valuation.ts"), "utf8");
  assert.match(saveAction, /reserveNextValuationFolio\(tx, user\.organizationId\)/);
  assert.match(saveAction, /IdOrganizacion: user\.organizationId/);
});

test("la reservacion es atomica, incrementa la serie sin usar MAX", () => {
  const service = readFileSync(
    join(root, "src/features/valuations/services/valuation-folio.service.ts"),
    "utf8",
  );

  assert.match(service, /ON CONFLICT \("IdOrganizacion", "SPrefijo"\)/);
  assert.match(service, /"IUltimoConsecutivo" \+ 1/);
  assert.match(service, /RETURNING "IUltimoConsecutivo"/);
  assert.doesNotMatch(service, /MAX\s*\(/i);
});

test("ignora el folio enviado al crear y no permite actualizar SFolio", () => {
  const creationRoute = readFileSync(join(root, "src/app/api/avaluos/route.ts"), "utf8");
  const updateRoute = readFileSync(join(root, "src/app/api/avaluos/[id]/route.ts"), "utf8");
  const saveAction = readFileSync(join(root, "src/features/valuations/actions/save-valuation.ts"), "utf8");
  const updateBranch = saveAction.slice(saveAction.indexOf("if (input.id)"), saveAction.indexOf("const permission"));

  assert.doesNotMatch(creationRoute, /folio[,:]/);
  assert.doesNotMatch(updateRoute, /folio:\s*body\.folio/);
  assert.doesNotMatch(updateBranch, /SFolio:\s*input\.folio/);
});

test("el formulario informa el folio automatico y no lo envia", () => {
  const form = readFileSync(
    join(root, "src/features/valuations/components/create-valuation-form.tsx"),
    "utf8",
  );

  assert.match(form, /El folio se generará automáticamente\./);
  assert.doesNotMatch(form, /folio: form\.folio/);
  assert.doesNotMatch(form, /label="Folio"/);
});

test("la ruta full de guardado no fue modificada para generar folios", () => {
  const fullRoute = readFileSync(join(root, "src/app/api/avaluos/[id]/full/route.ts"), "utf8");
  assert.doesNotMatch(fullRoute, /reserveNextValuationFolio|SerieFolioOrganizacion/);
});
