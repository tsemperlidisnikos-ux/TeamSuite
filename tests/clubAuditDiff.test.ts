import { describe, expect, it } from 'vitest';
import type { AppData } from '../src/types';
import { buildAppDataAudit } from '../src/data/clubAuditDiff';

function data(values: Partial<AppData>): AppData {
  return values as AppData;
}

describe('buildAppDataAudit', () => {
  it('keeps before/after data for a safely reversible attendance change', () => {
    const before = data({ attendance: [] });
    const after = data({
      attendance: [{ id: 'att-1', studentId: 'student-1', present: true }] as AppData['attendance'],
    });
    const audit = buildAppDataAudit(before, after);

    expect(audit?.undoable).toBe(true);
    expect(audit?.changes).toEqual([
      {
        collection: 'attendance',
        entityId: 'att-1',
        before: null,
        after: after.attendance[0],
      },
    ]);
  });

  it('records financial changes but does not expose generic undo', () => {
    const before = data({ transactions: [] });
    const after = data({
      transactions: [{ id: 'tx-1', amount: 50 }] as AppData['transactions'],
    });
    const audit = buildAppDataAudit(before, after);

    expect(audit?.summary).toContain('συναλλαγές');
    expect(audit?.undoable).toBe(false);
    expect(audit?.changes).toEqual([]);
  });
});
