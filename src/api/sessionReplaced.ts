export const SESSION_REPLACED_CODE = 'session_replaced';

export function isSessionReplacedError(
  error?: string | null,
  code?: string | null,
): boolean {
  if (code === SESSION_REPLACED_CODE) return true;
  return /άλλη συσκευή/i.test(String(error ?? ''));
}

/** Ends the local session and sends the user to login when this device was replaced. */
export function logoutIfSessionReplaced(error?: string | null, code?: string | null): void {
  if (!isSessionReplacedError(error, code)) return;
  void import('../auth/auth').then(({ logout }) => {
    logout();
    if (typeof window === 'undefined') return;
    if (window.location.pathname.startsWith('/login')) return;
    window.location.replace('/login?replaced=1');
  });
}
