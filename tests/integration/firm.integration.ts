import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getLetterhead, getValuationDefaults } from "../../src/features/firm/firm.service";
import { reserveNextValuationFolio } from "../../src/features/valuations/services/valuation-folio.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

test("new valuations take the firm's folio prefix, appraiser and validity", async () => {
  const fixture = await createValuationFixture();
  const orgId = fixture.organizationId;

  const initial = await prisma.$transaction((tx) => getValuationDefaults(tx, orgId, new Date("2026-09-28T18:00:00Z")));
  assert.deepEqual(initial, {
    folioPrefix: "VLO",
    appraiserName: null,
    appraiserRegistration: null,
    valuationDate: "2026-09-28",
    validUntil: "2027-03-28",
  });

  await prisma.organizacion.update({
    where: { IdOrganizacion: orgId },
    data: {
      SPrefijoFolio: "VDA",
      IMesesVigencia: 12,
      SNombrePerito: "Ing. Álvaro Gutiérrez",
      SRegistroPerito: "CED-12345",
      SDireccion: "Av. Despacho 100",
      SRazonSocial: "Valuadores de Prueba S.A. de C.V.",
    },
  });
  const defaults = await prisma.$transaction((tx) => getValuationDefaults(tx, orgId, new Date("2026-09-28T18:00:00Z")));
  assert.equal(defaults.appraiserName, "Ing. Álvaro Gutiérrez");
  assert.equal(defaults.appraiserRegistration, "CED-12345");
  assert.equal(defaults.validUntil, "2027-09-28");

  // A new prefix starts its own sequence.
  const first = await prisma.$transaction((tx) => reserveNextValuationFolio(tx, orgId, defaults.folioPrefix));
  const second = await prisma.$transaction((tx) => reserveNextValuationFolio(tx, orgId, defaults.folioPrefix));
  assert.deepEqual([first, second], ["VDA-0001", "VDA-0002"]);

  const letterhead = await getLetterhead(orgId);
  assert.equal(letterhead.address, "Av. Despacho 100");
  assert.equal(letterhead.legalName, "Valuadores de Prueba S.A. de C.V.");
  assert.equal(letterhead.logoUrl, null);
});

test("the database rejects an invalid folio prefix or validity", async () => {
  const fixture = await createValuationFixture();
  await assert.rejects(prisma.organizacion.update({ where: { IdOrganizacion: fixture.organizationId }, data: { SPrefijoFolio: "vda" } }));
  await assert.rejects(prisma.organizacion.update({ where: { IdOrganizacion: fixture.organizationId }, data: { IMesesVigencia: 0 } }));
});
