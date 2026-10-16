import { defineConfig } from 'vitest/config';

// Unit tests for the app's own logic (goal status/sorting, record mapping, the undo window,
// which goals background sync retries). CloudKit, Supabase, and Stripe are never called.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
