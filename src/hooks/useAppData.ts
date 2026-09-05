import { useCallback, useEffect, useState } from 'react';
import { subscribeAppData } from '../data/appDataEvents';
import { clearDataCache, getData } from '../data/repository';
import { APP_DATA_STORAGE_KEYS, ensureAmkaPlaintextReady } from '../data/store';
import type { AppData } from '../types';

function snapshotData(): AppData {
  const current = getData();
  return {
    ...current,
    photos: [...(current.photos ?? [])],
    progressReports: [...(current.progressReports ?? [])],
  };
}

export function useAppData() {
  const [data, setData] = useState<AppData>(() => snapshotData());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const sync = () => {
      setData(snapshotData());
      setVersion((v) => v + 1);
    };
    return subscribeAppData(sync);
  }, []);

  useEffect(() => {
    void ensureAmkaPlaintextReady().then(() => {
      setData(snapshotData());
      setVersion((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || !(APP_DATA_STORAGE_KEYS as readonly string[]).includes(event.key)) {
        return;
      }
      clearDataCache();
      setData(snapshotData());
      setVersion((v) => v + 1);
      void ensureAmkaPlaintextReady().then(() => {
        setData(snapshotData());
        setVersion((v) => v + 1);
      });
    };
    const onClubContext = () => {
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
    setData(snapshotData());
    setVersion((v) => v + 1);
  }, []);

  return { data, refresh, version };
}
