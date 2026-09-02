import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';
import {
  appendClubWaitlist,
  appendLoginActivity,
  allowRateLimit,
  assertSyncAuthorized,
  getSyncAuthContext,
  consumePasswordResetToken,
  createPasswordResetToken,
  hashPassword,
  isPasswordHashed,
  isDurableStoreEnabled,
  listClubWaitlist,
  listLoginActivity,
  deleteLoginActivity,
  clearLoginActivity,
  loadAccountBundle,
  loadAccountBundleRaw,
  loadAccountUsers,
  saveAccountBundle,
  saveAccountUsers,
  accountBundleExists,
  durableStorageUnavailableMessage,
  signSession,
  deleteClubWaitlist,
  updateClubWaitlist,
  uploadClubMedia,
  verifyPassword,
  verifySessionToken,
  requestAddress,
  assertClubTenantAccess,
  type ClubWaitlistEntry,
  type LoginActivityEvent,
} from '../lib/serverStore.js';
import { isAllowedClubMediaPath } from '../lib/durableKv.js';
import { deriveClubFieldKeyMaterial, fieldCryptoSecret } from '../lib/fieldCrypto.js';

type BundleUser = {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: string;
  active?: boolean;
  clubId?: string | null;
  athleteId?: string | null;
  coachId?: string | null;
  permissions?: string[] | null;
};

type BundleClub = {
  id: string;
  name?: string;
  usageStartsOn?: string | null;
  usageEndsOn?: string | null;
  logoUrl?: string | null;
  smtp?: {
    enabled?: boolean;
    host?: string;
    port?: string;
    username?: string;
    password?: string;
    fromName?: string;
    passwordSet?: boolean;
  };
  viva?: unknown;
  publicRegistration?: {
    heroImageUrl?: string | null;
    [key: string]: unknown;
  };
};

function pickKeptMedia(incoming: unknown, existing: unknown): unknown {
  const next = typeof incoming === 'string' ? incoming.trim() : '';
  if (next) return incoming;
  const prev = typeof existing === 'string' ? existing.trim() : '';
  if (prev) return existing;
  return incoming === undefined ? existing : incoming;
}

function userPassword(user: unknown): string {
  if (!user || typeof user !== 'object') return '';
  const value = (user as BundleUser).password;
  return typeof value === 'string' ? value.trim() : '';
}

/** Keep existing hashes when a client (club GET strips passwords) pushes empty password fields. */
function mergeBundleUsers(
  existing: unknown,
  incoming: unknown,
  options: { replaceAll: boolean; clubId?: string | null },
): unknown {
  if (!Array.isArray(incoming)) return existing ?? incoming;
  const prevList = Array.isArray(existing) ? (existing as BundleUser[]) : [];
  const prevById = new Map(
    prevList
      .filter((user) => user && typeof user.id === 'string')
      .map((user) => [user.id, user]),
  );

  const applyIncoming = (list: unknown[]) =>
    list.map((raw) => {
      if (!raw || typeof raw !== 'object') return raw;
      const user = raw as BundleUser;
      const prev = user.id ? prevById.get(user.id) : undefined;
      return {
        ...(prev ?? {}),
        ...user,
        password: userPassword(user) || userPassword(prev),
      };
    });

  if (options.replaceAll) {
    return applyIncoming(incoming);
  }

  const clubId = options.clubId ?? null;
  const incomingClub = incoming.filter((raw) => {
    if (!raw || typeof raw !== 'object') return false;
    return ((raw as BundleUser).clubId ?? null) === clubId;
  });
  const incomingIds = new Set(
    incomingClub
      .filter((raw) => raw && typeof raw === 'object' && typeof (raw as BundleUser).id === 'string')
      .map((raw) => (raw as BundleUser).id),
  );
  const others = prevList.filter((user) => (user.clubId ?? null) !== clubId);
  const keptSameClub = prevList.filter(
    (user) => (user.clubId ?? null) === clubId && !incomingIds.has(user.id),
  );
  return [...others, ...keptSameClub, ...applyIncoming(incomingClub)];
}

function asBundleUsers(value: unknown): BundleUser[] {
  return Array.isArray(value) ? (value as BundleUser[]) : [];
}

function canManageAccountUser(
  auth: ReturnType<typeof getSyncAuthContext>,
  jwt: ReturnType<typeof bearerClaims>,
  targetClubId: string | null,
  targetRole: string,
): boolean {
  if (jwt?.role === 'platform_admin') return true;
  if (targetRole === 'platform_admin') return false;
  if (jwt?.role === 'admin' && jwt.clubId && jwt.clubId === targetClubId) return true;
  if (auth.viaSecret && !jwt) return true;
  return false;
}

