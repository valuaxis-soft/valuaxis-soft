import { FAQS, PRICE_PER_VALUATION_MXN } from "./content";

type SiteInfo = { name: string; description: string; url: string };

/**
 * JSON-LD for the public page: the product with its price per valuation, the
 * organization behind it and the frequently asked questions. `<` is escaped so
 * the JSON can never close the script element.
 */
export function landingStructuredData({ name, description, url }: SiteInfo) {
  const home = `${url}/`;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${home}#organizacion`,
        name,
        url: home,
        logo: `${url}/icon.svg`,
        areaServed: "MX",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${home}#software`,
        name,
        url: home,
        description,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Software de avalúos inmobiliarios",
        operatingSystem: "Web",
        inLanguage: "es-MX",
        publisher: { "@id": `${home}#organizacion` },
        audience: {
          "@type": "BusinessAudience",
          audienceType: "Despachos de avalúos y peritos valuadores",
          geographicArea: { "@type": "Country", name: "México" },
        },
        offers: {
          "@type": "Offer",
          name: "Un avalúo",
          price: PRICE_PER_VALUATION_MXN.toFixed(2),
          priceCurrency: "MXN",
          availability: "https://schema.org/InStock",
          url: `${url}/registro`,
          description: "Precio por avalúo concluido, IVA incluido.",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: PRICE_PER_VALUATION_MXN.toFixed(2),
            priceCurrency: "MXN",
            valueAddedTaxIncluded: true,
            unitText: "avalúo",
          },
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${home}#preguntas`,
        mainEntity: FAQS.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
