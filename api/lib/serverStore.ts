import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  durableKvBackend,
  isDurableKvEnabled,
  kvDel,
  kvExists,
  kvGet,
  kvIncrementWithExpiry,
  kvSet,
  kvSetIfAbsent,
  putPublicBinary,
} from './durableKv.js';

export type VivaSettlement = {
  id: string;
  orderCode: string;
  transactionId: string;
  amountCents: number;
  status: string;
  clubHint?: string;
  createdAt: string;
  consumed: boolean;
};

type MirrorRecord = { updatedAt: string; payload: unknown };

export type PublicClubClass = {
  id: string;
  name: string;
  sport?: string;
  maxStudents?: number;
};

export type PublicClubSizeChart = {
  kids?: string[];
  men?: string[];
  women?: string[];
  groupLabels?: {
    kids?: string;
    adult?: string;
  };
};

export type PublicClubConfig = {
  clubId: string;
  slug: string;
  name: string;
  city: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
  enabled: boolean;
  autoApprove: boolean;
  allowTrial: boolean;
  allowWaitlist: boolean;
  classes: PublicClubClass[];
  sports?: string[];
  sizeChart?: PublicClubSizeChart;
  termsHtml: string;
  updatedAt: string;
};

export type ClubNotifySmtp = {
  enabled: boolean;
  host: string;
  port: string;
  username: string;
  password: string;
  fromName: string;
};

export type ClubNotifyConfig = {
  clubId: string;
  clubName: string;
  notifyEmail: string;
  smtp: ClubNotifySmtp;
  updatedAt: string;
};

export type RemoteRegistrationApplication = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  guardianName: string;
  guardianPhone: string;
  email: string;
  classId: string | null;
  kind: 'full' | 'trial' | 'waitlist';
  status: 'pending' | 'approved' | 'rejected';
  notes: string;
  createdAt: string;
  athleteId?: string | null;
  amka?: string;
  phone?: string;
  athleteEmail?: string;
  fatherFirstName?: string;
  motherFirstName?: string;
  fatherEmail?: string;
  motherEmail?: string;
  motherPhone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  county?: string;
  sport?: string;
  uniformSize?: string;
  joinExtras?: {
    clothingPackage: 'basic' | 'upgraded';
    istosProgram: 'yes' | 'no';
    preferredPayment: 'cash' | 'card' | 'transfer';
    healthDeclaration: 'allow' | 'deny';
    liabilityAcceptance: 'accept' | 'decline';
    mediaConsent: 'consent' | 'decline';
  };
  gdprItems?: {
    personalData: boolean;
    photoUse: boolean;
    gallery: boolean;
    communication: boolean;
    medical: boolean;
    amkaHealthCard?: boolean;
  };
  amkaConsentAt?: string;
  guardianSignature?: string;
};

export type LoginActivityEvent = {
  id: string;
  at: string;
  userId: string;
  email: string;
  fullName: string;
  role: string;
  clubId: string | null;
  clubName: string | null;
  source: 'login' | 'impersonate';
  userAgent?: string | null;
};

export type ClubWaitlistEntry = {
  id: string;
  clubName: string;
  adminFullName: string;
  email: string;
  phone: string;
  sport: string;
  levels: string[];
  createdAt: string;
  dpaAcceptedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedAt?: string | null;
  rejectedAt?: string | null;
  clubId?: string | null;
};

type GlobalStore = {
  settlements: VivaSettlement[];
  mirrors: Record<string, MirrorRecord>;
  publicClubs: Record<string, PublicClubConfig>;
  notifyConfigs: Record<string, ClubNotifyConfig>;
  pendingApps: Record<string, RemoteRegistrationApplication[]>;
  accountBundle?: AccountBundle;
  loginActivity?: LoginActivityEvent[];
  clubWaitlist?: ClubWaitlistEntry[];
  passwordResets?: Record<string, { userId: string; email: string; exp: number }>;
};

