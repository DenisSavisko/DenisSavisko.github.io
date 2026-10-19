import { loadStripe } from '@stripe/stripe-js';

// Same publishable key as MyMainGoals/StripeConfig.swift — safe to embed client-side (that
// file's own comment says the same). Currently a pk_test_ key, so this is test mode.
export const STRIPE_PUBLISHABLE_KEY =
  'pk_test_51H03MfCDnmwAAukbyD28AYAEFsxWAXnx8np5Dc9Vn0ecrHIyzK14PPLqZPHv6Twf2BCuqpn3Tlied0xyTU7uH5pG00JAjc6mAc';

// loadStripe() should only be called once — this module-level singleton promise, shared by
// every <Elements> provider, matches Stripe's own documented pattern.
export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Mirrors AddTaskSheet's StakeOption (MyMainGoals/AddTaskSheet.swift) and create-hold's
// ALLOWED_STAKE_AMOUNT_CENTS (mymaingoals-backend repo, supabase/functions/create-hold/index.ts) exactly — these three
// have to stay in sync; there's no shared source between the Swift/TS/Deno codebases.
export const STAKE_OPTIONS = [
  { id: 'none', label: 'None', cents: 0 },
  { id: 'one', label: '$1', cents: 100 },
  { id: 'twenty', label: '$20', cents: 2000 },
  { id: 'fifty', label: '$50', cents: 5000 },
  { id: 'hundred', label: '$100', cents: 10000 },
] as const;
export type StakeOptionId = (typeof STAKE_OPTIONS)[number]['id'];

// Must match create-hold's TERMS_VERSION (mymaingoals-backend repo, supabase/functions/_shared/stakeRules.ts), which
// refuses a hold agreed to under any other version. Bump both when the Terms change.
export const TERMS_VERSION = '2026-10-18';
export const TERMS_URL = '/webapp/terms/';
export const PRIVACY_URL = '/web-privacy-policy.html';

// Mirrors CAPTURE_DELAY_MS in the mymaingoals-backend repo's supabase/functions/_shared/stakeRules.ts: a missed goal's hold
// is charged this long after its deadline. Only used to show when.
export const CHARGE_DELAY_MS = 24 * 60 * 60 * 1000;
