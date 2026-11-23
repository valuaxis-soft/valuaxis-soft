import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { priceBreakdown } from "../src/features/billing/billing-rules";
import {
  CFDI_DEFAULTS,
  buildGlobalInvoice,
  buildIndividualInvoice,
  cfdiAmounts,
  completeFiscalData,
  fiscalDataSchema,
  globalPeriod,
  legalNameForCfdi,
  maskRfc,
  rfcPersonType,
  type FiscalData,
} from "../src/features/billing/invoice-rules";
import { InvoicingProviderError } from "../src/features/billing/invoicing-gateway";
import { createFacturapiGateway } from "../src/infrastructure/invoicing/facturapi-gateway";
import { FAKE_FACTURAPI_KEY, startFakeFacturapiServer } from "./support/fake-facturapi-server";

// SAT test RFCs and made-up names: no real taxpayer.
const MORAL: FiscalData = { rfc: "EKU9003173C9", legalName: "Escuela Kemper Urgate S.A. de C.V.", taxSystem: "601", zip: "42501", cfdiUse: "G03", email: "facturas@example.test" };

test("the price agreed with the client, $146.55 + 16 % charged as $170.00, is invoiced as 146.55 + 23.45", () => {
  const charged = priceBreakdown("146.55", "16").unitAmount;
  assert.equal(charged, 17000);
  assert.deepEqual(cfdiAmounts(charged, 16), { subtotal: 146.55, tax: 23.45, total: 170, exact: true });
});

test("the packages of the catalog split into exactly what Stripe charged", () => {
  // 10 × $140, 30 × $125, 100 × $110 before tax, and a subscription of $499.
  for (const [amount, subtotal, tax, total] of [
    ["1400.00", 1400, 224, 1624],
    ["3750.00", 3750, 600, 4350],
    ["11000.00", 11000, 1760, 12760],
    ["499.00", 499, 79.84, 578.84],
  ] as const) {
    const charged = priceBreakdown(amount, "16").unitAmount;
    assert.deepEqual(cfdiAmounts(charged, 16), { subtotal, tax, total, exact: true }, amount);
  }
});

test("every price before tax from $0.01 to $3,000.00 gives back the exact charge, subtotal and IVA rounded as the SAT does", () => {
  for (let cents = 1; cents <= 300_000; cents += 1) {
    const charged = priceBreakdown((cents / 100).toFixed(2), "16").unitAmount;
    const amounts = cfdiAmounts(charged, 16);
    assert.ok(amounts.exact, `${cents}`);
    assert.equal(Math.round(amounts.subtotal * 100) + Math.round(amounts.tax * 100), charged);
    assert.equal(Math.round(amounts.subtotal * 16), Math.round(amounts.tax * 100), `IVA of ${amounts.subtotal}`);
  }
});

test("a charge that no subtotal reaches exactly is sent with tax included, and its parts still add up", () => {
  // Not every charge is x + round(0.16 x) for whole centavos x; find the first one that is not.
  const unreachable = Array.from({ length: 5000 }, (_, index) => index).find((cents) => !cfdiAmounts(cents, 16).exact);
  if (unreachable === undefined) return;
  const amounts = cfdiAmounts(unreachable, 16);
  assert.equal(Math.round(amounts.subtotal * 100) + Math.round(amounts.tax * 100), unreachable);
  assert.throws(() => cfdiAmounts(12.5, 16));
});

test("RFC: 12 characters for a company, 13 for a person, with a real date; generic RFCs are refused", () => {
  assert.equal(rfcPersonType("EKU9003173C9"), "MORAL");
  assert.equal(rfcPersonType("CACX7605101P8"), "FISICA");
  assert.equal(rfcPersonType("EKU9013173C9"), null, "month 13");
  assert.equal(rfcPersonType("EKU9002303C9"), null, "30 February");
  assert.equal(rfcPersonType("EKU900317"), null);
  assert.equal(rfcPersonType("eku9003173c9"), null, "normalized before");

  assert.equal(fiscalDataSchema.parse({ ...MORAL, rfc: " eku-900317 3c9 " }).rfc, "EKU9003173C9");
  const generic = fiscalDataSchema.safeParse({ ...MORAL, rfc: "XAXX010101000", taxSystem: "616", cfdiUse: "S01" });
  assert.equal(generic.success, false);
  assert.match(generic.error!.issues[0].message, /no uno genérico/);
});