const SETTLEMENTS_KEY = 'ss360:settlements';
const MIRROR_PREFIX = 'ss360:mirror:';
const MIRROR_INDEX_KEY = 'ss360:mirror-keys';
const PUBLIC_CLUB_PREFIX = 'ss360:public-club:';
const NOTIFY_PREFIX = 'ss360:notify:';
const PENDING_APPS_PREFIX = 'ss360:pending-apps:';
const SNAPSHOT_PREFIX = 'ss360:backup-snap:';
const ACCOUNT_BUNDLE_KEY = 'ss360:account-bundle';
const ACCOUNT_USERS_KEY = 'ss360:account-users';
const LOGIN_ACTIVITY_KEY = 'ss360:login-activity';
const LOGIN_ACTIVITY_MAX = 500;
const CLUB_WAITLIST_KEY = 'ss360:club-waitlist';
const CLUB_WAITLIST_MAX = 500;

function memory(): GlobalStore {
  const g = globalThis as typeof globalThis & { __ss360?: GlobalStore };
  if (!g.__ss360) {
    g.__ss360 = {
      settlements: [],
      mirrors: {},
      publicClubs: {},
      notifyConfigs: {},
      pendingApps: {},
      loginActivity: [],
      clubWaitlist: [],
    };
  }
  if (!g.__ss360.publicClubs) g.__ss360.publicClubs = {};
  if (!g.__ss360.notifyConfigs) g.__ss360.notifyConfigs = {};
  if (!g.__ss360.pendingApps) g.__ss360.pendingApps = {};
  if (!g.__ss360.loginActivity) g.__ss360.loginActivity = [];
  if (!g.__ss360.clubWaitlist) g.__ss360.clubWaitlist = [];
  return g.__ss360;
}

export function isDurableStoreEnabled(): boolean {
  return isDurableKvEnabled();
}

export function getDurableStoreBackend(): 'redis' | 'blob' | 'memory' {
  return durableKvBackend();
}

/** User-facing hint when blob/redis metadata exists but reads fail (e.g. suspended Blob store). */
export function durableStorageUnavailableMessage(): string {
  return (
    'Το cloud storage δεν είναι διαθέσιμο: το Vercel Blob store είναι ανασταλμένο ή αποσυνδεδεμένο. ' +
    'Ανοίξτε Vercel Dashboard → Storage → ενεργοποιήστε/συνδέστε ξανά το Blob store (ή Pro trial) και κάντε redeploy.'
  );
}

/** Non-secret diagnostics for /api/health when Blob reads fail. */
export async function diagnoseDurableStorage(): Promise<{
  authMode: 'redis' | 'oidc' | 'rw-token' | 'none';
  hasStoreId: boolean;
  hasOidcToken: boolean;
  hasRwToken: boolean;
  exists: boolean;
  readable: boolean;
  bundleExists: boolean;
  usersExists: boolean;
  bundleReadable: boolean;
  usersReadable: boolean;
  readError: string | null;
}> {
  const backend = durableKvBackend();
  const hasStoreId = Boolean(process.env.BLOB_STORE_ID);
  const hasOidcToken = Boolean(process.env.VERCEL_OIDC_TOKEN);
  const hasRwToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const authMode =
    backend === 'redis'
      ? 'redis'
      : hasStoreId && hasOidcToken
        ? 'oidc'
        : hasRwToken
          ? 'rw-token'
          : 'none';

  let bundleExists = false;
  let usersExists = false;
  let bundleReadable = false;
  let usersReadable = false;
  let readError: string | null = null;
  try {
    bundleExists = await kvExists(ACCOUNT_BUNDLE_KEY);
    usersExists = await kvExists(ACCOUNT_USERS_KEY);
    const bundle = await kvGet<AccountBundle>(ACCOUNT_BUNDLE_KEY);
    const users = await kvGet<unknown>(ACCOUNT_USERS_KEY);
    bundleReadable = Boolean(bundle);
    usersReadable = Array.isArray(users);
    if ((bundleExists || usersExists) && !bundleReadable && !usersReadable) {
      readError = 'keys exist but neither account-bundle nor account-users could be read';
    }
  } catch (err) {
    readError = err instanceof Error ? err.message.slice(0, 240) : 'unknown read error';
  }

  const exists = bundleExists || usersExists;
  const readable = bundleReadable || usersReadable;
  return {
    authMode,
    hasStoreId,
    hasOidcToken,
    hasRwToken,
    exists,
    readable,
    bundleExists,
    usersExists,
    bundleReadable,
    usersReadable,
    readError,
  };
}

