/** Cookie / tracking consent (CMP) — local store + optional server log. */

export type ConsentCategory = 'essential' | 'analytics' | 'marketing';

export type CookieConsentState = {
  version: 1;
  essential: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
  source: 'accept_all' | 'reject' | 'customize';
};

const STORAGE_KEY = 'ss360-cookie-consent-v1';
export const COOKIE_CONSENT_EVENT = 'ss360-cookie-consent-updated';

export function getCookieConsent(): CookieConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsentState;
    if (!parsed || parsed.version !== 1) return null;
    return {
      version: 1,
      essential: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      source: parsed.source || 'customize',
    };
  } catch {
    return null;
  }
}

export function hasCookieConsentDecision(): boolean {
  return getCookieConsent() != null;
}

export function saveCookieConsent(
  input: Omit<CookieConsentState, 'version' | 'essential' | 'updatedAt'> & {
    updatedAt?: string;
  },
): CookieConsentState {
  const next: CookieConsentState = {
    version: 1,
    essential: true,
    analytics: Boolean(input.analytics),
    marketing: Boolean(input.marketing),
    updatedAt: input.updatedAt || new Date().toISOString(),
    source: input.source,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: next }));
  return next;
}

export function acceptAllCookies(): CookieConsentState {
  return saveCookieConsent({ analytics: true, marketing: true, source: 'accept_all' });
}

export function rejectOptionalCookies(): CookieConsentState {
  return saveCookieConsent({ analytics: false, marketing: false, source: 'reject' });
}

export function isCategoryAllowed(category: ConsentCategory): boolean {
  if (category === 'essential') return true;
  const state = getCookieConsent();
  if (!state) return false;
  return category === 'analytics' ? state.analytics : state.marketing;
}
