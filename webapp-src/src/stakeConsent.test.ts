import { describe, expect, it } from 'vitest';
import { consentRecord, stakeSummary } from './stakeConsent';

const deadline = new Date('2026-10-22T04:00:00Z');

describe('stakeSummary', () => {
  it('describes the hold, deadline and charge', () => {
    const summary = stakeSummary(2000, deadline, false);
    expect(summary.hold).toBe('$20 hold on your card now.');
    expect(summary.charge).toBe("If it isn't, $20 is charged after the deadline.");
    expect(summary.deadline).toMatch(/Oct 2[12]/);
    expect(summary.doneBy).toBe('');
    expect(summary.debitNote).toBeNull();
  });

  it('adds the friend rule and the debit note when they apply', () => {
    const summary = stakeSummary(5000, deadline, true);
    expect(summary.doneBy).toContain('friend has to confirm');
    expect(summary.debitNote).toContain('debit card');
  });
});

describe('consentRecord', () => {
  it('records every line shown, ending with the ticked checkbox', () => {
    const summary = stakeSummary(500, deadline, false);
    const record = consentRecord(summary).split('\n');
    expect(record[0]).toBe('$5 hold on your card now.');
    expect(record[1]).toBe(`Mark this goal done by ${summary.deadline}.`);
    expect(record[record.length - 1]).toBe(`[x] ${summary.checkbox}`);
    expect(record).not.toContain('');
  });
});
