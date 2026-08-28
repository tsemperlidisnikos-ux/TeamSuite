import { getSession } from '../auth/auth';
import { getAppLogoUrlForClub, getAppName, getPreviewClubId } from '../platform/platformConfig';

const FAVICON_LINK_ID = 'app-favicon';
const DEFAULT_FAVICON = '/favicon.svg';

function ensureFaviconLink(): HTMLLinkElement {
  let link = document.getElementById(FAVICON_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.id = FAVICON_LINK_ID;
  return link;
}

/** Sets browser tab icon + title from platform branding (app logo / name). */
export function applyDocumentBranding(): void {
  const appName = getAppName();
  document.title = `${appName} — Διαχείριση`;

  const clubId = getPreviewClubId() ?? getSession()?.clubId ?? null;
  const logoUrl = getAppLogoUrlForClub(clubId);
  const link = ensureFaviconLink();
  const nextHref = logoUrl?.trim() || DEFAULT_FAVICON;

  // Force browsers to pick up data-URL / changed logos.
  if (link.getAttribute('href') !== nextHref) {
    if (logoUrl?.startsWith('data:image/')) {
      const mime = logoUrl.slice(5, logoUrl.indexOf(';'));
      link.type = mime || 'image/png';
    } else if (logoUrl) {
      link.removeAttribute('type');
    } else {
      link.type = 'image/svg+xml';
    }
    link.href = nextHref;
  }
}

export function startDocumentBranding(): void {
  applyDocumentBranding();
  window.addEventListener('academyhub-platform-updated', applyDocumentBranding);
}
