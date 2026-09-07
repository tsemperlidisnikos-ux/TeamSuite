import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertClubTenantAccess,
  isDurableStoreEnabled,
  loadAccountBundle,
  loadClubNotifyConfig,
  loadMirror,
  loadPublicClubBySlug,
  saveClubNotifyConfig,
  savePublicClubConfig,
  type ClubNotifyConfig,
  type PublicClubConfig,
} from './lib/serverStore.js';

/**
 * GET  /api/public-club?slug=...  — public join form bootstrap (no secrets)
 * POST /api/public-club            — publish public + notify config from club admin browser
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const slug = String(req.query.slug ?? '').trim().toLowerCase();
    if (!slug) {
      return res.status(400).json({ ok: false, error: 'slug required' });
    }
    const club = await loadPublicClubBySlug(slug);
    if (!club || !club.enabled) {
      return res.status(404).json({
        ok: false,
        durable: isDurableStoreEnabled(),
        error: 'Ο σύνδεσμος δεν βρέθηκε ή η δημόσια εγγραφή δεν είναι ενεργή.',
      });
    }
    const mirror = await loadMirror(club.clubId);
    const bundle = await loadAccountBundle();
    const accountClub = Array.isArray(bundle?.clubs)
      ? bundle.clubs.find(
          (item: unknown) =>
            item && typeof item === 'object' && String((item as { id?: string }).id) === club.clubId,
        )
      : undefined;
    const limit = Number((accountClub as { athleteLicenseLimit?: number } | undefined)?.athleteLicenseLimit);
    const students = Array.isArray((mirror?.payload as { students?: unknown[] } | undefined)?.students)
      ? ((mirror?.payload as { students: Array<{ status?: string }> }).students ?? [])
      : [];
    const remainingSeats =
      Number.isFinite(limit) && limit > 0
        ? Math.max(0, Math.floor(limit) - students.filter((s) => (s.status ?? 'active') === 'active').length)
        : null;
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      club: {
        ...club,
        remainingSeats,
        licenseFull: remainingSeats === 0,
      },
    });
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as {
      publicClub?: PublicClubConfig;
      notify?: ClubNotifyConfig;
    };

    if (!body.publicClub?.clubId || !body.publicClub?.slug) {
      return res.status(400).json({ ok: false, error: 'publicClub.clubId και slug απαιτούνται' });
    }
    if (!(await assertClubTenantAccess(req, res, body.publicClub.clubId))) return;

    const now = new Date().toISOString();
    const publicClub: PublicClubConfig = {
      ...body.publicClub,
      slug: body.publicClub.slug.trim().toLowerCase(),
      logoUrl: trimMedia(body.publicClub.logoUrl),
      heroImageUrl: trimMedia(body.publicClub.heroImageUrl),
      classes: Array.isArray(body.publicClub.classes) ? body.publicClub.classes : [],
      sports: Array.isArray(body.publicClub.sports) ? body.publicClub.sports : [],
      sizeChart:
        body.publicClub.sizeChart && typeof body.publicClub.sizeChart === 'object'
          ? body.publicClub.sizeChart
          : { kids: [], men: [], women: [] },
      termsHtml: String(body.publicClub.termsHtml ?? ''),
      updatedAt: now,
    };
    await savePublicClubConfig(publicClub);

    if (body.notify?.clubId) {
      const previous = await loadClubNotifyConfig(body.notify.clubId);
      const incomingPassword = String(body.notify.smtp?.password ?? '').trim();
      const keepPreviousPassword =
        !incomingPassword || incomingPassword === '********';
      const notify: ClubNotifyConfig = {
        ...body.notify,
        clubId: body.notify.clubId,
        smtp: body.notify.smtp
          ? {
              ...body.notify.smtp,
              password: keepPreviousPassword
                ? (previous?.smtp?.password ?? '')
                : incomingPassword,
            }
          : previous?.smtp,
        updatedAt: now,
      };
      await saveClubNotifyConfig(notify);
    }

    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      slug: publicClub.slug,
      updatedAt: now,
    });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

function trimMedia(value: string | null | undefined): string | null {
  if (!value) return null;
  // Drop leftover data URLs; keep Blob / https / /api/club-media paths.
  if (value.startsWith('data:') && value.length > 8_000) return null;
  if (value.length > 8_000) return null;
  return value;
}