async function handleAccountUser(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = getSyncAuthContext(req);
    const jwt = auth.claims ?? bearerClaims(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const incoming =
      body.user && typeof body.user === 'object'
        ? (body.user as Record<string, unknown>)
        : body;

    if (req.method === 'DELETE') {
      const userId = String(
        incoming.id ?? body.id ?? (typeof req.query.id === 'string' ? req.query.id : ''),
      ).trim();
      if (!userId) return res.status(400).json({ ok: false, error: 'id required' });
      const bundle = await loadAccountBundle();
      if (!bundle) {
        if (await accountBundleExists()) {
          return res.status(503).json({
            ok: false,
            error: 'Το cloud account δεν διαβάστηκε. Δοκιμάστε ξανά σε λίγο.',
          });
        }
        return res.status(404).json({
          ok: false,
          error: 'Δεν βρέθηκε cloud account. Ο Platform Admin πρέπει να κάνει Push από Backup.',
        });
      }
      const users = asBundleUsers(bundle.users);
      const existing = users.find((user) => user.id === userId);
      if (!existing) return res.status(404).json({ ok: false, error: 'Ο χρήστης δεν βρέθηκε' });
      if (!canManageAccountUser(auth, jwt, existing.clubId ?? null, existing.role)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
      if (jwt?.sub && jwt.sub === userId) {
        return res.status(400).json({ ok: false, error: 'Δεν μπορείτε να διαγράψετε τον ενεργό λογαριασμό' });
      }
      const saved = await saveAccountBundle({
        users: users.filter((user) => user.id !== userId),
        clubs: bundle.clubs,
        platformConfig: bundle.platformConfig,
      });
      return res.status(200).json({
        ok: true,
        durable: isDurableStoreEnabled(),
        updatedAt: saved.updatedAt,
      });
    }

    if (req.method !== 'POST' && req.method !== 'PATCH') {
      res.setHeader('Allow', 'POST, PATCH, DELETE');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const id = String(incoming.id ?? '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });

    const rawBundle = await loadAccountBundleRaw();
    const storedUsers = await loadAccountUsers();
    if (!rawBundle && !storedUsers) {
      if (await accountBundleExists()) {
        return res.status(503).json({
          ok: false,
          error: 'Το cloud account δεν διαβάστηκε. Δοκιμάστε ξανά σε λίγο.',
        });
      }
    }

    const users = asBundleUsers(storedUsers ?? rawBundle?.users);
    const existing = users.find((user) => user.id === id) ?? null;
    const clubIdRaw = incoming.clubId ?? existing?.clubId ?? null;
    const clubId =
      clubIdRaw == null || clubIdRaw === ''
        ? null
        : String(clubIdRaw).trim() || null;
    const role = String(incoming.role ?? existing?.role ?? 'staff').trim() || 'staff';

    if (!canManageAccountUser(auth, jwt, clubId, role)) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const email = String(incoming.email ?? existing?.email ?? '')
      .trim()
      .toLowerCase();
    if (!email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Μη έγκυρο email' });
    }
    if (users.some((user) => user.id !== id && user.email?.toLowerCase() === email)) {
      return res.status(400).json({ ok: false, error: 'Το email χρησιμοποιείται ήδη' });
    }

    let password = existing?.password ?? '';
    const incomingPassword = typeof incoming.password === 'string' ? incoming.password.trim() : '';
    if (incomingPassword) {
      if (incomingPassword.length > 400) {
        return res.status(400).json({ ok: false, error: 'Μη έγκυρος κωδικός' });
      }
      password = isPasswordHashed(incomingPassword)
        ? incomingPassword
        : await hashPassword(incomingPassword);
    }
    if (!existing && !password) {
      return res.status(400).json({ ok: false, error: 'Απαιτείται κωδικός για νέο χρήστη' });
    }

    const nextUser: BundleUser = {
      ...(existing ?? {}),
      id,
      email,
      password,
      fullName: String(incoming.fullName ?? existing?.fullName ?? '').trim(),
      role,
      active:
        incoming.active === undefined ? (existing?.active ?? true) : Boolean(incoming.active),
      clubId,
      athleteId:
        incoming.athleteId === undefined
          ? (existing?.athleteId ?? null)
          : incoming.athleteId == null || incoming.athleteId === ''
            ? null
            : String(incoming.athleteId),
      coachId:
        incoming.coachId === undefined
          ? (existing?.coachId ?? null)
          : incoming.coachId == null || incoming.coachId === ''
            ? null
            : String(incoming.coachId),
      permissions: Array.isArray(incoming.permissions)
        ? incoming.permissions.map((item) => String(item))
        : incoming.permissions === null
          ? null
          : (existing?.permissions ?? null),
    };

    const nextUsers = existing
      ? users.map((user) => (user.id === id ? nextUser : user))
      : [...users, nextUser];

    if (rawBundle) {
      const saved = await saveAccountBundle({
        users: nextUsers,
        clubs: rawBundle.clubs,
        platformConfig: rawBundle.platformConfig,
      });
      return res.status(200).json({
        ok: true,
        durable: isDurableStoreEnabled(),
        updatedAt: saved.updatedAt,
      });
    }

    await saveAccountUsers(nextUsers);
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Account user save failed';
    return res.status(500).json({ ok: false, error: message });
  }
}

/** Keep logos/SMTP when a full account push arrives without those fields filled. */
function isBlankOrMaskedSecret(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const v = value.trim();
  return !v || v === '********';
}

function mergeSmtpPreserveSecret(
  incoming: BundleClub['smtp'] | undefined,
  prev: BundleClub['smtp'] | undefined,
): BundleClub['smtp'] | undefined {
  if (!incoming && !prev) return undefined;
  if (!incoming) return prev;
  if (!prev) {
    if (incoming && isBlankOrMaskedSecret(incoming.password)) {
      return { ...incoming, password: '' };
    }
    return incoming;
  }
  return {
    ...prev,
    ...incoming,
    password: isBlankOrMaskedSecret(incoming.password)
      ? isBlankOrMaskedSecret(prev.password)
        ? ''
        : (prev.password ?? '')
      : String(incoming.password ?? ''),
  };
}

function mergeVivaPreserveSecret(
  incoming: BundleClub['viva'] | undefined,
  prev: BundleClub['viva'] | undefined,
): BundleClub['viva'] | undefined {
  if (!incoming && !prev) return undefined;
  if (!incoming) return prev;
  const incomingObj =
    incoming && typeof incoming === 'object'
      ? (incoming as Record<string, unknown>)
      : null;
  const prevObj =
    prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : null;
  if (!incomingObj) return prev;
  if (!prevObj) {
    if (isBlankOrMaskedSecret(incomingObj.clientSecret)) {
      return { ...incomingObj, clientSecret: '' };
    }
    return incoming;
  }
  return {
    ...prevObj,
    ...incomingObj,
    clientSecret: isBlankOrMaskedSecret(incomingObj.clientSecret)
      ? isBlankOrMaskedSecret(prevObj.clientSecret)
        ? ''
        : (prevObj.clientSecret ?? '')
      : incomingObj.clientSecret,
  };
}

function mergeBundleClubs(existing: unknown, incoming: unknown): unknown {
  if (!Array.isArray(incoming) || incoming.length === 0) return existing ?? incoming;
  const prevList = Array.isArray(existing) ? (existing as BundleClub[]) : [];
  const prevById = new Map(
    prevList
      .filter((club) => club && typeof club.id === 'string')
      .map((club) => [club.id, club]),
  );
  return incoming.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const club = raw as BundleClub;
    const prev = club.id ? prevById.get(club.id) : undefined;
    if (!prev) {
      return {
        ...club,
        smtp: mergeSmtpPreserveSecret(club.smtp, undefined),
        viva: mergeVivaPreserveSecret(club.viva, undefined),
      };
    }
    const incomingReg = club.publicRegistration;
    const prevReg = prev.publicRegistration;
    return {
      ...prev,
      ...club,
      logoUrl: pickKeptMedia(club.logoUrl, prev.logoUrl),
      smtp: mergeSmtpPreserveSecret(club.smtp, prev.smtp),
      viva: mergeVivaPreserveSecret(club.viva, prev.viva),
      publicRegistration:
        incomingReg || prevReg
          ? {
              ...(prevReg ?? {}),
              ...(incomingReg ?? {}),
              heroImageUrl: pickKeptMedia(incomingReg?.heroImageUrl, prevReg?.heroImageUrl),
            }
          : club.publicRegistration ?? prev.publicRegistration,
    };
  });
}

type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromName: string;
};

