/** Merge δύο εγγραφών: νεότερο `updatedAt` κερδίζει τις συγκρούσεις, το κενό δεν σβήνει τιμή. */

export function isEmptyMergeValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export function recordUpdatedAt(row: { updatedAt?: number } | undefined | null): number {
  if (!row) return 0;
  return Number(row.updatedAt) || 0;
}

export function mergeTwoRecords<T extends { updatedAt?: number }>(
  local: T,
  cloud: T,
  preferLocalIfTie: boolean,
): T {
  const localAt = recordUpdatedAt(local);
  const cloudAt = recordUpdatedAt(cloud);
  let newer: T;
  let older: T;
  if (localAt === cloudAt) {
    newer = preferLocalIfTie ? local : cloud;
    older = preferLocalIfTie ? cloud : local;
  } else if (localAt > cloudAt) {
    newer = local;
    older = cloud;
  } else {
    newer = cloud;
    older = local;
  }
  const out = { ...older, ...newer } as T;
  for (const key of Object.keys(older) as Array<keyof T>) {
    if (isEmptyMergeValue(out[key]) && !isEmptyMergeValue(older[key])) {
      out[key] = older[key];
    }
  }
  out.updatedAt = Math.max(localAt, cloudAt);
  return out;
}

export function mergeByIdPreferringUpdatedAt<T extends { id: string; updatedAt?: number }>(
  localRows: T[] | undefined,
  cloudRows: T[] | undefined,
  deleted: Set<string>,
  preferLocalIfTie: boolean,
): T[] {
  const localMap = new Map<string, T>();
  const cloudMap = new Map<string, T>();
  for (const row of localRows ?? []) {
    if (!deleted.has(row.id)) localMap.set(row.id, row);
  }
  for (const row of cloudRows ?? []) {
    if (!deleted.has(row.id)) cloudMap.set(row.id, row);
  }
  const ids = new Set([...localMap.keys(), ...cloudMap.keys()]);
  const out: T[] = [];
  for (const id of ids) {
    const local = localMap.get(id);
    const cloud = cloudMap.get(id);
    if (local && cloud) out.push(mergeTwoRecords(local, cloud, preferLocalIfTie));
    else out.push((local ?? cloud)!);
  }
  return out;
}
