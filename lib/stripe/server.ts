import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }
  if (!stripe) {
    stripe = new Stripe(key, { typescript: true });
  }
  return stripe;
}

export function assertAppUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_APP_URL (e.g. https://yourdomain.com).");
  }
  return base;
}