function parseLoginEvent(body: unknown): LoginActivityEvent | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const at = typeof raw.at === 'string' ? raw.at.trim() : '';
  const userId = typeof raw.userId === 'string' ? raw.userId.trim() : '';
  const email = typeof raw.email === 'string' ? raw.email.trim() : '';
  const fullName = typeof raw.fullName === 'string' ? raw.fullName.trim() : '';
  const role = typeof raw.role === 'string' ? raw.role.trim() : '';
  const source =
    raw.source === 'impersonate' ? 'impersonate' : raw.source === 'login' ? 'login' : null;
  if (!id || !at || !userId || !email || !fullName || !role || !source) return null;

  const clubId =
    raw.clubId == null || raw.clubId === ''
      ? null
      : typeof raw.clubId === 'string'
        ? raw.clubId
        : null;
  const clubName =
    raw.clubName == null || raw.clubName === ''
      ? null
      : typeof raw.clubName === 'string'
        ? raw.clubName
        : null;
  const userAgent =
    raw.userAgent == null || raw.userAgent === ''
      ? null
      : typeof raw.userAgent === 'string'
        ? raw.userAgent.slice(0, 400)
        : null;

  return {
    id,
    at,
    userId,
    email,
    fullName,
    role,
    clubId,
    clubName,
    source,
    userAgent,
  };
}

function kindOf(req: VercelRequest): string {
  return String(req.query.kind ?? req.query.view ?? '').trim();
}

const APPEARANCE_THEME_IDS = [
  'classic',
  'navy-amber',
  'ocean-slate',
  'midnight-ice',
  'indigo-steel',
  'pitch-heritage',
  'graphite-ember',
  'aegean-navy',
  'ivory-club',
] as const;

function sanitizeAppearanceThemeId(value: unknown): (typeof APPEARANCE_THEME_IDS)[number] {
  if (
    typeof value === 'string' &&
    APPEARANCE_THEME_IDS.includes(value as (typeof APPEARANCE_THEME_IDS)[number])
  ) {
    return value as (typeof APPEARANCE_THEME_IDS)[number];
  }
  return 'ocean-slate';
}

function publicBranding(platformConfig: unknown, clubId?: string | null) {
  const cfg =
    platformConfig && typeof platformConfig === 'object'
      ? (platformConfig as Record<string, unknown>)
      : {};
  const appName = typeof cfg.appName === 'string' ? cfg.appName.trim() : '';
  const globalLogo = typeof cfg.appLogoUrl === 'string' ? cfg.appLogoUrl.trim() : '';
  const logos =
    cfg.clubAppLogos && typeof cfg.clubAppLogos === 'object' && !Array.isArray(cfg.clubAppLogos)
      ? (cfg.clubAppLogos as Record<string, unknown>)
      : {};
  const perClubRaw = clubId ? logos[clubId] : undefined;
  const perClub = typeof perClubRaw === 'string' ? perClubRaw.trim() : '';
  return {
    appearanceTheme: sanitizeAppearanceThemeId(cfg.appearanceTheme),
    appName: appName || 'TeamSuite',
    appLogoUrl: perClub || globalLogo || null,
  };
}

function bearerClaims(req: VercelRequest) {
  const auth = String(req.headers['authorization'] ?? '').trim();
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token.includes('.')) return null;
  return verifySessionToken(token);
}

function parseDataImageUrl(
  logoUrl: string,
): { contentType: string; dataBase64: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(logoUrl.trim());
  if (!match) return null;
  let contentType = match[1].trim().toLowerCase();
  if (contentType === 'image/jpg') contentType = 'image/jpeg';
  return { contentType, dataBase64: logoUrl.trim() };
}

const CLOUD_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
];

function isClubMediaLogoUrl(value: string): boolean {
  try {
    const parsed = value.startsWith('/')
      ? new URL(value, 'https://teamsuite.invalid')
      : new URL(value);
    if (parsed.pathname !== '/api/club-media') return false;
    return isAllowedClubMediaPath(parsed.searchParams.get('p') ?? '');
  } catch {
    return false;
  }
}

function isAllowedStoredLogoUrl(value: string): boolean {
  if (value.startsWith('data:image/')) return true;
  if (value.startsWith('https://')) return true;
  return isClubMediaLogoUrl(value);
}

async function handleClubProfile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    res.setHeader('Allow', 'PATCH, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const body = (req.body ?? {}) as { clubId?: string; logoUrl?: string | null };
  const clubId = String(body.clubId ?? '').trim();
  let logoUrl = body.logoUrl == null ? null : String(body.logoUrl).trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'clubId required' });
  if (logoUrl && !isAllowedStoredLogoUrl(logoUrl)) {
    return res.status(400).json({ ok: false, error: 'logoUrl must be an HTTPS URL, /api/club-media path, or image data URL' });
  }
  if (logoUrl && logoUrl.length > 180_000) {
    return res.status(400).json({ ok: false, error: 'Το λογότυπο είναι υπερβολικά μεγάλο' });
  }
  const auth = getSyncAuthContext(req);
  if (!auth.viaSecret && auth.claims?.role !== 'platform_admin' && auth.claims?.clubId !== clubId) {
    return res.status(403).json({ ok: false, error: 'Forbidden: club mismatch' });
  }
  if (logoUrl?.startsWith('data:image/')) {
    const parsed = parseDataImageUrl(logoUrl);
    if (!parsed || !CLOUD_IMAGE_TYPES.includes(parsed.contentType)) {
      return res.status(400).json({ ok: false, error: 'Unsupported logo image type' });
    }
    try {
      const uploaded = await uploadClubMedia({
        clubId,
        fileName: parsed.contentType === 'image/svg+xml' ? 'club-logo.svg' : 'club-logo.jpg',
        contentType: parsed.contentType,
        dataBase64: parsed.dataBase64,
      });
      logoUrl = `${uploaded.url}${uploaded.url.includes('?') ? '&' : '?'}v=${Date.now()}`;
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Αποτυχία αποθήκευσης λογοτύπου στο cloud',
      });
    }
  }
  const bundle = await loadAccountBundle();
  if (!bundle || !Array.isArray(bundle.clubs)) {
    return res.status(404).json({ ok: false, error: 'Δεν βρέθηκε cloud account' });
  }
  const clubs = (bundle.clubs as BundleClub[]).map((club) =>
    club.id === clubId ? { ...club, logoUrl: logoUrl || null } : club,
  );
  if (!clubs.some((club) => club.id === clubId)) {
    return res.status(404).json({ ok: false, error: 'Club not found' });
  }
  const saved = await saveAccountBundle({
    users: bundle.users,
    clubs,
    platformConfig: bundle.platformConfig,
  });
  return res.status(200).json({ ok: true, durable: isDurableStoreEnabled(), updatedAt: saved.updatedAt });
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function assertLoginActivityAdmin(req: VercelRequest, res: VercelResponse): boolean {
  if (!assertSyncAuthorized(req, res)) return false;
  const auth = String(req.headers['authorization'] ?? '').trim();
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : auth;
  if (!token.includes('.')) return true;
  const claims = verifySessionToken(token);
  if (claims && claims.role !== 'platform_admin') {
    res.status(403).json({ ok: false, error: 'Μόνο Platform Admin μπορεί να διαγράψει ιστορικό εισόδων' });
    return false;
  }
  return true;
}

