import { describe, expect, it } from 'vitest';
import { generalSupportMailto, SUPPORT_EMAIL } from './support';

describe('generalSupportMailto', () => {
  it('writes to support with a subject', () => {
    const url = new URL(generalSupportMailto());
    expect(url.pathname).toBe(SUPPORT_EMAIL);
    expect(url.searchParams.get('subject')).toBe('MyMainGoals support');
  });
});
