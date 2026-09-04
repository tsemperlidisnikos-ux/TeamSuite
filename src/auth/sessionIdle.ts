import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const SESSION_IDLE_MS = 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = 'teamsuite-last-activity-at-v1';
const SESSION_KEY = 'teamsuite-session-v1';

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'pointerdown',
  'keydown',
  'touchstart',
  'scroll',
];

export function markSessionActivity(): void {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearSessionActivity(): void {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    /* ignore */
  }
}

function lastActivityAt(): number {
  try {
    const n = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* ignore */
  }
  return Date.now();
}

function hasLocalSession(): boolean {
  try {
    return Boolean(localStorage.getItem(SESSION_KEY));
  } catch {
    return false;
  }
}

export function isSessionIdleExpired(): boolean {
  if (!hasLocalSession()) return false;
  return Date.now() - lastActivityAt() >= SESSION_IDLE_MS;
}

let idleLogoutInFlight = false;

export async function logoutDueToIdle(): Promise<void> {
  if (idleLogoutInFlight) return;
  idleLogoutInFlight = true;
  try {
    const { persistLocalStateToCloudBeforeLogout } = await import('../data/clubSync');
    await persistLocalStateToCloudBeforeLogout();
  } catch {
    /* still log out */
  }
  const { logout } = await import('./auth');
  logout();
  idleLogoutInFlight = false;
}

/**
 * Logged-in users are signed out after 1 hour without pointer/keyboard/touch/scroll.
 * Auto cloud sync does not count as activity.
 */
export function useIdleSessionLogout() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasLocalSession()) return;

    if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
      markSessionActivity();
    }

    const expire = async () => {
      await logoutDueToIdle();
      navigate('/login', { replace: true, state: { idleLogout: true } });
    };

    const check = () => {
      if (!hasLocalSession()) return;
      if (isSessionIdleExpired()) void expire();
    };

    const onActivity = () => {
      if (!hasLocalSession()) return;
      if (isSessionIdleExpired()) {
        void expire();
        return;
      }
      markSessionActivity();
    };

    let moveTimer = 0;
    const onMove = () => {
      if (moveTimer) return;
      moveTimer = window.setTimeout(() => {
        moveTimer = 0;
        onActivity();
      }, 1000);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };

    check();
    const intervalId = window.setInterval(check, 30_000);

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(intervalId);
      if (moveTimer) window.clearTimeout(moveTimer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [navigate]);
}
