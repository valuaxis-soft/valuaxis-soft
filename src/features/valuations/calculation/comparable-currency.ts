/**
 * Offers in dollars (24 Nov 2026: «los comparables de aviones los tomamos de
 * Estados Unidos, con un tipo de cambio»). The appraiser writes the amount in
 * USD and the exchange rate with its date and source; the comparable's price
 * is the equivalent in pesos, which is what the calculation, the filters and
 * the unit values use. The card and the dictamen show the three: the dollars,
 * the rate and the pesos.
 *
 * There is no automatic download of the rate: Banxico's API asks for a key
 * the firm does not have yet. The default source text names the FIX the DOF
 * publishes; docs/COMPARABLES.md says where a download would plug in
 * (`defaultExchangeRateSource`, `exchangeRateSuggestion`). Pure TypeScript.
 */
import type { ComparableListingDetails, Currency } from "./comparable-card";

/** «Tipo de cambio FIX publicado en el DOF del 24/11/2026»: what the source says when the appraiser does not write another. */
export function defaultExchangeRateSource(day: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "");
  return `Tipo de cambio FIX publicado en el DOF del ${match ? `${match[3]}/${match[2]}/${match[1]}` : "dd/mm/aaaa"}`;
}

/** Rates are written with up to four decimals, as the DOF publishes them. */
export const roundRate = (rate: number) => Math.round(rate * 10_000) / 10_000;
const cents = (value: number) => Math.round(value * 100) / 100;

/** The pesos of an amount in dollars at a rate; null when either is missing or not positive. */
export function pesosOf(amount: number | null | undefined, rate: number | null | undefined): number | null {
  if (!amount || !rate || !(amount > 0) || !(rate > 0)) return null;
  return cents(amount * rate);
}

/**
 * The price in pesos of a comparable: its price when it is in pesos; the
 * dollars by the rate when it is in dollars. A price in dollars without a
 * rate (captured or imported before the rate existed) has no equivalent in
 * pesos yet: it does not enter the calculation until the rate is written.
 */
export function priceInPesos(comparable: { price: number | null; listingDetails?: ComparableListingDetails | null }): number | null {
  const listing = comparable.listingDetails;
  if (listing?.currency !== "USD") return comparable.price;
  if (!listing.exchangeRate || !(listing.exchangeRate > 0)) return null;
  return pesosOf(listing.priceInCurrency ?? comparable.price, listing.exchangeRate);
}

/** A comparable in dollars still waiting for its rate: the panel and the review warn it. */
export const missingExchangeRate = (comparable: { listingDetails?: ComparableListingDetails | null }) =>
  comparable.listingDetails?.currency === "USD" && !(comparable.listingDetails.exchangeRate && comparable.listingDetails.exchangeRate > 0);

/**
 * What is saved for an offer: in pesos, the price as written and no rate; in
 * dollars, the amount in `priceInCurrency`, the rate with its date and
 * source (the default one when none is written) and, as the price, the
 * pesos. `price` is the amount typed in the offer's currency.
 */
export function offerInPesos(input: {
  currency: Currency | null | undefined;
  price: number | null;
  exchangeRate?: number | null;
  exchangeRateDate?: string | null;
  exchangeRateSource?: string | null;
}): { price: number | null; listing: Pick<ComparableListingDetails, "currency" | "priceInCurrency" | "exchangeRate" | "exchangeRateDate" | "exchangeRateSource"> } {
  if (input.currency !== "USD") {
    return {
      price: input.price,
      listing: { currency: input.currency ?? null, priceInCurrency: null, exchangeRate: null, exchangeRateDate: null, exchangeRateSource: null },
    };
  }
  const rate = input.exchangeRate && input.exchangeRate > 0 ? roundRate(input.exchangeRate) : null;
  const day = input.exchangeRateDate || null;
  return {
    price: pesosOf(input.price, rate),
    listing: {
      currency: "USD",
      priceInCurrency: input.price,
      exchangeRate: rate,
      exchangeRateDate: day,
      exchangeRateSource: input.exchangeRateSource?.trim() || (rate ? defaultExchangeRateSource(day) : null),
    },
  };
}

const usd = (value: number) => `US$${value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mxn = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const rateText = (rate: number) => rate.toLocaleString("es-MX", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/**
 * «US$50,000.00 × 18.3456 = $917,280.00 (Tipo de cambio FIX publicado en el
 * DOF del 24/11/2026)»: an offer in dollars as the card and the dictamen
 * explain it. Null for an offer in pesos.
 */
export function exchangeNote(comparable: { price: number | null; listingDetails?: ComparableListingDetails | null }): string | null {
  const listing = comparable.listingDetails;
  if (listing?.currency !== "USD") return null;
  const amount = listing.priceInCurrency ?? comparable.price;
  if (!amount) return null;
  const pesos = priceInPesos(comparable);
  if (!listing.exchangeRate || pesos === null) return `${usd(amount)}, sin tipo de cambio: no entra al cálculo hasta capturarlo`;
  const source = listing.exchangeRateSource?.trim() || defaultExchangeRateSource(listing.exchangeRateDate);
  return `${usd(amount)} × ${rateText(listing.exchangeRate)} = ${mxn(pesos)} (${source})`;
}

/**
 * A comparable as it is saved: in dollars, its price becomes the pesos of
 * its amount at its rate (null without a rate) and the source takes the
 * default text; in pesos, it is left as it came. A client of before that
 * sends no amount in dollars sent the dollars as the price.
 */
export function withOfferInPesos<T extends { price: number | null; listingDetails?: ComparableListingDetails | null }>(comparable: T): T {
  const listing = comparable.listingDetails;
  if (listing?.currency !== "USD") return comparable;
  const amount = listing.priceInCurrency !== undefined ? listing.priceInCurrency : comparable.price;
  const offer = offerInPesos({
    currency: "USD", price: amount ?? null, exchangeRate: listing.exchangeRate, exchangeRateDate: listing.exchangeRateDate, exchangeRateSource: listing.exchangeRateSource,
  });
  return { ...comparable, price: offer.price, listingDetails: { ...listing, ...offer.listing } };
}
