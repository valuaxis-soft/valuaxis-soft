import assert from "node:assert/strict";
import test from "node:test";
import { FAQS, PRICE_PER_VALUATION_MXN } from "../src/features/marketing/content";
import { landingStructuredData } from "../src/features/marketing/structured-data";

const site = { name: "Valuaxis", description: "Software de avalúos", url: "https://valuaxissoft.com" };

type Node = Record<string, unknown> & { "@type": string };

function graph(json: string) {
  return (JSON.parse(json) as { "@graph": Node[] })["@graph"];
}

test("landing JSON-LD offers the price per valuation in MXN with IVA included", () => {
  const software = graph(landingStructuredData(site)).find((node) => node["@type"] === "SoftwareApplication");
  assert.ok(software);
  const offer = software.offers as Record<string, unknown>;
  assert.equal(offer.price, "170.00");
  assert.equal(offer.priceCurrency, "MXN");
  assert.equal((offer.priceSpecification as Record<string, unknown>).valueAddedTaxIncluded, true);
  // The price agreed with the client (docs/COBRO.md): $170.00 MXN, IVA included.
  assert.equal(PRICE_PER_VALUATION_MXN, 170);
});

test("landing JSON-LD carries the organization and every question of the page", () => {
  const nodes = graph(landingStructuredData(site));
  assert.deepEqual(
    nodes.map((node) => node["@type"]),
    ["Organization", "SoftwareApplication", "FAQPage"],
  );
  const faq = nodes.find((node) => node["@type"] === "FAQPage");
  assert.equal((faq?.mainEntity as unknown[]).length, FAQS.length);
});

test("landing JSON-LD can never close its script element", () => {
  const json = landingStructuredData({ ...site, description: "</script><script>alert(1)</script>" });
  assert.equal(json.includes("<"), false);
  assert.equal(JSON.parse(json)["@graph"][1].description, "</script><script>alert(1)</script>");
});
