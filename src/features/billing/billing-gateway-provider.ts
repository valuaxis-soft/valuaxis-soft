import { env } from "@/lib/env";
import type { BillingGateway } from "./billing-gateway";

let cached: BillingGateway | undefined;

/** Null when STRIPE_SECRET_KEY is not set: billing is optional and the app runs without it. */
export async function getBillingGateway(): Promise<BillingGateway | null> {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  if (!cached) {
    const { createStripeGateway } = await import("@/infrastructure/payments/stripe-gateway");
    cached = createStripeGateway(secretKey);
  }
  return cached;
}
