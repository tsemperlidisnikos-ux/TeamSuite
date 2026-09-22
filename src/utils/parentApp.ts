const PARENT_PATH = '/app/parent';

export function parentAppPath(): string {
  return PARENT_PATH;
}

export function parentAppUrl(origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  return `${origin}${PARENT_PATH}`;
}

export function isParentAppPath(pathname = typeof window !== 'undefined' ? window.location.pathname : ''): boolean {
  return pathname === PARENT_PATH || pathname.startsWith(`${PARENT_PATH}/`);
}

export function isParentAppMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (isParentAppPath()) return true;
  return new URLSearchParams(window.location.search).get('app') === 'parent';
}

export function applyParentChrome(): void {
  if (typeof document === 'undefined') return;
  const link = document.querySelector('link[rel="manifest"]');
  if (link) link.setAttribute('href', '/manifest-parent.webmanifest');
  document.title = 'TeamSuite Γονείς';
  document
    .querySelector('meta[name="apple-mobile-web-app-title"]')
    ?.setAttribute('content', 'TeamSuite Γονείς');
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
