import assert from "node:assert/strict";
import { after, test } from "node:test";
import { notifyResponsible } from "../../src/features/notifications/valuation-notices";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

test("the responsible appraiser is notified only when someone else acts", async () => {
  const fixture = await createValuationFixture();
  const valuation = await prisma.avaluo.update({
    where: { UIdentificadorPublico: fixture.publicId },
    data: { IdUsuarioResponsable: fixture.user.id },
  });
  assert.ok(valuation);

  // The responsible person concluded it themselves: nobody to tell.
  assert.equal(await notifyResponsible("concluido", fixture.publicId, fixture.user), false);
  // Someone else in the team concluded it.
  assert.equal(await notifyResponsible("concluido", fixture.publicId, { ...fixture.user, id: fixture.user.id + 100000, name: "Otro" }), true);
  // Another organization cannot trigger notices about it.
  assert.equal(await notifyResponsible("asignado", fixture.publicId, { ...fixture.user, id: -1, organizationId: -1 }), false);
});
