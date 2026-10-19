import { describe, expect, it } from 'vitest';
import { consentRecord, stakeSummary } from './stakeConsent';

const deadline = new Date('2026-10-22T04:00:00Z');

describe('stakeSummary', () => {
  it('states the deadline and the charge in one line', () => {
    const summary = stakeSummary(2000, deadline, false);
    expect(summary.terms).toBe(`Mark it done by ${summary.deadline}, or $20 is charged after the deadline.`);
    expect(summary.deadline).toMatch(/Oct 2[12]/);
    expect(summary.debitNote).toBeNull();
  });

  it('adds the friend rule and the debit note when they apply', () => {
    const summary = stakeSummary(5000, deadline, true);
    expect(summary.terms).toContain('have your friend confirm it by');
    expect(summary.debitNote).toContain('debit card');
  });
});

describe('consentRecord', () => {
  it('records every line shown, ending with the ticked checkbox', () => {
    const summary = stakeSummary(500, deadline, false);
    const record = consentRecord(summary).split('\n');
    expect(record[0]).toBe('$5 hold on your card now.');
    expect(record[1]).toBe(summary.terms);
    expect(record[record.length - 1]).toBe(`[x] ${summary.checkbox}`);
    expect(record).not.toContain('');
  });
});