test("the regime must fit the RFC and the use must fit the regime; the zip is five digits", () => {
  const issues = (data: Partial<FiscalData>) => fiscalDataSchema.safeParse({ ...MORAL, ...data }).error?.issues.map((issue) => issue.path[0]) ?? [];
  assert.deepEqual(issues({}), []);
  assert.deepEqual(issues({ taxSystem: "612" }), ["taxSystem"], "a company cannot be in the regime of people");
  assert.deepEqual(issues({ rfc: "CACX7605101P8", taxSystem: "612" }), []);
  assert.deepEqual(issues({ rfc: "CACX7605101P8", taxSystem: "605", cfdiUse: "G03" }), ["cfdiUse"], "a salaried person cannot deduct");
  assert.deepEqual(issues({ rfc: "CACX7605101P8", taxSystem: "605", cfdiUse: "S01" }), []);
  assert.deepEqual(issues({ taxSystem: "999" }), ["taxSystem"]);
  assert.deepEqual(issues({ zip: "4250" }), ["zip"]);
  assert.deepEqual(issues({ email: "no-es-correo" }), ["email"]);
  assert.deepEqual(issues({ legalName: "  " }), ["legalName"]);
});

test("complete fiscal data needs every column; the RFC is only ever shown masked", () => {
  const row = { SRFC: MORAL.rfc, SRazonSocial: MORAL.legalName, SRegimenFiscal: "601", SCodigoPostalFiscal: "42501", SUsoCfdi: "G03", SCorreoFacturacion: MORAL.email };
  assert.equal(completeFiscalData(row)?.rfc, "EKU9003173C9");
  assert.equal(completeFiscalData({ ...row, SCodigoPostalFiscal: null }), null);
  assert.equal(completeFiscalData({ ...row, SRFC: "ABC" }), null);
  assert.equal(maskRfc("EKU9003173C9"), "EKU…C9");
  assert.equal(maskRfc(null), "sin RFC");
});

test("the legal name goes in capitals and without the corporate regime, as CFDI 4.0 asks", () => {
  assert.equal(legalNameForCfdi("Escuela Kemper Urgate S.A. de C.V."), "ESCUELA KEMPER URGATE");
  assert.equal(legalNameForCfdi("Valuadores Ficticios, S. de R.L. de C.V."), "VALUADORES FICTICIOS");
  assert.equal(legalNameForCfdi("Peritos del Bajío SAPI de CV"), "PERITOS DEL BAJÍO");
  assert.equal(legalNameForCfdi("Consultores Asociados S.C."), "CONSULTORES ASOCIADOS");
  assert.equal(legalNameForCfdi("María Pérez Inventada"), "MARÍA PÉREZ INVENTADA");
});

test("the individual invoice: the organization's data, one service concept before tax, PUE and idempotent by payment", () => {
  const { payload, amounts } = buildIndividualInvoice({
    fiscal: MORAL,
    paymentReference: "cs_test_abc123",
    description: "Valuaxis Soft: 1 avalúo (1 avalúo)",
    totalCents: 17000,
    taxPercent: 16,
    productKey: CFDI_DEFAULTS.productKey,
    unitKey: CFDI_DEFAULTS.unitKey,
  });
  assert.deepEqual(amounts, { subtotal: 146.55, tax: 23.45, total: 170, exact: true });
  assert.deepEqual(payload, {
    type: "I",
    customer: { legal_name: "ESCUELA KEMPER URGATE", tax_id: "EKU9003173C9", tax_system: "601", email: "facturas@example.test", address: { zip: "42501" } },
    items: [
      {
        quantity: 1,
        product: {
          description: "Valuaxis Soft: 1 avalúo (1 avalúo)",
          product_key: "81112106",
          unit_key: "E48",
          unit_name: "Unidad de servicio",
          price: 146.55,
          tax_included: false,
          taxability: "02",
          taxes: [{ type: "IVA", rate: 0.16 }],
        },
      },
    ],
    use: "G03",
    payment_form: "31",
    payment_method: "PUE",
    currency: "MXN",
    external_id: "cs_test_abc123",
    idempotency_key: "valuaxis-cs_test_abc123",
  });
});

