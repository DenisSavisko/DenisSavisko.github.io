import { formatStakeCents } from './useGoals';

/// Debit cards: a hold this size can noticeably tie up someone's balance, so checkout says so.
const DEBIT_NOTE_MIN_CENTS = 5000;

export interface StakeSummary {
  amount: string;
  deadline: string;
  /// "Mark it done by …, or $5 is charged after the deadline.", with the friend rule when on.
  terms: string;
  refunds: string;
  debitNote: string | null;
  checkbox: string;
}

/// "Mon, Oct 19, 6:54 PM PDT": the deadline as the payer reads it, time zone included,
/// since the Stake Terms define a goal's deadline as the time shown here.
export function formatConsentDeadline(deadline: Date): string {
  return deadline.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/// Everything the confirm step shows. Rendered on screen and also sent with the hold as the
/// consent record (consentRecord), so the two can't differ.
export function stakeSummary(cents: number, deadline: Date, requiresVerification: boolean): StakeSummary {
  const amount = formatStakeCents(cents);
  const when = formatConsentDeadline(deadline);
  const doIt = requiresVerification ? 'Mark it done and have your friend confirm it' : 'Mark it done';
  return {
    amount,
    deadline: when,
    terms: `${doIt} by ${when}, or ${amount} is charged after the deadline.`,
    refunds: 'Not refundable except as described in the Stake Terms.',
    debitNote:
      cents >= DEBIT_NOTE_MIN_CENTS
        ? "On a debit card, the hold reduces your balance until it's released or charged."
        : null,
    checkbox: "I'm 18+, in the US, and agree to the Stake Terms (including this charge). I've read the Privacy Policy.",
  };
}

export function consentRecord(summary: StakeSummary): string {
  return [
    `${summary.amount} hold on your card now.`,
    summary.terms,
    summary.refunds,
    summary.debitNote ?? '',
    `[x] ${summary.checkbox}`,
  ]
    .filter(Boolean)
    .join('\n');
}
