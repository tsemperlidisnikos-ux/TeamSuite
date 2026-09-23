export type PortalAppKind = 'parent' | 'coach';

const APPS: Record<
  PortalAppKind,
  { path: string; title: string; manifest: string; query: string }
> = {
  parent: {
    path: '/app/parent',
    title: 'TeamSuite Γονείς',
    manifest: '/manifest-parent.webmanifest',
    query: 'parent',
  },
  coach: {
    path: '/app/coach',
    title: 'TeamSuite Προπονητές',
    manifest: '/manifest-coach.webmanifest',
    query: 'coach',
  },
};

export function portalAppPath(kind: PortalAppKind): string {
  return APPS[kind].path;
}

export function portalAppUrl(
  kind: PortalAppKind,
  origin = typeof window !== 'undefined' ? window.location.origin : '',
): string {
  return `${origin}${APPS[kind].path}`;
}

export function isPortalAppPath(
  kind: PortalAppKind,
  pathname = typeof window !== 'undefined' ? window.location.pathname : '',
): boolean {
  const path = APPS[kind].path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function detectPortalAppKind(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '',
  search = typeof window !== 'undefined' ? window.location.search : '',
): PortalAppKind | null {
  if (isPortalAppPath('parent', pathname)) return 'parent';
  if (isPortalAppPath('coach', pathname)) return 'coach';
  const app = new URLSearchParams(search).get('app');
  if (app === 'parent' || app === 'coach') return app;
  return null;
}

export function applyPortalChrome(kind: PortalAppKind): void {
  if (typeof document === 'undefined') return;
  const spec = APPS[kind];
  const link = document.querySelector('link[rel="manifest"]');
  if (link) link.setAttribute('href', spec.manifest);
  document.title = spec.title;
  document
    .querySelector('meta[name="apple-mobile-web-app-title"]')
    ?.setAttribute('content', spec.title);
}

export function parentAppPath(): string {
  return portalAppPath('parent');
}

export function parentAppUrl(origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  return portalAppUrl('parent', origin);
}

export function coachAppPath(): string {
  return portalAppPath('coach');
}

export function coachAppUrl(origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  return portalAppUrl('coach', origin);
}

export function isParentAppPath(pathname = typeof window !== 'undefined' ? window.location.pathname : ''): boolean {
  return isPortalAppPath('parent', pathname);
}

export function isParentAppMode(): boolean {
  return detectPortalAppKind() === 'parent';
}

export function isCoachAppMode(): boolean {
  return detectPortalAppKind() === 'coach';
}

export function applyParentChrome(): void {
  applyPortalChrome('parent');
}

export function applyCoachChrome(): void {
  applyPortalChrome('coach');
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function portalAppInviteText(input: {
  clubName: string;
  kind: PortalAppKind;
  url: string;
}): string {
  const who = input.kind === 'parent' ? 'γονέα' : 'προπονητή';
  const club = input.clubName.trim() || 'TeamSuite';
  return `${club}: εφαρμογή ${who} TeamSuite. Ανοίξτε ${input.url} Στο κινητό: προσθήκη στην αρχική οθόνη και ενεργοποίηση ειδοποιήσεων.`;
}