test("the global invoice: público en general, one 01010101 concept per payment and the month as its period", () => {
  const { payload, amounts } = buildGlobalInvoice({
    month: "2026-11",
    sequence: 1,
    payments: [
      { reference: "cs_test_one", totalCents: 17000, taxPercent: 16 },
      { reference: "cs_test_two", totalCents: 162400, taxPercent: 16 },
    ],
  });
  assert.deepEqual(payload.customer, { legal_name: "PUBLICO EN GENERAL", tax_id: "XAXX010101000", tax_system: "616" });
  assert.deepEqual(payload.global, { periodicity: "month", months: "11", year: 2026 });
  assert.equal(payload.use, "S01");
  assert.deepEqual(
    payload.items.map((item) => [item.product.product_key, item.product.unit_key, item.product.description, item.product.sku, item.product.price]),
    [
      ["01010101", "ACT", "Venta", "cs_test_one", 146.55],
      ["01010101", "ACT", "Venta", "cs_test_two", 1400],
    ],
  );
  assert.deepEqual([payload.external_id, payload.idempotency_key], ["valuaxis-global-2026-11-1", "valuaxis-global-2026-11-1"]);
  assert.deepEqual(amounts.map((amount) => amount.total), [170, 1624]);
  assert.throws(() => buildGlobalInvoice({ month: "2026-11", sequence: 1, payments: [] }));
});

test("a month runs from midnight to midnight in Mexico City", () => {
  const period = globalPeriod("2026-12");
  assert.equal(period.start.toISOString(), "2026-12-01T06:00:00.000Z");
  assert.equal(period.end.toISOString(), "2027-01-01T06:00:00.000Z");
  assert.throws(() => globalPeriod("2026-13"));
});

let fake: Awaited<ReturnType<typeof startFakeFacturapiServer>>;
before(async () => {
  fake = await startFakeFacturapiServer();
});
after(() => fake.close());

test("the Facturapi gateway sends the key as a bearer token and reads the invoice, its files and its errors", async () => {
  const gateway = createFacturapiGateway(FAKE_FACTURAPI_KEY, fake.baseUrl);
  const { payload } = buildIndividualInvoice({ fiscal: MORAL, paymentReference: "cs_test_gateway", description: "Prueba", totalCents: 17000, taxPercent: 16, productKey: "81112106", unitKey: "E48" });

  const issued = await gateway.createInvoice(payload);
  assert.equal(issued.status, "valid");
  assert.equal(issued.total, 170);
  assert.equal(fake.requests.at(-1)?.authorization, `Bearer ${FAKE_FACTURAPI_KEY}`);
  assert.equal((await gateway.retrieveInvoice(issued.id))?.uuid, issued.uuid);
  assert.equal(await gateway.retrieveInvoice("inv_missing"), null);
  assert.equal((await gateway.findInvoiceByExternalId("cs_test_gateway"))?.id, issued.id);
  assert.match((await gateway.downloadInvoice(issued.id, "xml")).toString(), /cfdi:Comprobante/);

  await assert.rejects(gateway.createInvoice(payload), (error: unknown) => error instanceof InvoicingProviderError && error.status === 409 && error.code === "idempotency_key_in_use");
  fake.refuseNext("El RFC del receptor no está en la lista de RFC inscritos.");
  await assert.rejects(gateway.createInvoice({ ...payload, idempotency_key: "otra" }), /lista de RFC inscritos/);
  await assert.rejects(createFacturapiGateway("sk_test_wrong", fake.baseUrl).createInvoice(payload), (error: unknown) => error instanceof InvoicingProviderError && error.status === 401);
});
