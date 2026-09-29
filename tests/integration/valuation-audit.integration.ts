import assert from "node:assert/strict";
import { after, test } from "node:test";
import { auditValuation } from "../../src/features/valuations/services/valuation-audit";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

function request(headers: Record<string, string>) {
  return new Request("http://localhost/api/avaluos/x", { method: "POST", headers });
}

async function entries(publicId: string) {
  return prisma.auditoria.findMany({
    where: { SEntidad: "Avaluo", SIdentificadorEntidad: publicId },
    include: { tipoEventoAuditoria: { select: { SClave: true } } },
    orderBy: { IdAuditoria: "asc" },
  });
}

test("each valuation action is recorded with its event type, who, which organization and from where", async () => {
  const fixture = await createValuationFixture();
  const expected = {
    CREATE: "CREACION",
    CONCLUDE: "FINALIZACION",
    REOPEN: "REAPERTURA",
    DELETE: "ELIMINACION_LOGICA",
    EXPORT: "EXPORTACION",
  } as const;

  for (const action of Object.keys(expected) as (keyof typeof expected)[]) {
    const recorded = await auditValuation({
      action,
      user: fixture.user,
      valuationPublicId: fixture.publicId,
      request: request({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1, 10.0.0.1", "user-agent": "Pruebas/1.0" }),
    });
    assert.ok(recorded, `${action} is recorded`);
  }

  const rows = await entries(fixture.publicId);
  assert.deepEqual(
    rows.map((row) => [row.SAccion, row.tipoEventoAuditoria.SClave]),
    Object.entries(expected).map(([action, type]) => [`VALUATION_${action}`, type]),
  );
  for (const row of rows) {
    assert.equal(row.IdOrganizacion, fixture.organizationId);
    assert.equal(row.IdUsuario, fixture.user.id);
    assert.equal(row.SResultado, "EXITOSO");
    assert.equal(row.SDireccionIP, "203.0.113.7", "x-real-ip wins over x-forwarded-for");
    assert.equal(row.SAgenteUsuario, "Pruebas/1.0");
  }
});

test("the first forwarded address is used without x-real-ip, and 'unknown' without either", async () => {
  const fixture = await createValuationFixture();
  await auditValuation({
    action: "EXPORT",
    user: fixture.user,
    valuationPublicId: fixture.publicId,
    request: request({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" }),
    metadata: { format: "pdf", channel: "email", recipients: "cliente@example.test", bytes: 1234 },
  });
  await auditValuation({ action: "DELETE", user: fixture.user, valuationPublicId: fixture.publicId, request: request({}) });

  const [exported, deleted] = await entries(fixture.publicId);
  assert.equal(exported.SDireccionIP, "198.51.100.1");
  assert.deepEqual(exported.JMetadatos, { format: "pdf", channel: "email", recipients: "cliente@example.test", bytes: 1234 });
  assert.equal(deleted.SDireccionIP, "unknown");
  assert.equal(deleted.SAgenteUsuario, null);
  assert.equal(deleted.JMetadatos, null);
});

test("an audit that cannot be written never breaks the action it records", async (t) => {
  const fixture = await createValuationFixture();
  const errors = t.mock.method(console, "error", () => {});
  // A user id that does not exist violates the foreign key.
  const recorded = await auditValuation({
    action: "EXPORT",
    user: { ...fixture.user, id: -1 },
    valuationPublicId: fixture.publicId,
    request: request({}),
  });
  assert.equal(recorded, null);
  assert.equal(errors.mock.callCount(), 1);
  assert.deepEqual(await entries(fixture.publicId), []);
});
