import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CLUB_SYNC_STATUS_EVENT,
  CLUB_WRITE_CONFLICT_EVENT,
  clearLastSyncError,
  flushClubMirrorPush,
  getClubSyncProgress,
  getClubWriteConflict,
  getLastSyncAt,
  getLastSyncError,
  isAutoSyncEnabled,
  isClubMirrorDirty,
  isMirrorConflictError,
  pruneStaleClubWriteConflict,
  recoverClubServerSync,
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

  // Καθαρισμός κολλημένου κόκκινου από παλιό Mirror conflict / stale write-conflict.
  useEffect(() => {
    pruneStaleClubWriteConflict(clubId);
    const conflict = getClubWriteConflict(clubId);
    const err = getLastSyncError(clubId);
    if (conflict) return;
    if (isMirrorConflictError(err)) {
      clearLastSyncError(clubId);
      void flushClubMirrorPush(clubId, { force: true }).finally(() => setTick((n) => n + 1));
      return;
    }
    if (err) {
      void flushClubMirrorPush(clubId, { force: true }).finally(() => setTick((n) => n + 1));
    }
  }, [clubId]);

  void tick;
  const auto = isAutoSyncEnabled(clubId);
  const dirty = isClubMirrorDirty(clubId);
  const last = getLastSyncAt(clubId);
  const conflict = getClubWriteConflict(clubId);
  const rawError = getLastSyncError(clubId);
  const syncError = conflict || isMirrorConflictError(rawError) ? null : rawError;
  const progress = getClubSyncProgress(clubId);
  const inFlight = progress.inFlight || retrying;

  useEffect(() => {
    if (!inFlight) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [inFlight, clubId]);

  const title = conflict
    ? `Σύγκρουση με ${conflict.cloudByName} — επίλυση κάτω από την κεφαλίδα`
    : inFlight
      ? 'Αποστολή στον server…'
      : syncError
        ? `${syncError} — κλικ για επανάληψη`
        : !auto
          ? 'Auto sync ανενεργό'
          : dirty
            ? 'Εκκρεμεί αποστολή στον server'
            : formatSyncAgo(last);

  // Κατά την αποστολή δείχνουμε busy (όχι κόκκινο από παλιό error).
  const stateClass = inFlight
    ? 'is-busy'
    : conflict || syncError
      ? 'is-warn'
      : dirty
        ? 'is-pending'
        : 'is-ok';

  return (
    <button
      type="button"
      className={`club-sync-status ${stateClass}`}
      title={title}
      aria-label={title}
      onClick={() => {
        if (conflict) {
          document.querySelector('[data-write-conflict]')?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
          return;
        }
        if (inFlight || syncError || dirty) {
          setRetrying(true);
          void recoverClubServerSync(clubId).finally(() => {
            setRetrying(false);
            setTick((n) => n + 1);
          });
          return;
        }
        navigate('/settings?tab=backup');
      }}
    >
      <span className="club-sync-server" aria-hidden>
        <span className="club-sync-dot" />
        <span className="club-sync-label">Server</span>
      </span>
    </button>
  );
}
