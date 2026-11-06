import { useEffect } from 'react';
import { pullAccountBundleIfNewer, scheduleAccountBundlePush } from '../api/services/accountSyncService';
import { isLoginSyncGraceActive, pullClubMirrorIfNewer } from '../data/clubSync';

/** Αραιότερο pull = λιγότερα Vercel invocations (αλλαγές έρχονται και στο focus). */
const POLL_INTERVAL_MS = 180_000;
/** Αν το τοπικό μητρώο είναι άδειο (πριν το IDB), τράβα cloud αμέσως· αλλιώς 2″. */
const INITIAL_DELAY_MS = 2_000;
const INITIAL_DELAY_SPARSE_MS = 150;

/**
 * Live cloud sync while the app is open:
 * - club AppData (αθλητές, σωματεία, οικονομικές εγγραφές)
 * - account bundle (κατηγορίες εσόδων/εξόδων, users, clubs)
 * Polls every ~3min and immediately on tab focus. Local edits persist disk-first;
 * cloud push is debounced, with immediate flush on logout / tab hide.
 * Skips DEMO. Skips briefly after login so δεν διπλοτραβάει μαζί με syncClubOnLogin.
 */
export function useCloudMirrorAutoPull(clubId: string | null | undefined) {
  useEffect(() => {
    let cancelled = false;
    let pullInFlight = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function runPull() {
      if (cancelled || pullInFlight || document.visibilityState !== 'visible') return;
      if (isLoginSyncGraceActive()) return;
      pullInFlight = true;
      try {
        await pullAccountBundleIfNewer();
        if (clubId) await pullClubMirrorIfNewer(clubId);
      } finally {
        pullInFlight = false;
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void runPull();
      } else if (clubId) {
        void import('../api/services/clubOpsSyncService').then((m) =>
          m.flushClubOpsSlice(clubId, { keepalive: true }),
        );
        void import('../data/clubSync').then((m) =>
          m.flushClubMirrorPush(clubId, { keepalive: true }),
        );
        void import('../api/services/accountSyncService').then((m) =>
          m.flushAccountBundlePush({ keepalive: true }),
        );
      }
    }

    function onPageHide() {
      if (clubId) {
        void import('../api/services/clubOpsSyncService').then((m) =>
          m.flushClubOpsSlice(clubId, { keepalive: true }),
        );
        void import('../data/clubSync').then((m) =>
          m.flushClubMirrorPush(clubId, { keepalive: true }),
        );
      }
      void import('../api/services/accountSyncService').then((m) =>
        m.flushAccountBundlePush({ keepalive: true }),
      );
    }

    function onPlatformUpdated() {
      scheduleAccountBundlePush();
    }

    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('academyhub-platform-updated', onPlatformUpdated);
    intervalId = setInterval(() => void runPull(), POLL_INTERVAL_MS);

    let initial = window.setTimeout(() => void runPull(), INITIAL_DELAY_MS);
    void import('../data/store').then(async (store) => {
      await store.ensureClubMapIdbReady();
      if (cancelled || !clubId) return;
      const { getClubData } = await import('../data/repository');
      const local = getClubData(clubId);
      if ((local.students?.length ?? 0) > 0) return;
      window.clearTimeout(initial);
      initial = window.setTimeout(() => void runPull(), INITIAL_DELAY_SPARSE_MS);
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('academyhub-platform-updated', onPlatformUpdated);
      if (intervalId) clearInterval(intervalId);
      window.clearTimeout(initial);
    };
  }, [clubId]);
}
