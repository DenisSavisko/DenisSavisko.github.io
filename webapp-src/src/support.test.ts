import { describe, expect, it } from 'vitest';
import { generalSupportMailto, stakeSupportMailto } from './support';

function parse(mailto: string) {
  const url = new URL(mailto);
  return { to: url.pathname, subject: url.searchParams.get('subject'), body: url.searchParams.get('body') };
}

describe('stakeSupportMailto', () => {
  it('fills in the goal, amount and payment ID', () => {
    const mail = parse(stakeSupportMailto({ goalTitle: 'Run 5k & stretch', amountCents: 2000, paymentIntentId: 'pi_123' }));
    expect(mail.to).toBe('support@mymaingoals.app');
    expect(mail.subject).toBe('Release request: Run 5k & stretch');
    expect(mail.body).toContain('Stake: $20');
    expect(mail.body).toContain('Payment ID: pi_123');
  });

  it('still reads well without a title', () => {
    const mail = parse(stakeSupportMailto({ goalTitle: null, amountCents: 100, paymentIntentId: 'pi_1' }));
    expect(mail.subject).toBe('Release request: Staked goal');
  });
});

describe('generalSupportMailto', () => {
  it('writes to support with a subject', () => {
    const url = new URL(generalSupportMailto());
    expect(url.pathname).toBe('support@mymaingoals.app');
    expect(url.searchParams.get('subject')).toBe('MyMainGoals support');
  });
});
