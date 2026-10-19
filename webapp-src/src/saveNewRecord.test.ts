import { describe, expect, it, vi } from 'vitest';
import { saveNewRecordConfirmed } from './cloudkit';

const record = { recordType: 'CD_GoalTask', recordName: 'rec-1', fields: {} };
const saved = { recordName: 'rec-1' } as unknown as CKRecord;
const ok = (records: CKRecord[]) => ({ hasErrors: false, records }) as unknown as CKSaveResponse;
const failed = (reason: string) => ({ hasErrors: true, errors: [{ reason }], records: [] }) as unknown as CKSaveResponse;

describe('saveNewRecordConfirmed', () => {
  it('returns the record when the save just works', async () => {
    const db = { saveRecords: vi.fn().mockResolvedValue(ok([saved])), fetchRecords: vi.fn() };
    await expect(saveNewRecordConfirmed(db, record, 0)).resolves.toBe(saved);
    expect(db.fetchRecords).not.toHaveBeenCalled();
  });

  it('treats a lost reply as success when the record turns out to exist', async () => {
    const db = {
      saveRecords: vi.fn().mockRejectedValue(new Error('Network error')),
      fetchRecords: vi.fn().mockResolvedValue(ok([saved])),
    };
    await expect(saveNewRecordConfirmed(db, record, 0)).resolves.toBe(saved);
    expect(db.saveRecords).toHaveBeenCalledTimes(1);
  });

  it('retries once under the same name when the record really is missing', async () => {
    const db = {
      saveRecords: vi.fn().mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce(ok([saved])),
      fetchRecords: vi.fn().mockResolvedValue(failed('NOT_FOUND')),
    };
    await expect(saveNewRecordConfirmed(db, record, 0)).resolves.toBe(saved);
    expect(db.saveRecords.mock.calls[1][0][0].recordName).toBe('rec-1');
  });

  it('reports the failure when it never lands', async () => {
    const db = {
      saveRecords: vi.fn().mockRejectedValue(new Error('Network error')),
      fetchRecords: vi.fn().mockResolvedValue(failed('NOT_FOUND')),
    };
    await expect(saveNewRecordConfirmed(db, record, 0)).rejects.toThrow('Network error');
    expect(db.saveRecords).toHaveBeenCalledTimes(2);
  });
});
