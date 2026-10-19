import { formatStakeCents } from './useGoals';

/// Debit cards: a hold this size can noticeably tie up someone's balance, so checkout says so.
const DEBIT_NOTE_MIN_CENTS = 5000;

export interface StakeSummary {
  hold: string;
  deadline: string;
  /// Sentence after the deadline, which differs for goals a friend has to confirm.
  doneBy: string;
  charge: string;
  refunds: string;
  debitNote: string | null;
  checkbox: string;
}

/// "Tue, Oct 21, 9:00 PM PDT": the deadline as the payer reads it, time zone included,
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

/// Everything the checkout shows above and on the Stake Terms checkbox. Rendered on screen and
/// also sent with the hold as the consent record (consentRecord), so the two can't differ.
export function stakeSummary(cents: number, deadline: Date, requiresVerification: boolean): StakeSummary {
  const amount = formatStakeCents(cents);
  return {
    hold: `${amount} hold on your card now.`,
    deadline: formatConsentDeadline(deadline),
    doneBy: requiresVerification
      ? 'Your friend has to confirm it and you have to mark it done by then.'
      : '',
    charge: `If it isn't, ${amount} is charged after the deadline.`,
    refunds: "Charges aren't refundable except as described in the Stake Terms.",
    debitNote:
      cents >= DEBIT_NOTE_MIN_CENTS
        ? "If you use a debit card, the hold reduces your available balance until it's released or charged."
        : null,
    checkbox:
      "I'm 18 or older, I'm in the United States, and I agree to the Stake Terms (including the charge described above). I've read the Privacy Policy.",
  };
}

export function consentRecord(summary: StakeSummary): string {
  return [
    summary.hold,
    `Mark this goal done by ${summary.deadline}.`,
    summary.doneBy,
    summary.charge,
    summary.refunds,
    summary.debitNote ?? '',
    `[x] ${summary.checkbox}`,
  ]
    .filter(Boolean)
    .join('\n');
}
