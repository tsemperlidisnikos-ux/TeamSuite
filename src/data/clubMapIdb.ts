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
    out[id] = studentCount(right) > studentCount(left) ? right : left;
  }
  return out;
}
