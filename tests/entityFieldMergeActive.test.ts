import { describe, expect, it } from 'vitest';
import { mergeStudentsPreferringUpdatedAt } from '../src/data/entityFieldMerge';

describe('mergeStudentsPreferringUpdatedAt active guard', () => {
  it('keeps cloud active when local inactive is tied or older', () => {
    const deleted = new Set<string>();
    const local = [{ id: 'a1', status: 'inactive' as const, updatedAt: 100 }];
    const cloud = [{ id: 'a1', status: 'active' as const, updatedAt: 100 }];
    const merged = mergeStudentsPreferringUpdatedAt(local, cloud, deleted, true);
    expect(merged[0]?.status).toBe('active');
  });

  it('keeps local active when cloud inactive is tied or older', () => {
    const deleted = new Set<string>();
    const local = [{ id: 'a1', status: 'active' as const, updatedAt: 100 }];
    const cloud = [{ id: 'a1', status: 'inactive' as const, updatedAt: 100 }];
    const merged = mergeStudentsPreferringUpdatedAt(local, cloud, deleted, false);
    expect(merged[0]?.status).toBe('active');
  });

  it('allows newer intentional demotion', () => {
    const deleted = new Set<string>();
    const local = [{ id: 'a1', status: 'active' as const, updatedAt: 100 }];
    const cloud = [{ id: 'a1', status: 'inactive' as const, updatedAt: 200 }];
    const merged = mergeStudentsPreferringUpdatedAt(local, cloud, deleted, true);
    expect(merged[0]?.status).toBe('inactive');
  });
});
