/**
 * The editor's autosave interval (NP-01) is kept per person in
 * `devpware_usuarios.JPreferencias`, and the editor reads it on open.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getUserPreferences, updateUserPreferences } from "../../src/features/account/user-preferences.service";
import { defaultValuationColumns, moveValuationColumn, toggleValuationColumn } from "../../src/features/dashboard/valuation-columns";
import { createAuthUserFixture, prisma } from "./support";

after(async () => {
  await prisma.$disconnect();
});

test("a person without preferences autosaves 15 s after the last edit", async () => {
  const { userId } = await createAuthUserFixture({ label: "autoguardado-nuevo" });
  assert.equal((await getUserPreferences(userId)).autosaveSeconds, 15);
});

test("the chosen interval is kept for that person only, and «Desactivado» is kept as 0", async () => {
  const appraiser = await createAuthUserFixture({ label: "autoguardado-valuador" });
  const colleague = await createAuthUserFixture({ label: "autoguardado-colega" });

  assert.equal((await updateUserPreferences(appraiser.userId, { autosaveSeconds: 60 })).autosaveSeconds, 60);
  assert.equal((await getUserPreferences(appraiser.userId)).autosaveSeconds, 60);
  assert.equal((await getUserPreferences(colleague.userId)).autosaveSeconds, 15, "another person keeps the default");

  await updateUserPreferences(appraiser.userId, { autosaveSeconds: 0 });
  assert.equal((await getUserPreferences(appraiser.userId)).autosaveSeconds, 0);
  const row = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: appraiser.userId }, select: { JPreferencias: true } });
  assert.deepEqual(row.JPreferencias, { autosaveSeconds: 0 });
});

test("a value stored by hand that is not offered reads as the default", async () => {
  const { userId } = await createAuthUserFixture({ label: "autoguardado-raro" });
  await prisma.usuario.update({ where: { IdUsuario: userId }, data: { JPreferencias: { autosaveSeconds: 7 } } });
  assert.equal((await getUserPreferences(userId)).autosaveSeconds, 15);
});

test("the columns of the list of valuations are kept per person, next to the autosave, and a stale layout is repaired", async () => {
  const appraiser = await createAuthUserFixture({ label: "columnas-valuador" });
  const colleague = await createAuthUserFixture({ label: "columnas-colega" });
  await updateUserPreferences(appraiser.userId, { autosaveSeconds: 30 });

  const chosen = moveValuationColumn(toggleValuationColumn(defaultValuationColumns(), "version"), "valuador", "folio");
  await updateUserPreferences(appraiser.userId, { valuationListColumns: { columns: chosen.map((column) => (column.key === "cliente" ? { ...column, width: 9_999 } : column)) } });

  const stored = await getUserPreferences(appraiser.userId);
  assert.equal(stored.autosaveSeconds, 30, "changing the columns keeps the autosave");
  assert.deepEqual(stored.valuationListColumns.slice(0, 2).map((column) => column.key), ["valuador", "folio"], "the order the person chose");
  assert.equal(stored.valuationListColumns.find((column) => column.key === "version")?.visible, true);
  assert.equal(stored.valuationListColumns.find((column) => column.key === "cliente")?.width, 640, "an absurd width is clamped");
  assert.deepEqual((await getUserPreferences(colleague.userId)).valuationListColumns, defaultValuationColumns(), "another person keeps the default");

  // A layout stored by an older version (an unknown column, a missing one) still reads whole.
  await prisma.usuario.update({
    where: { IdUsuario: colleague.userId },
    data: { JPreferencias: { valuationListColumns: { columns: [{ key: "ya_no_existe", visible: true, width: 100 }, { key: "folio", visible: true, width: 100 }] } } },
  });
  const repaired = (await getUserPreferences(colleague.userId)).valuationListColumns;
  assert.equal(repaired[0].key, "folio");
  assert.equal(repaired.length, defaultValuationColumns().length);
});
