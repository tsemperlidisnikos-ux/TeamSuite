import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CLUB_SYNC_STATUS_EVENT,
  CLUB_WRITE_CONFLICT_EVENT,
  flushClubMirrorPush,
  getClubSyncProgress,
  getClubWriteConflict,
  getLastSyncAt,
  getLastSyncError,
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
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [retrying, setRetrying] = useState(false);

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
  const syncError = getLastSyncError(clubId);
  const progress = getClubSyncProgress(clubId);
  const inFlight = progress.inFlight || retrying;
  const percent = inFlight ? progress.percent : syncError || conflict ? 0 : 100;

  useEffect(() => {
    if (!inFlight) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [inFlight, clubId]);

  const title = conflict
    ? `Σύγκρουση: ${conflict.cloudByName}`
    : inFlight
      ? `Συγχρονισμός ${percent}%`
      : syncError
        ? `Αποτυχία αποστολής — κλικ για επανάληψη`
        : !auto
          ? 'Auto sync ανενεργό'
          : dirty
            ? 'Εκκρεμεί αποστολή στο cloud'
            : formatSyncAgo(last);

  const warn = Boolean(conflict || syncError) && !inFlight;

  return (
    <button
      type="button"
      className={`club-sync-status${warn ? ' is-warn' : ''}${inFlight ? ' is-busy' : ''}`}
      title={title}
      aria-label={title}
      disabled={inFlight}
      onClick={() => {
        if (inFlight) return;
        if (syncError || dirty) {
          setRetrying(true);
          void flushClubMirrorPush(clubId, { force: true }).finally(() => setRetrying(false));
          return;
        }
        navigate('/settings?tab=backup');
      }}
    >
      <span className="club-sync-meter" style={{ ['--p' as string]: percent }}>
        <span className="club-sync-pct">{percent}%</span>
      </span>
    </button>
  );
}
