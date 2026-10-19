import { formatStakeCents } from './useGoals';

export const SUPPORT_EMAIL = 'support@mymaingoals.app';

/// A mailto: link for writing to support about one stake, filled in with what's needed to
/// find it in Stripe (the payment ID), so nobody has to ask which goal it was.
export function stakeSupportMailto(stake: { goalTitle: string | null; amountCents: number; paymentIntentId: string }): string {
  const goal = stake.goalTitle?.trim() || 'Staked goal';
  const subject = `Missed goal: ${goal}`;
  const body =
    `Goal: ${goal}\n` +
    `Stake: ${formatStakeCents(stake.amountCents)}\n` +
    `Payment ID: ${stake.paymentIntentId}\n\n` +
    `What happened:\n`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function generalSupportMailto(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('MyMainGoals support')}`;
}
