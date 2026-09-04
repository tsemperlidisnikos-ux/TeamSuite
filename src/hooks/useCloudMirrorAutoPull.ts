import { useEffect } from 'react';
import { pullAccountBundleIfNewer, scheduleAccountBundlePush } from '../api/services/accountSyncService';
import { pullClubMirrorIfNewer } from '../data/clubSync';

const POLL_INTERVAL_MS = 3_000;
const INITIAL_DELAY_MS = 400;

/**
 * Live cloud sync while the app is open:
 * - club AppData (αθλητές, σωματεία, οικονομικές εγγραφές)
 * - account bundle (κατηγορίες εσόδων/εξόδων, users, clubs)
 * Polls every ~3s and on tab focus. Skips DEMO.
 */
export function useCloudMirrorAutoPull(clubId: string | null | undefined) {
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function runPull() {
      if (cancelled || document.visibilityState !== 'visible') return;
      await pullAccountBundleIfNewer();
      if (clubId) await pullClubMirrorIfNewer(clubId);
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void runPull();
      } else if (clubId) {
        void import('../data/clubSync').then((m) => m.flushClubMirrorPush(clubId));
        void import('../api/services/accountSyncService').then((m) => m.flushAccountBundlePush());
      }
    }

    function onPageHide() {
      if (clubId) {
        void import('../data/clubSync').then((m) => m.flushClubMirrorPush(clubId));
      }
      void import('../api/services/accountSyncService').then((m) => m.flushAccountBundlePush());
    }

    function onPlatformUpdated() {
      scheduleAccountBundlePush();
    }

    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('academyhub-platform-updated', onPlatformUpdated);
    intervalId = setInterval(() => void runPull(), POLL_INTERVAL_MS);

    const initial = window.setTimeout(() => void runPull(), INITIAL_DELAY_MS);

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