const localRateLimits = new Map<string, { count: number; resetAt: number }>();

export async function allowRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const redisCount = await kvIncrementWithExpiry(`ss360:rate:${key}`, windowSeconds);
  if (redisCount != null) return redisCount <= limit;

  const now = Date.now();
  const current = localRateLimits.get(key);
  if (!current || current.resetAt <= now) {
    localRateLimits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    if (localRateLimits.size > 2000) {
      for (const [entryKey, entry] of localRateLimits) {
        if (entry.resetAt <= now) localRateLimits.delete(entryKey);
      }
    }
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

export function requestAddress(req: { headers: Record<string, unknown> }): string {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] ?? 'unknown').trim() || 'unknown';
}

async function readSettlements(): Promise<VivaSettlement[]> {
  if (!isDurableKvEnabled()) return memory().settlements;
  const raw = await kvGet<VivaSettlement[]>(SETTLEMENTS_KEY);
  return Array.isArray(raw) ? raw : [];
}

async function writeSettlements(items: VivaSettlement[]): Promise<void> {
  if (!isDurableKvEnabled()) {
    memory().settlements = items;
    return;
  }
  await kvSet(SETTLEMENTS_KEY, items.slice(0, 200));
}

export async function addSettlement(
  input: Omit<VivaSettlement, 'id' | 'consumed' | 'createdAt'>,
): Promise<VivaSettlement> {
  if (!String(input.orderCode ?? '').trim() || !String(input.transactionId ?? '').trim()) {
    throw new Error('Settlement requires orderCode and transactionId');
  }
  const item: VivaSettlement = {
    ...input,
    id: `vs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    consumed: false,
  };
  const all = await readSettlements();
  const next = [
    item,
    ...all.filter(
      (x) => x.orderCode !== item.orderCode && x.transactionId !== item.transactionId,
    ),
  ].slice(0, 200);
  await writeSettlements(next);
  return item;
}

export async function listOpenSettlements(): Promise<VivaSettlement[]> {
  const all = await readSettlements();
  return all.filter((s) => !s.consumed);
}

export async function consumeSettlement(orderCode: string): Promise<VivaSettlement | null> {
  const normalized = String(orderCode).trim();
  if (!normalized) return null;
  const claim = await kvSetIfAbsent(`ss360:settlement-claim:${normalized}`, 'claimed', 120);
  if (claim === false) return null;
  const all = await readSettlements();
  const found = all.find((x) => x.orderCode === normalized && !x.consumed);
  if (!found) return null;
  found.consumed = true;
  await writeSettlements(all);
  return found;
}

export async function saveMirror(
  clubId: string,
  payload: unknown,
  opts?: { baseUpdatedAt?: string | null },
): Promise<
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: true; updatedAt: string; payload: unknown }
> {
  const existing = await loadMirror(clubId);
  const base = opts?.baseUpdatedAt;
  if (
    typeof base === 'string' &&
    base.length > 0 &&
    existing &&
    existing.updatedAt !== base
  ) {
    return {
      ok: false,
      conflict: true,
      updatedAt: existing.updatedAt,
      payload: existing.payload,
    };
  }

  const record: MirrorRecord = {
    updatedAt: new Date().toISOString(),
    payload,
  };
  if (!isDurableKvEnabled()) {
    memory().mirrors[clubId] = record;
    return { ok: true, updatedAt: record.updatedAt };
  }
  await kvSet(`${MIRROR_PREFIX}${clubId}`, record);
  const keys = (await kvGet<string[]>(MIRROR_INDEX_KEY)) ?? [];
  if (!keys.includes(clubId)) {
    await kvSet(MIRROR_INDEX_KEY, [...keys, clubId]);
  }
  return { ok: true, updatedAt: record.updatedAt };
}

export async function loadMirror(clubId: string): Promise<MirrorRecord | null> {
  if (!isDurableKvEnabled()) return memory().mirrors[clubId] ?? null;
  return (await kvGet<MirrorRecord>(`${MIRROR_PREFIX}${clubId}`)) ?? null;
}

export async function listMirrorKeys(): Promise<string[]> {
  if (!isDurableKvEnabled()) return Object.keys(memory().mirrors);
  return (await kvGet<string[]>(MIRROR_INDEX_KEY)) ?? [];
}

export type AccountBundle = {
  users: unknown;
  clubs: unknown;
  platformConfig?: unknown;
  updatedAt: string;
};

function isDataUrl(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('data:');
}

/** Drop bulky media/logs so Blob GET remains readable for password/user updates. */
function slimBundleClubs(clubs: unknown): unknown {
  if (!Array.isArray(clubs)) return clubs ?? [];
  return clubs.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const club = raw as Record<string, unknown>;
    const { smtpSendLog: _smtpSendLog, ...rest } = club;
    const registration =
      rest.publicRegistration && typeof rest.publicRegistration === 'object'
        ? (rest.publicRegistration as Record<string, unknown>)
        : null;
    return {
      ...rest,
      logoUrl: isDataUrl(rest.logoUrl) ? null : rest.logoUrl,
      publicRegistration: registration
        ? {
            ...registration,
            heroImageUrl: isDataUrl(registration.heroImageUrl) ? null : registration.heroImageUrl,
          }
        : rest.publicRegistration,
    };
  });
}

export async function saveAccountBundle(
  bundle: Omit<AccountBundle, 'updatedAt'>,
): Promise<AccountBundle> {
  const record: AccountBundle = {
    ...bundle,
    clubs: slimBundleClubs(bundle.clubs),
    updatedAt: new Date().toISOString(),
  };
  if (!isDurableKvEnabled()) {
    memory().accountBundle = record;
    return record;
  }
  await kvSet(ACCOUNT_USERS_KEY, record.users);
  await kvSet(ACCOUNT_BUNDLE_KEY, record);
  return record;
}

export async function saveAccountUsers(users: unknown): Promise<void> {
  if (!isDurableKvEnabled()) {
    if (memory().accountBundle) {
      memory().accountBundle = { ...memory().accountBundle, users };
    }
    return;
  }
  await kvSet(ACCOUNT_USERS_KEY, users);
}

export async function loadAccountBundleRaw(): Promise<AccountBundle | null> {
  if (!isDurableKvEnabled()) {
    return memory().accountBundle ?? null;
  }
  return (await kvGet<AccountBundle>(ACCOUNT_BUNDLE_KEY)) ?? null;
}

export async function loadAccountUsers(): Promise<unknown[] | null> {
  if (!isDurableKvEnabled()) {
    const users = memory().accountBundle?.users;
    return Array.isArray(users) ? users : null;
  }
  const usersOnly = await kvGet<unknown>(ACCOUNT_USERS_KEY);
  if (Array.isArray(usersOnly)) return usersOnly;
  const bundle = await kvGet<AccountBundle>(ACCOUNT_BUNDLE_KEY);
  return Array.isArray(bundle?.users) ? bundle.users : null;
}

export async function loadAccountBundle(): Promise<AccountBundle | null> {
  if (!isDurableKvEnabled()) {
    return memory().accountBundle ?? null;
  }
  const bundle = await kvGet<AccountBundle>(ACCOUNT_BUNDLE_KEY);
  const usersOnly = await kvGet<unknown>(ACCOUNT_USERS_KEY);
  if (bundle) {
    if (Array.isArray(usersOnly)) return { ...bundle, users: usersOnly };
    return bundle;
  }
  if (Array.isArray(usersOnly)) {
    return {
      users: usersOnly,
      clubs: [],
      updatedAt: new Date().toISOString(),
    };
  }
  return null;
}

export async function accountBundleExists(): Promise<boolean> {
  if (!isDurableKvEnabled()) return Boolean(memory().accountBundle);
  if (await kvExists(ACCOUNT_BUNDLE_KEY)) return true;
  if (await kvExists(ACCOUNT_USERS_KEY)) return true;
  return false;
}

/** Αντίγραφο όλων των club mirrors με ημερομηνία (για scheduled cloud backup). */
export async function snapshotAllMirrors(): Promise<{
  dateKey: string;
  clubs: string[];
  durable: boolean;
}> {
  const dateKey = new Date().toISOString().slice(0, 10);
  const keys = await listMirrorKeys();
  const durable = isDurableKvEnabled();
  const clubs: string[] = [];

  for (const clubId of keys) {
    const mirror = await loadMirror(clubId);
    if (!mirror) continue;
    const snap = {
      clubId,
      snapshotAt: new Date().toISOString(),
      sourceUpdatedAt: mirror.updatedAt,
      payload: mirror.payload,
    };
    if (!durable) {
      memory().mirrors[`${clubId}__snap__${dateKey}`] = {
        updatedAt: snap.snapshotAt,
        payload: snap,
      };
    } else {
      await kvSet(`${SNAPSHOT_PREFIX}${dateKey}:${clubId}`, snap);
    }
    clubs.push(clubId);
  }

  if (durable) {
    await kvSet(`${SNAPSHOT_PREFIX}${dateKey}:index`, {
      dateKey,
      clubs,
      createdAt: new Date().toISOString(),
    });
  }

  return { dateKey, clubs, durable };
}

export async function savePublicClubConfig(config: PublicClubConfig): Promise<void> {
  const slug = config.slug.trim().toLowerCase();
  if (!isDurableKvEnabled()) {
    for (const [key, value] of Object.entries(memory().publicClubs)) {
      if (value.clubId === config.clubId && key !== slug) {
        delete memory().publicClubs[key];
      }
    }
    memory().publicClubs[slug] = { ...config, slug };
    return;
  }
  const indexKey = 'ss360:public-club-index';
  const index = (await kvGet<Record<string, string>>(indexKey)) ?? {};
  const prevSlug = Object.entries(index).find(([, id]) => id === config.clubId)?.[0];
  if (prevSlug && prevSlug !== slug) {
    await kvDel(`${PUBLIC_CLUB_PREFIX}${prevSlug}`);
    delete index[prevSlug];
  }
  index[slug] = config.clubId;
  await kvSet(indexKey, index);
  await kvSet(`${PUBLIC_CLUB_PREFIX}${slug}`, { ...config, slug });
}

export async function loadPublicClubBySlug(slug: string): Promise<PublicClubConfig | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  if (!isDurableKvEnabled()) return memory().publicClubs[normalized] ?? null;
  return (await kvGet<PublicClubConfig>(`${PUBLIC_CLUB_PREFIX}${normalized}`)) ?? null;
}

export async function saveClubNotifyConfig(config: ClubNotifyConfig): Promise<void> {
  if (!isDurableKvEnabled()) {
    memory().notifyConfigs[config.clubId] = config;
    return;
  }
  await kvSet(`${NOTIFY_PREFIX}${config.clubId}`, config);
}

export async function loadClubNotifyConfig(clubId: string): Promise<ClubNotifyConfig | null> {
  if (!isDurableKvEnabled()) return memory().notifyConfigs[clubId] ?? null;
  return (await kvGet<ClubNotifyConfig>(`${NOTIFY_PREFIX}${clubId}`)) ?? null;
}

export async function appendPendingApplication(
  clubId: string,
  application: RemoteRegistrationApplication,
): Promise<RemoteRegistrationApplication[]> {
  if (!isDurableKvEnabled()) {
    const prev = memory().pendingApps[clubId] ?? [];
    const next = [application, ...prev.filter((a) => a.id !== application.id)].slice(0, 200);
    memory().pendingApps[clubId] = next;
    return next;
  }
  const key = `${PENDING_APPS_PREFIX}${clubId}`;
  const prev = (await kvGet<RemoteRegistrationApplication[]>(key)) ?? [];
  const next = [application, ...prev.filter((a) => a.id !== application.id)].slice(0, 200);
  await kvSet(key, next);
  return next;
}

export async function listPendingApplications(
  clubId: string,
): Promise<RemoteRegistrationApplication[]> {
  if (!isDurableKvEnabled()) return memory().pendingApps[clubId] ?? [];
  return (await kvGet<RemoteRegistrationApplication[]>(`${PENDING_APPS_PREFIX}${clubId}`)) ?? [];
}

async function readLoginActivity(): Promise<LoginActivityEvent[]> {
  if (!isDurableKvEnabled()) return memory().loginActivity ?? [];
  const raw = await kvGet<LoginActivityEvent[]>(LOGIN_ACTIVITY_KEY);
  return Array.isArray(raw) ? raw : [];
}

async function writeLoginActivity(events: LoginActivityEvent[]): Promise<void> {
  const next = events.slice(0, LOGIN_ACTIVITY_MAX);
  if (!isDurableKvEnabled()) {
    memory().loginActivity = next;
    return;
  }
  await kvSet(LOGIN_ACTIVITY_KEY, next);
}

export async function appendLoginActivity(
  event: LoginActivityEvent,
): Promise<LoginActivityEvent[]> {
  const prev = await readLoginActivity();
  const next = [event, ...prev.filter((e) => e.id !== event.id)].slice(0, LOGIN_ACTIVITY_MAX);
  await writeLoginActivity(next);
  return next;
}

export async function listLoginActivity(limit = 100): Promise<LoginActivityEvent[]> {
  const all = await readLoginActivity();
  const capped = Math.min(Math.max(1, limit), LOGIN_ACTIVITY_MAX);
  return all.slice(0, capped);
}

export async function deleteLoginActivity(id: string): Promise<boolean> {
  const prev = await readLoginActivity();
  const next = prev.filter((e) => e.id !== id);
  if (next.length === prev.length) return false;
  await writeLoginActivity(next);
  return true;
}

export async function clearLoginActivity(): Promise<number> {
  const prev = await readLoginActivity();
  await writeLoginActivity([]);
  return prev.length;
}

async function readClubWaitlist(): Promise<ClubWaitlistEntry[]> {
  if (!isDurableKvEnabled()) return memory().clubWaitlist ?? [];
  const raw = await kvGet<ClubWaitlistEntry[]>(CLUB_WAITLIST_KEY);
  return Array.isArray(raw) ? raw : [];
}

async function writeClubWaitlist(entries: ClubWaitlistEntry[]): Promise<void> {
  const next = entries.slice(0, CLUB_WAITLIST_MAX);
  if (!isDurableKvEnabled()) {
    memory().clubWaitlist = next;
    return;
  }
  await kvSet(CLUB_WAITLIST_KEY, next);
}

export async function appendClubWaitlist(
  entry: ClubWaitlistEntry,
): Promise<ClubWaitlistEntry[]> {
  const prev = await readClubWaitlist();
  const next = [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, CLUB_WAITLIST_MAX);
  await writeClubWaitlist(next);
  return next;
}

export async function listClubWaitlist(limit = 200): Promise<ClubWaitlistEntry[]> {
  const all = await readClubWaitlist();
  const capped = Math.min(Math.max(1, limit), CLUB_WAITLIST_MAX);
  return all.slice(0, capped);
}

export async function updateClubWaitlist(
  id: string,
  patch: Partial<
    Pick<ClubWaitlistEntry, 'status' | 'approvedAt' | 'rejectedAt' | 'clubId'>
  >,
): Promise<ClubWaitlistEntry | null> {
  const prev = await readClubWaitlist();
  const index = prev.findIndex((e) => e.id === id);
  if (index < 0) return null;
  const nextEntry: ClubWaitlistEntry = { ...prev[index], ...patch };
  const next = [...prev];
  next[index] = nextEntry;
  await writeClubWaitlist(next);
  return nextEntry;
}

export async function deleteClubWaitlist(id: string): Promise<boolean> {
  const prev = await readClubWaitlist();
  const next = prev.filter((e) => e.id !== id);
  if (next.length === prev.length) return false;
  await writeClubWaitlist(next);
  return true;
}

/** Sync API auth (kept here to avoid an extra Hobby serverless file under api/). */

export type SyncAuthContext = {
  viaSecret: boolean;
  claims: SessionClaims | null;
};

export function getSyncAuthContext(req: {
  headers: Record<string, unknown>;
  query?: Record<string, unknown>;
}): SyncAuthContext {
  const expected = (process.env.SS360_SYNC_SECRET ?? '').trim();
  const authHeader = String(req.headers['authorization'] ?? '').trim();
  const syncKeyHeader = String(req.headers['x-ss360-sync-key'] ?? '').trim();

  // Prefer Bearer JWT over sync key so browser sessions cannot be escalated
  // by a leaked/legacy client key in the same request.
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.includes('.')) {
      const claims = verifySessionToken(token);
      if (claims) return { viaSecret: false, claims };
    }
  }

  let provided = '';
  if (syncKeyHeader) {
    provided = syncKeyHeader.toLowerCase().startsWith('bearer ')
      ? syncKeyHeader.slice(7).trim()
      : syncKeyHeader;
  } else if (authHeader) {
    provided = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : authHeader;
  } else {
    const q = req.query?.key ?? req.query?.secret;
    provided = typeof q === 'string' ? q.trim() : '';
  }

  if (provided.includes('.')) {
    const claims = verifySessionToken(provided);
    if (claims) return { viaSecret: false, claims };
  }

  if (expected && provided && provided === expected) {
    return { viaSecret: true, claims: null };
  }

  if (!expected && process.env.SS360_ALLOW_INSECURE_SYNC === '1') {
    return { viaSecret: true, claims: null };
  }

  return { viaSecret: false, claims: null };
}

export function assertSyncAuthorized(
  req: { headers: Record<string, unknown>; query?: Record<string, unknown> },
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
): boolean {
  const expected = (process.env.SS360_SYNC_SECRET ?? '').trim();
  const ctx = getSyncAuthContext(req);

  if (ctx.claims || ctx.viaSecret) return true;

  if (!expected) {
    if (process.env.SS360_ALLOW_INSECURE_SYNC !== '1') {
      res.status(503).json({
        ok: false,
        error: 'Sync locked: configure SS360_SYNC_SECRET',
      });
      return false;
    }
    return true;
  }

  res.status(401).json({ ok: false, error: 'Unauthorized' });
  return false;
}

/** Enforce tenant isolation when authenticated via session (not platform sync secret). */
export function assertClubTenantAccess(
  req: { headers: Record<string, unknown>; query?: Record<string, unknown> },
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  clubId: string,
): boolean {
  if (!assertSyncAuthorized(req, res)) return false;
  const ctx = getSyncAuthContext(req);
  if (ctx.viaSecret) return true;
  if (ctx.claims?.role === 'platform_admin') return true;
  if (ctx.claims?.clubId && ctx.claims.clubId === clubId) return true;
  res.status(403).json({ ok: false, error: 'Forbidden: club mismatch' });
  return false;
}

export function assertPlatformAdminOrSecret(
  req: { headers: Record<string, unknown>; query?: Record<string, unknown> },
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
): boolean {
  if (!assertSyncAuthorized(req, res)) return false;
  const ctx = getSyncAuthContext(req);
  if (ctx.viaSecret || ctx.claims?.role === 'platform_admin') return true;
  res.status(403).json({ ok: false, error: 'Μόνο Platform Admin' });
  return false;
}

const GDPR_CONSENT_LOG_KEY = 'ss360:gdpr-consent-logs';

export async function appendGdprConsentLog(entry: Record<string, unknown>): Promise<void> {
  const key = GDPR_CONSENT_LOG_KEY;
  const prev = (await kvGet<Record<string, unknown>[]>(key)) ?? [];
  const next = [entry, ...prev].slice(0, 2000);
  if (isDurableKvEnabled()) {
    await kvSet(key, next);
  } else {
    // memory fallback unused for consent logs
  }
}

/* -------------------------------------------------------------------------- */
/* Password verify (Web Crypto) + signed sessions + reset tokens + media     */
/* -------------------------------------------------------------------------- */

const HASH_PREFIX = 'pbkdf2';
const RESET_PREFIX = 'ss360:pwd-reset:';
const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

export type SessionClaims = {
  sub: string;
  email: string;
  role: string;
  clubId: string | null;
  exp: number;
};

type ResetRecord = {
  userId: string;
  email: string;
  exp: number;
};

function sessionSecret(): string {
  return (
    process.env.SS360_SESSION_SECRET ||
    process.env.SS360_SYNC_SECRET ||
    process.env.TEAMSUITE_ADMIN_PASSWORD ||
    process.env.VITE_BOOTSTRAP_PLATFORM_ADMIN_PASSWORD ||
    ''
  ).trim();
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function isPasswordHashed(stored: string): boolean {
  return stored.startsWith(`${HASH_PREFIX}$`);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (!isPasswordHashed(stored)) return stored === password;

  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== HASH_PREFIX) return false;
  const iterations = Number(parts[1]);
  const saltHex = parts[2];
  const hashHex = parts[3];
  if (!iterations || !saltHex || !hashHex) return false;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const saltBytes = fromHex(saltHex);
  const salt = saltBytes.buffer.slice(
    saltBytes.byteOffset,
    saltBytes.byteOffset + saltBytes.byteLength,
  ) as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return toHex(bits) === hashHex;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return `${HASH_PREFIX}$100000$${toHex(salt.buffer)}$${toHex(bits)}`;
}

export function signSession(
  claims: Omit<SessionClaims, 'exp'>,
  ttlSec = SESSION_TTL_SEC,
): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const body: SessionClaims = {
    ...claims,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): SessionClaims | null {
  const secret = sessionSecret();
  if (!secret || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
    if (!claims?.sub || !claims.email || !claims.exp) return null;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function createPasswordResetToken(
  userId: string,
  email: string,
): Promise<string> {
  const token = randomBytes(24).toString('hex');
  const record: ResetRecord = {
    userId,
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  if (!isDurableKvEnabled()) {
    memory().passwordResets = memory().passwordResets ?? {};
    memory().passwordResets![token] = record;
    return token;
  }
  await kvSet(`${RESET_PREFIX}${token}`, record);
  return token;
}

export async function consumePasswordResetToken(
  token: string,
): Promise<ResetRecord | null> {
  const key = `${RESET_PREFIX}${token}`;
  let record: ResetRecord | null = null;
  if (!isDurableKvEnabled()) {
    record = memory().passwordResets?.[token] ?? null;
    if (record) delete memory().passwordResets![token];
  } else {
    record = (await kvGet<ResetRecord>(key)) ?? null;
    if (record) await kvDel(key);
  }
  if (!record) return null;
  if (record.exp < Math.floor(Date.now() / 1000)) return null;
  return record;
}

export async function uploadClubMedia(input: {
  clubId: string;
  fileName: string;
  contentType: string;
  dataBase64: string;
}): Promise<{ url: string; pathname: string }> {
  const raw = input.dataBase64.includes(',')
    ? input.dataBase64.split(',')[1] ?? ''
    : input.dataBase64;
  const bytes = Buffer.from(raw, 'base64');
  if (!bytes.length) throw new Error('Empty media payload');
  if (bytes.length > 2_000_000) throw new Error('Media too large (max ~2MB)');
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'photo';
  const isClubLogo = /^club-logo/i.test(safeName);
  const pathname = isClubLogo
    ? `ss360-media/${input.clubId}/club-logo`
    : `ss360-media/${input.clubId}/${Date.now()}-${safeName}`;
  const url = await putPublicBinary(pathname, bytes, input.contentType || 'image/jpeg', {
    cacheControlMaxAge: isClubLogo ? 60 : undefined,
  });
  return { url, pathname };
}

