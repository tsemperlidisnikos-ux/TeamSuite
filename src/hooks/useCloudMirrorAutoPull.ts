import { useEffect } from 'react';
import { pullClubMirrorIfNewer } from '../data/clubSync';

const POLL_INTERVAL_MS = 30_000;
const INITIAL_DELAY_MS = 8_000;

/**
 * Background pull of cloud mirror while the app is open:
 * - on tab focus (visibility visible)
 * - every ~90s while visible
 * Skips demo sessions and when auto-sync is off (handled in clubSync).
 */
export function useCloudMirrorAutoPull(clubId: string | null | undefined) {
  useEffect(() => {
    if (!clubId) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function runPull() {
      if (cancelled || document.visibilityState !== 'visible') return;
      await pullClubMirrorIfNewer(clubId);
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void runPull();
      } else {
        void import('../data/clubSync').then((m) => m.flushClubMirrorPush(clubId));
      }
    }

    function onPageHide() {
      void import('../data/clubSync').then((m) => m.flushClubMirrorPush(clubId));
    }

    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    intervalId = setInterval(() => void runPull(), POLL_INTERVAL_MS);

    const initial = window.setTimeout(() => void runPull(), INITIAL_DELAY_MS);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      if (intervalId) clearInterval(intervalId);
      window.clearTimeout(initial);
    };
  }, [clubId]);
}
