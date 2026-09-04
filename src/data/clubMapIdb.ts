import type { AppData } from '../types';

const DB_NAME = 'teamsuite-club-map-v1';
const STORE = 'kv';
const KEY = 'by-club';

export type ClubDataMap = Record<string, AppData>;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function idbReadClubMap(): Promise<ClubDataMap | null> {
  try {
    const db = await openDb();
    const value = await new Promise<ClubDataMap | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const raw = req.result;
        resolve(raw && typeof raw === 'object' ? (raw as ClubDataMap) : null);
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export async function idbWriteClubMap(map: ClubDataMap): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(map, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export function studentCount(data: AppData | undefined): number {
  return data?.students?.length ?? 0;
}

function inactiveCount(data: AppData | undefined): number {
  return (data?.students ?? []).filter((s) => s.status === 'inactive').length;
}

export function pickRicherClubData(left: AppData, right: AppData): AppData {
  const leftN = studentCount(left);
  const rightN = studentCount(right);
  if (rightN >= leftN + 20) return right;
  if (leftN >= rightN + 20) return left;
  const leftAt = Number(left.localWrittenAt) || 0;
  const rightAt = Number(right.localWrittenAt) || 0;
  if (rightAt !== leftAt) return rightAt > leftAt ? right : left;
  const leftInactive = inactiveCount(left);
  const rightInactive = inactiveCount(right);
  if (rightInactive !== leftInactive) return rightInactive > leftInactive ? right : left;
  return left;
}

/** Keep the richer roster per club so a small localStorage copy cannot hide 1600+ αθλητές. */
export function mergeClubMapsPreferRicher(a: ClubDataMap, b: ClubDataMap): ClubDataMap {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: ClubDataMap = {};
  for (const id of ids) {
    const left = a[id];
    const right = b[id];
    if (!left) {
      out[id] = right;
      continue;
    }
    if (!right) {
      out[id] = left;
      continue;
    }
    out[id] = pickRicherClubData(left, right);
  }
  return out;
}