function assertWaitlistAdmin(req: VercelRequest, res: VercelResponse): boolean {
  if (!assertSyncAuthorized(req, res)) return false;
  const auth = String(req.headers['authorization'] ?? '').trim();
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : auth;
  if (!token.includes('.')) return true;
  const claims = verifySessionToken(token);
  if (claims && claims.role !== 'platform_admin') {
    res.status(403).json({ ok: false, error: 'Μόνο Platform Admin' });
    return false;
  }
  return true;
}

function parseWaitlistSubmit(body: unknown): ClubWaitlistEntry | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const clubName = clip(raw.clubName, 120);
  const adminFullName = clip(raw.adminFullName, 120);
  const email = clip(raw.email, 160).toLowerCase();
  const phone = clip(raw.phone, 40);
  const sport = clip(raw.sport, 80);
  const dpaAcceptedAt = clip(raw.dpaAcceptedAt, 40);
  if (clubName.length < 2 || adminFullName.length < 2) return null;
  if (!email.includes('@') || phone.length < 6 || sport.length < 2) return null;
  if (!dpaAcceptedAt) return null;

  const levels = Array.isArray(raw.levels)
    ? raw.levels
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const rawId = clip(raw.id, 80);
  const id = /^wl_[a-zA-Z0-9_-]+$/.test(rawId)
    ? rawId
    : `wl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    clubName,
    adminFullName,
    email,
    phone,
    sport,
    levels,
    createdAt: clip(raw.createdAt, 40) || new Date().toISOString(),
    dpaAcceptedAt,
    status: 'pending',
  };
}

async function handleClubWaitlist(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const action =
      (typeof body.action === 'string' ? body.action.trim() : '') ||
      (typeof req.query.action === 'string' ? req.query.action.trim() : '');

    if (action === 'approve' || action === 'reject') {
      if (!assertWaitlistAdmin(req, res)) return;
      const id = clip(body.id, 80);
      if (!id) {
        return res.status(400).json({ ok: false, error: 'Missing waitlist id' });
      }
      if (action === 'reject') {
        const deleted = await deleteClubWaitlist(id);
        if (!deleted) {
          return res.status(404).json({ ok: false, error: 'Waitlist entry not found' });
        }
        return res.status(200).json({
          ok: true,
          durable: isDurableStoreEnabled(),
          deleted: true,
          id,
        });
      }
      const now = new Date().toISOString();
      const clubId = clip(body.clubId, 80) || null;
      const updated = await updateClubWaitlist(id, {
        status: 'approved',
        approvedAt: now,
        rejectedAt: null,
        clubId,
      });
      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Waitlist entry not found' });
      }
      return res.status(200).json({
        ok: true,
        durable: isDurableStoreEnabled(),
        entry: updated,
      });
    }

    const entry = parseWaitlistSubmit(body);
    if (!entry) {
      return res.status(400).json({ ok: false, error: 'Invalid waitlist payload' });
    }
    const existing = await listClubWaitlist();
    const duplicate = existing.find(
      (item) =>
        item.email === entry.email &&
        (item.status === 'pending' || item.status === 'approved'),
    );
    if (duplicate) {
      return res.status(409).json({
        ok: false,
        error:
          duplicate.status === 'approved'
            ? 'Υπάρχει ήδη εγκεκριμένος λογαριασμός με αυτό το email'
            : 'Υπάρχει ήδη αίτηση σε αναμονή με αυτό το email',
        id: duplicate.id,
      });
    }
    const entries = await appendClubWaitlist(entry);
    let emailed = false;
    let emailError: string | null = null;
    try {
      await notifyPlatformAdminNewClubRegistration(entry);
      emailed = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : 'SMTP notify failed';
      console.error('[club-waitlist] admin notify failed', err);
    }
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      id: entry.id,
      total: entries.length,
      emailed,
      emailError,
    });
  }

  if (req.method === 'GET') {
    if (!assertWaitlistAdmin(req, res)) return;
    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 200;
    const limit = Number.isFinite(limitRaw) ? limitRaw : 200;
    const entries = (await listClubWaitlist(limit)).filter((e) => e.status !== 'rejected');
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      entries,
    });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

function publicUser(user: BundleUser) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    clubId: user.clubId ?? null,
    active: user.active !== false,
  };
}

function readServerBootstrapAdmin(): { email: string; password: string; fullName: string } | null {
  const email = (
    process.env.TEAMSUITE_ADMIN_EMAIL ||
    process.env.VITE_BOOTSTRAP_PLATFORM_ADMIN_EMAIL ||
    ''
  )
    .trim()
    .toLowerCase();
  const password = (
    process.env.TEAMSUITE_ADMIN_PASSWORD ||
    process.env.VITE_BOOTSTRAP_PLATFORM_ADMIN_PASSWORD ||
    ''
  ).trim();
  if (!email || !password) return null;
  const fullName = (
    process.env.TEAMSUITE_ADMIN_NAME ||
    process.env.VITE_BOOTSTRAP_PLATFORM_ADMIN_NAME ||
    'Platform Admin'
  ).trim();
  return { email, password, fullName };
}

function bootstrapAdminUser(boot: { email: string; fullName: string }): BundleUser {
  return {
    id: 'user_platform_admin',
    email: boot.email,
    fullName: boot.fullName,
    role: 'platform_admin',
    clubId: null,
    active: true,
    password: '',
  };
}

/** Strip SMTP/Viva secrets from club records returned to non–platform-admin clients. */
function sanitizeClubForTenant(club: BundleClub): BundleClub {
  const next: BundleClub = { ...club };
  if (next.smtp && typeof next.smtp === 'object') {
    const hasPassword = Boolean(String(next.smtp.password ?? '').trim()) && next.smtp.password !== '********';
    next.smtp = {
      ...next.smtp,
      password: '',
      passwordSet: hasPassword || Boolean(next.smtp.passwordSet),
    };
  }
  if (next.viva && typeof next.viva === 'object') {
    const viva = next.viva as Record<string, unknown>;
    next.viva = {
      ...viva,
      clientSecret: viva.clientSecret ? '********' : '',
    };
  }
  return next;
}

function isValidFirstAccountBootstrap(body: {
  users?: unknown;
  clubs?: unknown;
}): boolean {
  if (!Array.isArray(body.users) || body.users.length === 0 || body.users.length > 50) {
    return false;
  }
  if (!Array.isArray(body.clubs) || body.clubs.length > 20) return false;
  const users = body.users as BundleUser[];
  return users.some(
    (user) =>
      user &&
      user.role === 'platform_admin' &&
      typeof user.email === 'string' &&
      user.email.includes('@') &&
      typeof user.password === 'string' &&
      user.password.length >= 6,
  );
}

function isClubUsageActive(club: BundleClub | undefined): boolean {
  if (!club) return true;
  const today = new Date().toISOString().slice(0, 10);
  if (club.usageStartsOn && today < club.usageStartsOn) return false;
  if (club.usageEndsOn && today > club.usageEndsOn) return false;
  return true;
}

function resolvePlatformSmtp(): SmtpConfig | null {
  const host = (process.env.SMTP_HOST || process.env.PLATFORM_SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || process.env.PLATFORM_SMTP_PORT || 587);
  const username = (process.env.SMTP_USER || process.env.PLATFORM_SMTP_USER || '').trim();
  const password = (process.env.SMTP_PASS || process.env.PLATFORM_SMTP_PASS || '').trim();
  const fromName = (
    process.env.SMTP_FROM_NAME ||
    process.env.PLATFORM_SMTP_FROM_NAME ||
    'TeamSuite'
  ).trim();
  if (!host || !username || !password) return null;
  return { host, port: Number.isFinite(port) ? port : 587, username, password, fromName };
}

/** Inbox for new club registration (waitlist) alerts. */
function resolvePlatformAdminNotifyEmail(): string {
  return (
    process.env.PLATFORM_ADMIN_NOTIFY_EMAIL ||
    process.env.CLUB_WAITLIST_NOTIFY_EMAIL ||
    'tsemperlidis.nikos@gmail.com'
  )
    .trim()
    .toLowerCase();
}

async function notifyPlatformAdminNewClubRegistration(entry: {
  clubName: string;
  adminFullName: string;
  email: string;
  phone: string;
  sport: string;
  levels: string[];
  createdAt: string;
}): Promise<void> {
  const to = resolvePlatformAdminNotifyEmail();
  if (!to.includes('@')) return;

  const smtp = resolvePlatformSmtp();
  if (!smtp) {
    console.warn('[club-waitlist] admin notify skipped: platform SMTP not configured');
    return;
  }

  const levels =
    entry.levels.length > 0
      ? entry.levels.join(', ')
      : '—';
  const when = (() => {
    try {
      return new Date(entry.createdAt).toLocaleString('el-GR');
    } catch {
      return entry.createdAt;
    }
  })();

  const subject = `TeamSuite — Νέα αίτηση συλλόγου: ${entry.clubName}`;
  const text = [
    'Νέα αίτηση εγγραφής συλλόγου στη λίστα αναμονής.',
    '',
    `Σύλλογος: ${entry.clubName}`,
    `Διαχειριστής: ${entry.adminFullName}`,
    `Email: ${entry.email}`,
    `Τηλέφωνο: ${entry.phone}`,
    `Άθλημα: ${entry.sport}`,
    `Επίπεδα: ${levels}`,
    `Ημ/νία: ${when}`,
    '',
    'Άνοιξε Platform Admin → Διαχείριση → Λίστα αναμονής για έγκριση ή απόρριψη.',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#152033">
      <h2 style="margin:0 0 12px">Νέα αίτηση συλλόγου</h2>
      <p style="margin:0 0 16px">Καταχωρήθηκε νέα αίτηση στη λίστα αναμονής TeamSuite.</p>
      <table style="border-collapse:collapse;width:100%;max-width:520px">
        <tr><td style="padding:6px 0;color:#4a5d70">Σύλλογος</td><td style="padding:6px 0"><strong>${escapeHtml(entry.clubName)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#4a5d70">Διαχειριστής</td><td style="padding:6px 0">${escapeHtml(entry.adminFullName)}</td></tr>
        <tr><td style="padding:6px 0;color:#4a5d70">Email</td><td style="padding:6px 0">${escapeHtml(entry.email)}</td></tr>
        <tr><td style="padding:6px 0;color:#4a5d70">Τηλέφωνο</td><td style="padding:6px 0">${escapeHtml(entry.phone)}</td></tr>
        <tr><td style="padding:6px 0;color:#4a5d70">Άθλημα</td><td style="padding:6px 0">${escapeHtml(entry.sport)}</td></tr>
        <tr><td style="padding:6px 0;color:#4a5d70">Επίπεδα</td><td style="padding:6px 0">${escapeHtml(levels)}</td></tr>
        <tr><td style="padding:6px 0;color:#4a5d70">Ημ/νία</td><td style="padding:6px 0">${escapeHtml(when)}</td></tr>
      </table>
      <p style="margin:16px 0 0;color:#4a5d70;font-size:14px">
        Platform Admin → Διαχείριση → Λίστα αναμονής για έγκριση ή απόρριψη.
      </p>
    </div>
  `;

  await sendSmtpMail(smtp, { to, subject, text, html });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveClubSmtp(clubs: BundleClub[], clubId: string | null | undefined): SmtpConfig | null {
  if (!clubId) return null;
  const club = clubs.find((c) => c.id === clubId);
  const smtp = club?.smtp;
  if (!smtp?.enabled) return null;
  const host = String(smtp.host ?? '').trim();
  const username = String(smtp.username ?? '').trim();
  const password = String(smtp.password ?? '').trim();
  const port = Number(smtp.port || 587);
  if (!host || !username || !password) return null;
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    username,
    password,
    fromName: String(smtp.fromName || club?.name || 'TeamSuite').trim(),
  };
}

