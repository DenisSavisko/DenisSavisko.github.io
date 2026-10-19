import { loadStripe } from '@stripe/stripe-js';

// Live mode: real holds and charges. Publishable keys are meant to be public. The backend's
// matching live restricted key lives only in Supabase's secrets.
export const STRIPE_PUBLISHABLE_KEY =
  'pk_live_51H03MfCDnmwAAukbDHUXNZAruqbQNRPiXiF76WGgofcS6unHnJAGygfroYK1WSUbILff7yxeN8j9mGhF3D2ZwlfP00Tgi0HDNc';

// loadStripe() should only be called once — this module-level singleton promise, shared by
// every <Elements> provider, matches Stripe's own documented pattern.
export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Mirrors create-hold's ALLOWED_STAKE_AMOUNT_CENTS (mymaingoals-backend repo,
// supabase/functions/create-hold/index.ts) exactly; there's no shared source between the two.
// No $1 tier: Stripe's 30¢ fee would take a third of it, and $1 holds look like card testing.
export const STAKE_OPTIONS = [
  { id: 'none', label: 'None', cents: 0 },
  { id: 'five', label: '$5', cents: 500 },
  { id: 'twenty', label: '$20', cents: 2000 },
  { id: 'fifty', label: '$50', cents: 5000 },
  { id: 'hundred', label: '$100', cents: 10000 },
] as const;
export type StakeOptionId = (typeof STAKE_OPTIONS)[number]['id'];

// Must match create-hold's TERMS_VERSION (mymaingoals-backend repo, supabase/functions/_shared/stakeRules.ts), which
// refuses a hold agreed to under any other version. Bump both when the Terms change.
export const TERMS_VERSION = '2026-10-19';
export const TERMS_URL = '/webapp/terms/';
export const PRIVACY_URL = '/web-privacy-policy.html';

// Mirrors CAPTURE_DELAY_MS in the mymaingoals-backend repo's supabase/functions/_shared/stakeRules.ts: a missed goal's hold
// is charged this long after its deadline. Only used to show when.
export const CHARGE_DELAY_MS = (23 * 60 + 30) * 60 * 1000;
