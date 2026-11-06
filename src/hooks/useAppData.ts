import { useCallback, useEffect, useState } from 'react';
import { subscribeAppData } from '../data/appDataEvents';
import { clearDataCache, getData } from '../data/repository';
import {
  APP_DATA_STORAGE_KEYS,
  clearStoreMemory,
  ensureAmkaPlaintextReady,
  ensureClubMapIdbReady,
} from '../data/store';
import type { AppData } from '../types';

function snapshotData(): AppData {
  const current = getData();
  return {
    ...current,
    photos: [...(current.photos ?? [])],
    progressReports: [...(current.progressReports ?? [])],
  };
}

function hasRoster(data: AppData): boolean {
  return (data.students?.length ?? 0) > 0 || (data.clubMembers?.length ?? 0) > 0;
}

export function useAppData() {
  const [data, setData] = useState<AppData>(() => snapshotData());
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(() => hasRoster(snapshotData()));

  useEffect(() => {
    const sync = () => {
      setData(snapshotData());
      setVersion((v) => v + 1);
    };
    return subscribeAppData(sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Large clubs live in IndexedDB (localStorage is truncated) — wait before
      // treating an empty seed as the real roster.
      await ensureClubMapIdbReady();
      await ensureAmkaPlaintextReady();
      if (cancelled) return;
      clearDataCache();
      const next = snapshotData();
      setData(next);
      setReady(true);
      setVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || !(APP_DATA_STORAGE_KEYS as readonly string[]).includes(event.key)) {
        return;
      }
      clearStoreMemory();
      clearDataCache();
      setData(snapshotData());
      setVersion((v) => v + 1);
      void ensureAmkaPlaintextReady().then(() => {
        clearDataCache();
        setData(snapshotData());
        setReady(true);
        setVersion((v) => v + 1);
      });
    };
    const onClubContext = () => {
      clearDataCache();
      setData(snapshotData());
      setVersion((v) => v + 1);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('academyhub-platform-updated', onClubContext);
    window.addEventListener('academyhub-clubs-updated', onClubContext);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('academyhub-platform-updated', onClubContext);
      window.removeEventListener('academyhub-clubs-updated', onClubContext);
    };
  }, []);

  const refresh = useCallback(() => {
    clearDataCache();
    setData(snapshotData());
    setVersion((v) => v + 1);
  }, []);

  return { data, ready, refresh, version };
}
