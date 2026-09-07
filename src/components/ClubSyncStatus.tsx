import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLUB_SYNC_STATUS_EVENT,
  CLUB_WRITE_CONFLICT_EVENT,
  getClubWriteConflict,
  getLastSyncAt,
  isAutoSyncEnabled,
  isClubMirrorDirty,
} from '../data/clubSync';
import { subscribeAppData } from '../data/appDataEvents';

function formatSyncAgo(iso: string | null): string {
  if (!iso) return 'Δεν έχει γίνει ακόμα αποστολή στο cloud';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'Cloud: —';
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (mins < 1) return 'Cloud: μόλις τώρα';
  if (mins < 60) return `Cloud: πριν ${mins} λεπ.`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Cloud: πριν ${hours} ώρ.`;
  return `Cloud: ${new Date(ts).toLocaleString('el-GR')}`;
}

export function ClubSyncStatus({ clubId }: { clubId: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const unsub = subscribeAppData(bump);
    window.addEventListener(CLUB_SYNC_STATUS_EVENT, bump);
    window.addEventListener(CLUB_WRITE_CONFLICT_EVENT, bump);
    const id = window.setInterval(bump, 20_000);
    return () => {
      unsub();
      window.removeEventListener(CLUB_SYNC_STATUS_EVENT, bump);
      window.removeEventListener(CLUB_WRITE_CONFLICT_EVENT, bump);
      window.clearInterval(id);
    };
  }, [clubId]);

  void tick;
  const auto = isAutoSyncEnabled(clubId);
  const dirty = isClubMirrorDirty(clubId);
  const last = getLastSyncAt(clubId);
  const conflict = getClubWriteConflict(clubId);
  const line = conflict
    ? `Σύγκρουση: ${conflict.cloudByName}`
    : !auto
      ? 'Auto sync ανενεργό'
      : dirty
        ? 'Εκκρεμεί αποστολή στο cloud'
        : formatSyncAgo(last);

  return (
    <Link className="club-sync-status" to="/settings?tab=backup" title={line}>
      {line}
    </Link>
  );
}
