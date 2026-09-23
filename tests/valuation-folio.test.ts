import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
  reserveNextValuationFolio,
} from "../src/features/valuations/services/valuation-folio.service";

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