async function sendSmtpMail(
  smtp: SmtpConfig,
  input: { to: string; subject: string; text: string; html: string },
): Promise<void> {
  const secure = smtp.port === 465;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure,
    requireTLS: !secure && smtp.port === 587,
    auth: { user: smtp.username, pass: smtp.password },
  });
  const fromName = smtp.fromName.replace(/[\r\n]/g, '');
  const info = await transporter.sendMail({
    from: `"${fromName}" <${smtp.username}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  console.info('[smtp] sent', { to: input.to, messageId: info.messageId ?? null });
}

async function handleSession(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = String(body.action ?? 'login').trim();
  const address = requestAddress(req);

  // Session verify runs on every protected mount — do not share the login/forgot bucket
  // or a brief burst (StrictMode + layout) will 429 and bounce users to /login.
  if (action !== 'verify') {
    if (!(await allowRateLimit(`${action}:${address}`, action === 'forgot' ? 5 : 15, 300))) {
      return res.status(429).json({ ok: false, error: 'Πολλά αιτήματα. Δοκιμάστε ξανά αργότερα.' });
    }
  }

  if (action === 'verify') {
    const token = String(body.token ?? '').trim();
    const claims = verifySessionToken(token);
    if (!claims) return res.status(401).json({ ok: false, error: 'Invalid session' });
    let bundle: Awaited<ReturnType<typeof loadAccountBundle>> = null;
    try {
      bundle = await loadAccountBundle();
    } catch (err) {
      console.error('[sync/account session verify]', err);
      return res.status(200).json({
        ok: false,
        transient: true,
        error: 'Account sync temporarily unavailable',
      });
    }
    if (!bundle) {
      if (await accountBundleExists()) {
        return res.status(200).json({
          ok: false,
          transient: true,
          error: durableStorageUnavailableMessage(),
        });
      }
      const boot = readServerBootstrapAdmin();
      if (
        boot &&
        claims.role === 'platform_admin' &&
        claims.email.toLowerCase() === boot.email
      ) {
        return res.status(200).json({ ok: true, user: publicUser(bootstrapAdminUser(boot)) });
      }
      return res.status(200).json({
        ok: false,
        transient: true,
        error: 'Account bundle unavailable',
      });
    }
    const users = Array.isArray(bundle.users) ? (bundle.users as BundleUser[]) : [];
    const current = users.find((user) => user.id === claims.sub);
    if (!current || current.active === false || current.email.toLowerCase() !== claims.email.toLowerCase()) {
      return res.status(401).json({ ok: false, error: 'Session user is no longer active' });
    }
    const clubs = Array.isArray(bundle.clubs) ? (bundle.clubs as BundleClub[]) : [];
    if (current.role !== 'platform_admin' && !isClubUsageActive(clubs.find((club) => club.id === current.clubId))) {
      return res.status(403).json({ ok: false, error: 'Η περίοδος χρήσης του συλλόγου έχει λήξει' });
    }
    return res.status(200).json({ ok: true, user: publicUser(current) });
  }

  if (action === 'login') {
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(body.password ?? '').trim();
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'email and password required' });
    }
    let bundle: Awaited<ReturnType<typeof loadAccountBundle>> = null;
    try {
      bundle = await loadAccountBundle();
    } catch (err) {
      console.error('[sync/account session login]', err);
      return res.status(200).json({
        ok: false,
        transient: true,
        error: 'Account sync temporarily unavailable',
      });
    }
    if (!bundle) {
      if (await accountBundleExists()) {
        return res.status(200).json({
          ok: false,
          transient: true,
          error: durableStorageUnavailableMessage(),
        });
      }
      const boot = readServerBootstrapAdmin();
      if (boot && email === boot.email && password === boot.password) {
        const token = signSession({
          sub: 'user_platform_admin',
          email: boot.email,
          role: 'platform_admin',
          clubId: null,
        });
        if (!token) {
          return res.status(503).json({
            ok: false,
            error: 'Session signing unavailable (configure SS360_SESSION_SECRET)',
          });
        }
        return res.status(200).json({
          ok: true,
          token,
          user: publicUser(bootstrapAdminUser(boot)),
        });
      }
      return res.status(404).json({
        ok: false,
        code: 'no_account_bundle',
        error: 'NO_ACCOUNT_BUNDLE',
      });
    }
    const users = Array.isArray(bundle?.users) ? (bundle!.users as BundleUser[]) : [];
    const user = users.find((u) => u.email?.toLowerCase() === email && u.active !== false);
    if (!user || !(await verifyPassword(password, user.password ?? ''))) {
      return res.status(401).json({ ok: false, error: 'Λάθος email ή κωδικός' });
    }
    const clubs = Array.isArray(bundle?.clubs) ? (bundle!.clubs as BundleClub[]) : [];
    if (user.role !== 'platform_admin' && !isClubUsageActive(clubs.find((club) => club.id === user.clubId))) {
      return res.status(403).json({ ok: false, error: 'Η περίοδος χρήσης του συλλόγου έχει λήξει' });
    }
    let nextPassword = user.password;
    if (user.password && !user.password.startsWith('pbkdf2$')) {
      nextPassword = await hashPassword(password);
      const nextUsers = users.map((u) =>
        u.id === user.id ? { ...u, password: nextPassword } : u,
      );
      await saveAccountBundle({
        users: nextUsers,
        clubs: bundle!.clubs,
        platformConfig: bundle!.platformConfig,
      });
    }
    const token = signSession({
      sub: user.id,
      email: user.email,
      role: user.role,
      clubId: user.clubId ?? null,
    });
    if (!token) {
      return res.status(503).json({
        ok: false,
        error: 'Session signing unavailable (configure SS360_SYNC_SECRET)',
      });
    }
    return res.status(200).json({
      ok: true,
      token,
      user: publicUser({ ...user, password: nextPassword }),
      branding: publicBranding(bundle?.platformConfig, user.clubId),
    });
  }

  if (action === 'forgot') {
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const origin = String(body.origin ?? '')
      .trim()
      .replace(/\/$/, '');
    if (!email) return res.status(400).json({ ok: false, error: 'email required' });

    const generic = {
      ok: true as const,
      emailed: false,
      message:
        'Αν υπάρχει λογαριασμός με αυτό το email, στάλθηκαν οδηγίες επαναφοράς στο inbox σας.',
    };

    const bundle = await loadAccountBundle();
    const users = Array.isArray(bundle?.users) ? (bundle!.users as BundleUser[]) : [];
    const clubs = Array.isArray(bundle?.clubs) ? (bundle!.clubs as BundleClub[]) : [];
    const user = users.find((u) => u.email?.toLowerCase() === email && u.active !== false);
    if (!user) {
      return res.status(200).json(generic);
    }

    const resetToken = await createPasswordResetToken(user.id, user.email);
    const appUrl =
      origin ||
      (process.env.APP_URL || '').replace(/\/$/, '') ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : '');
    const resetUrl = appUrl
      ? `${appUrl}/login?reset=${encodeURIComponent(resetToken)}`
      : '';

    const smtp = resolvePlatformSmtp() || resolveClubSmtp(clubs, user.clubId ?? null);
    if (!smtp) {
      return res.status(200).json({
        ...generic,
        message:
          'Δεν υπάρχει ρυθμισμένο SMTP. Ορίστε SMTP_HOST/USER/PASS στο Vercel ή ενεργοποιήστε SMTP συλλόγου + Push λογαριασμών.',
      });
    }

    const subject = 'TeamSuite — Επαναφορά κωδικού';
    const text = [
      'Λάβαμε αίτημα επαναφοράς κωδικού για τον λογαριασμό σας.',
      '',
      resetUrl
        ? `Ανοίξτε τον σύνδεσμο (ισχύει 1 ώρα):\n${resetUrl}`
        : `Κωδικός επαναφοράς (ισχύει 1 ώρα):\n${resetToken}`,
      '',
      'Αν δεν ζητήσατε εσείς επαναφορά, αγνοήστε αυτό το μήνυμα.',
    ].join('\n');
    const html = `
      <p>Λάβαμε αίτημα επαναφοράς κωδικού για τον λογαριασμό σας στο <strong>TeamSuite</strong>.</p>
      ${
        resetUrl
          ? `<p><a href="${resetUrl}">Πατήστε εδώ για νέο κωδικό</a> (ισχύει 1 ώρα).</p>
             <p style="word-break:break-all;font-size:12px;color:#666">${resetUrl}</p>`
          : `<p>Κωδικός επαναφοράς (ισχύει 1 ώρα):</p><p><code>${resetToken}</code></p>`
      }
      <p>Αν δεν ζητήσατε εσείς επαναφορά, αγνοήστε αυτό το μήνυμα.</p>
    `;

    try {
      await sendSmtpMail(smtp, { to: user.email, subject, text, html });
      return res.status(200).json({
        ok: true,
        emailed: true,
        message: 'Στείλαμε οδηγίες επαναφοράς στο email σας. Ελέγξτε inbox/spam.',
      });
    } catch (err) {
      return res.status(200).json({
        ok: true,
        emailed: false,
        message:
          'Αποτυχία αποστολής email. Ελέγξτε τις ρυθμίσεις SMTP. ' +
          (err instanceof Error ? err.message : ''),
      });
    }
  }

  if (action === 'reset') {
    const resetToken = String(body.resetToken ?? body.token ?? '').trim();
    const newPassword = String(body.newPassword ?? '').trim();
    if (!resetToken || newPassword.length < 6) {
      return res.status(400).json({ ok: false, error: 'resetToken and newPassword (min 6) required' });
    }
    const record = await consumePasswordResetToken(resetToken);
    if (!record) return res.status(400).json({ ok: false, error: 'Μη έγκυρο ή ληγμένο token' });
    const bundle = await loadAccountBundle();
    if (!bundle || !Array.isArray(bundle.users)) {
      return res.status(404).json({ ok: false, error: 'Δεν βρέθηκε cloud account' });
    }
    const users = bundle.users as BundleUser[];
    const idx = users.findIndex((u) => u.id === record.userId);
    if (idx < 0) return res.status(404).json({ ok: false, error: 'User not found' });
    const hashed = await hashPassword(newPassword);
    const nextUsers = users.map((u, i) => (i === idx ? { ...u, password: hashed } : u));
    await saveAccountBundle({
      users: nextUsers,
      clubs: bundle.clubs,
      platformConfig: bundle.platformConfig,
    });
    return res.status(200).json({ ok: true, email: record.email });
  }

  return res.status(400).json({ ok: false, error: 'Unknown session action' });
}

async function handleMedia(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!(await allowRateLimit(`media:${requestAddress(req)}`, 40, 300))) {
    return res.status(429).json({ ok: false, error: 'Πολλά αιτήματα upload. Δοκιμάστε ξανά αργότερα.' });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const clubId = String(body.clubId ?? '').trim();
  const fileName = String(body.fileName ?? 'photo.jpg').trim();
  const contentType = String(body.contentType ?? 'image/jpeg').trim();
  const dataBase64 = String(body.dataBase64 ?? '').trim();
  if (!clubId || !dataBase64) {
    return res.status(400).json({ ok: false, error: 'clubId and dataBase64 required' });
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'].includes(contentType)) {
    return res.status(400).json({ ok: false, error: 'Unsupported media type' });
  }
  const auth = getSyncAuthContext(req);
  if (!auth.viaSecret && auth.claims?.clubId !== clubId && auth.claims?.role !== 'platform_admin') {
    return res.status(403).json({ ok: false, error: 'Forbidden: club mismatch' });
  }
  if (!auth.claims && !auth.viaSecret) {
    if (!assertSyncAuthorized(req, res)) return;
  }
  try {
    const uploaded = await uploadClubMedia({ clubId, fileName, contentType, dataBase64 });
    return res.status(200).json({ ok: true, ...uploaded });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Upload failed',
    });
  }
}

/**
 * Cloud accounts + login-activity + session + media (Hobby-friendly single function).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await dispatchAccount(req, res);
  } catch (err) {
    console.error('[sync/account]', err);
    if (res.headersSent) return;
    return res.status(503).json({
      ok: false,
      error: 'Account sync temporarily unavailable',
    });
  }
}

async function dispatchAccount(req: VercelRequest, res: VercelResponse) {
  const kind = kindOf(req);

  if (kind === 'session') {
    return handleSession(req, res);
  }

  if (kind === 'media') {
    return handleMedia(req, res);
  }

  if (kind === 'club-profile') {
    return handleClubProfile(req, res);
  }

  if (kind === 'club-waitlist') {
    return handleClubWaitlist(req, res);
  }

  if (kind === 'branding') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    let bundle: Awaited<ReturnType<typeof loadAccountBundle>> = null;
    try {
      bundle = await loadAccountBundle();
    } catch (err) {
      console.error('[sync/account branding]', err);
    }
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      ...publicBranding(bundle?.platformConfig),
    });
  }

  if (kind === 'field-key') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const clubId = String(req.query.clubId ?? '').trim();
    if (!clubId) {
      return res.status(400).json({ ok: false, error: 'clubId required' });
    }
    if (!assertClubTenantAccess(req, res, clubId)) return;
    if (!fieldCryptoSecret()) {
      return res.status(503).json({
        ok: false,
        error: 'Field crypto unavailable (configure SS360_SESSION_SECRET)',
      });
    }
    const keyMaterial = deriveClubFieldKeyMaterial(clubId);
    if (!keyMaterial) {
      return res.status(503).json({ ok: false, error: 'Field crypto key derivation failed' });
    }
    return res.status(200).json({
      ok: true,
      version: 2,
      clubId,
      keyMaterial: keyMaterial.toString('base64'),
    });
  }

  if (!assertSyncAuthorized(req, res)) return;

  if (kind === 'user') {
    return handleAccountUser(req, res);
  }

  if (kind === 'login-activity') {
    if (req.method === 'GET') {
      const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
      const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
      const events = await listLoginActivity(limit);
      return res.status(200).json({
        ok: true,
        durable: isDurableStoreEnabled(),
        events,
      });
    }

    if (req.method === 'POST') {
      const event = parseLoginEvent(req.body);
      if (!event) {
        return res.status(400).json({ ok: false, error: 'Invalid login activity payload' });
      }
      const events = await appendLoginActivity(event);
      return res.status(200).json({
        ok: true,
        durable: isDurableStoreEnabled(),
        id: event.id,
        total: events.length,
      });
    }

    if (req.method === 'DELETE') {
      if (!assertLoginActivityAdmin(req, res)) return;
      const body = (req.body ?? {}) as { id?: string; all?: boolean };
      const all =
        body.all === true ||
        String(req.query.all ?? '').trim() === '1' ||
        String(req.query.all ?? '').trim().toLowerCase() === 'true';
      if (all) {
        const cleared = await clearLoginActivity();
        return res.status(200).json({
          ok: true,
          durable: isDurableStoreEnabled(),
          cleared,
        });
      }
      const id = clip(
        typeof body.id === 'string' ? body.id : typeof req.query.id === 'string' ? req.query.id : '',
        80,
      );
      if (!id) {
        return res.status(400).json({ ok: false, error: 'Missing login activity id' });
      }
      const deleted = await deleteLoginActivity(id);
      if (!deleted) {
        return res.status(404).json({ ok: false, error: 'Login activity not found' });
      }
      return res.status(200).json({
        ok: true,
        durable: isDurableStoreEnabled(),
        deleted: true,
        id,
      });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (req.method === 'GET') {
    let bundle: Awaited<ReturnType<typeof loadAccountBundle>> = null;
    try {
      bundle = await loadAccountBundle();
    } catch (err) {
      console.error('[sync/account GET]', err);
      return res.status(200).json({
        ok: false,
        transient: true,
        durable: isDurableStoreEnabled(),
        error: 'Account sync temporarily unavailable',
      });
    }
    if (!bundle) {
      return res.status(404).json({
        ok: false,
        durable: isDurableStoreEnabled(),
        error: 'Δεν βρέθηκε cloud account. Ο Platform Admin πρέπει να κάνει Push από Backup.',
      });
    }
    const auth = getSyncAuthContext(req);
    // Tenant JWT: scoped users/clubs without password hashes or payment secrets.
    // platform_admin JWT or server-side sync secret: full bundle for admin restore.
    if (auth.claims && auth.claims.role !== 'platform_admin') {
      const clubId = auth.claims.clubId;
      const users = Array.isArray(bundle.users)
        ? (bundle.users as BundleUser[])
            .filter((user) => user.clubId === clubId)
            .map(({ password: _password, ...user }) => user)
        : [];
      const clubs = Array.isArray(bundle.clubs)
        ? (bundle.clubs as BundleClub[])
            .filter((club) => club.id === clubId)
            .map((club) => sanitizeClubForTenant(club))
        : [];
      return res.status(200).json({
        ok: true,
        durable: isDurableStoreEnabled(),
        users,
        clubs,
        platformBranding: publicBranding(bundle.platformConfig, clubId),
      });
    }
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      ...bundle,
    });
  }

  if (req.method === 'POST') {
    try {
      const auth = getSyncAuthContext(req);
      const body = (req.body ?? {}) as {
        users?: unknown;
        clubs?: unknown;
        platformConfig?: unknown;
      };
      if (body.users == null) {
        return res.status(400).json({ ok: false, error: 'users required' });
      }

      if (!isDurableStoreEnabled()) {
        return res.status(503).json({
          ok: false,
          durable: false,
          error:
            'Το cloud sync δεν είναι ενεργό: λείπει Vercel Blob/Redis. Οι λογαριασμοί μένουν μόνο σε αυτόν τον browser.',
        });
      }

      const existing = await loadAccountBundle();
      const bundleMissing = !existing && !(await accountBundleExists());
      const isBootstrap =
        bundleMissing &&
        !auth.viaSecret &&
        !auth.claims &&
        isValidFirstAccountBootstrap(body);

      if (!auth.viaSecret && auth.claims?.role !== 'platform_admin' && !isBootstrap) {
        return res.status(403).json({
          ok: false,
          error: 'Μόνο Platform Admin μπορεί να αποθηκεύσει account bundle',
        });
      }

      if (isBootstrap) {
        if (!(await allowRateLimit(`account-bootstrap:${requestAddress(req)}`, 3, 3600))) {
          return res.status(429).json({
            ok: false,
            error: 'Πολλά αιτήματα αρχικής εγκατάστασης. Δοκιμάστε αργότερα.',
          });
        }
      }

      const jwt = auth.claims ?? bearerClaims(req);
      const canWritePlatform =
        isBootstrap || jwt?.role === 'platform_admin' || (auth.viaSecret && !jwt);
      if (!canWritePlatform && body.clubs == null && existing?.clubs == null) {
        return res.status(400).json({ ok: false, error: 'users and clubs required' });
      }
      if (canWritePlatform && body.clubs == null) {
        return res.status(400).json({ ok: false, error: 'users and clubs required' });
      }
      const saved = await saveAccountBundle({
        users: mergeBundleUsers(existing?.users, body.users, {
          replaceAll: canWritePlatform,
          clubId: jwt?.clubId ?? null,
        }),
        clubs: canWritePlatform
          ? mergeBundleClubs(existing?.clubs, body.clubs)
          : (existing?.clubs ?? body.clubs),
        platformConfig: canWritePlatform ? body.platformConfig : existing?.platformConfig,
      });
      return res.status(200).json({
        ok: true,
        durable: isDurableStoreEnabled(),
        updatedAt: saved.updatedAt,
        bootstrapped: isBootstrap || undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Account push failed';
      return res.status(500).json({ ok: false, error: message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
