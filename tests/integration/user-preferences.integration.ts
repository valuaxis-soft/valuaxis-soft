/**
 * The editor's autosave interval (NP-01) is kept per person in
 * `devpware_usuarios.JPreferencias`, and the editor reads it on open.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getUserPreferences, updateUserPreferences } from "../../src/features/account/user-preferences.service";
import { createAuthUserFixture, prisma } from "./support";

after(async () => {
  await prisma.$disconnect();
});

test("a person without preferences autosaves 15 s after the last edit", async () => {
  const { userId } = await createAuthUserFixture({ label: "autoguardado-nuevo" });
  assert.deepEqual(await getUserPreferences(userId), { autosaveSeconds: 15 });
});

test("the chosen interval is kept for that person only, and «Desactivado» is kept as 0", async () => {
  const appraiser = await createAuthUserFixture({ label: "autoguardado-valuador" });
  const colleague = await createAuthUserFixture({ label: "autoguardado-colega" });

  assert.deepEqual(await updateUserPreferences(appraiser.userId, { autosaveSeconds: 60 }), { autosaveSeconds: 60 });
  assert.deepEqual(await getUserPreferences(appraiser.userId), { autosaveSeconds: 60 });
  assert.deepEqual(await getUserPreferences(colleague.userId), { autosaveSeconds: 15 }, "another person keeps the default");

  await updateUserPreferences(appraiser.userId, { autosaveSeconds: 0 });
  assert.deepEqual(await getUserPreferences(appraiser.userId), { autosaveSeconds: 0 });
  const row = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: appraiser.userId }, select: { JPreferencias: true } });
  assert.deepEqual(row.JPreferencias, { autosaveSeconds: 0 });
});

test("a value stored by hand that is not offered reads as the default", async () => {
  const { userId } = await createAuthUserFixture({ label: "autoguardado-raro" });
  await prisma.usuario.update({ where: { IdUsuario: userId }, data: { JPreferencias: { autosaveSeconds: 7 } } });
  assert.deepEqual(await getUserPreferences(userId), { autosaveSeconds: 15 });
});
