import { getClubById, getClubs, saveClubs } from '../auth/clubs';
import { notifyAppDataChanged } from './appDataEvents';
import { scheduleClubMirrorPush } from './clubSync';
import {
  buildDemoShowcaseData,
  isDemoClubName,
  isDemoShowcaseApplied,
  markDemoShowcaseApplied,
} from './demoShowcase';
import { seedData } from './seed';
import {
  clearStoreMemory,
  createId,
  loadAllClubStores,
  loadStore,
  replaceAllClubStores,
  resolveActiveClubId,
  saveStore,
  writeClubStoreExclusive,
} from './store';
import type { AppData } from '../types';
import { ensureAmkaPrivacySection } from '../shared/termsDefaults';
import { resolveCatalogSportName } from '../shared/sportsCatalog';
import { pruneAmkaAccessLogs } from '../utils/amkaAccess';
import { clearExpiredSeasonEnrollments } from '../utils/clubSeasons';
import { normalizeSizeChart } from '../utils/sizeChartOptions';

let cache: AppData | null = null;
let cacheClubId: string | null = null;

const REMOVED_PAYMENT_TXN_ID = 'txn_8d535cbd';

function ensureCollections(data: AppData): boolean {
  let changed = false;
  if (!data.transactions) data.transactions = structuredClone(seedData.transactions);
  if (!data.deletedTransactionIds) data.deletedTransactionIds = [];
  if (!data.deletedStudentIds) data.deletedStudentIds = [];
  if (!data.suppressedFeeChargeKeys) data.suppressedFeeChargeKeys = [];
  if (!data.trainings) data.trainings = structuredClone(seedData.trainings);
  if (!data.staff) data.staff = structuredClone(seedData.staff);
  if (!data.associations) data.associations = structuredClone(seedData.associations);
  if (!data.facilities) data.facilities = structuredClone(seedData.facilities ?? []);
  if (!data.sports) data.sports = structuredClone(seedData.sports);
  if (!data.clubSeasons) data.clubSeasons = structuredClone(seedData.clubSeasons ?? []);
  if (clearExpiredSeasonEnrollments(data)) changed = true;
  {
    const byKey = new Map<string, (typeof data.sports)[number]>();
    for (const sport of data.sports ?? []) {
      const canonical = resolveCatalogSportName(sport.name) ?? String(sport.name ?? '').trim();
      if (!canonical) continue;
      if (typeof sport.active !== 'boolean') sport.active = true;
      if (sport.name !== canonical) {
        sport.name = canonical;
        changed = true;
      }
      const key = canonical
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ');
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, sport);
        continue;
      }
      // Κράτα ένα record ανά άθλημα· active αν οποιοδήποτε ήταν ενεργό.
      existing.active = Boolean(existing.active || sport.active);
      changed = true;
    }
    const deduped = [...byKey.values()];
    if (deduped.length !== (data.sports?.length ?? 0)) {
      data.sports = deduped;
      changed = true;
    }
  }
  for (const student of data.students ?? []) {
    const nextSports = [
      ...(student.sports ?? []),
      ...(student.sport?.trim() ? [student.sport.trim()] : []),
    ]
      .map((s) => resolveCatalogSportName(s) ?? s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const name of nextSports) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(name);
    }
    const primary =
      (student.sport?.trim()
        ? resolveCatalogSportName(student.sport) ?? student.sport.trim()
        : '') ||
      unique[0] ||
      '';
    const primaryCanon = primary ? resolveCatalogSportName(primary) ?? primary : '';
    const nextPrimary = unique.find((s) => s.toLowerCase() === primaryCanon.toLowerCase()) ?? unique[0] ?? '';
    if (
      student.sport !== nextPrimary ||
      JSON.stringify(student.sports ?? []) !== JSON.stringify(unique)
    ) {
      student.sport = nextPrimary;
      student.sports = unique;
      changed = true;
    }
  }
  if (!data.announcements) data.announcements = structuredClone(seedData.announcements);
  if (!data.budgets) data.budgets = structuredClone(seedData.budgets);
  if (!data.products) data.products = structuredClone(seedData.products);
  if (!data.stockMovements) data.stockMovements = structuredClone(seedData.stockMovements ?? []);
  for (const product of data.products) {
    if (typeof product.stockQty !== 'number' || Number.isNaN(product.stockQty)) {
      product.stockQty = 0;
    }
  }
  if (!data.partnerBusinesses) data.partnerBusinesses = structuredClone(seedData.partnerBusinesses);
  if (!data.partnerOffers) data.partnerOffers = structuredClone(seedData.partnerOffers);
  if (!data.documentProtocolEntries) {
    data.documentProtocolEntries = structuredClone(seedData.documentProtocolEntries ?? []);
  }
  if (!data.feeChargeTemplates) data.feeChargeTemplates = structuredClone(seedData.feeChargeTemplates);
  if (!data.feeReminderLogs) data.feeReminderLogs = structuredClone(seedData.feeReminderLogs);
  if (!data.photos) data.photos = structuredClone(seedData.photos);
  if (!data.parentLinks) data.parentLinks = structuredClone(seedData.parentLinks);
  if (!data.progressReports) data.progressReports = structuredClone(seedData.progressReports ?? []);
  if (!data.registrationApplications) {
    data.registrationApplications = structuredClone(seedData.registrationApplications ?? []);
  }
  if (!data.sizeChart) {
    data.sizeChart = structuredClone(seedData.sizeChart);
    changed = true;
  } else {
    const nextChart = normalizeSizeChart(data.sizeChart);
    const sameKids = JSON.stringify(nextChart.kids) === JSON.stringify(data.sizeChart.kids ?? []);
    const sameMen = JSON.stringify(nextChart.men) === JSON.stringify(data.sizeChart.men ?? []);
    const sameWomen = JSON.stringify(nextChart.women) === JSON.stringify(data.sizeChart.women ?? []);
    if (!sameKids || !sameMen || !sameWomen) {
      data.sizeChart = nextChart;
      changed = true;
    }
  }
  if (data.termsOfUseHtml === undefined) data.termsOfUseHtml = seedData.termsOfUseHtml ?? '';
  if (data.dpaHtml === undefined) data.dpaHtml = seedData.dpaHtml ?? '';
  if (data.retentionPolicyHtml === undefined) {
    data.retentionPolicyHtml = seedData.retentionPolicyHtml ?? '';
  }
  if (data.dataRetentionMonths === undefined) {
    data.dataRetentionMonths = seedData.dataRetentionMonths ?? 36;
  }
  if (data.termsOfUseHtml.trim()) {
    const ensuredTerms = ensureAmkaPrivacySection(data.termsOfUseHtml);
    if (ensuredTerms.changed) {
      data.termsOfUseHtml = ensuredTerms.html;
      changed = true;
    }
  }
  if (!data.amkaAccessLogs) data.amkaAccessLogs = structuredClone(seedData.amkaAccessLogs ?? []);
  if (!data.gdprAuditLogs) data.gdprAuditLogs = [];
  if (!data.emailUnsubscribes) data.emailUnsubscribes = [];
  {
    const pruned = pruneAmkaAccessLogs(data.amkaAccessLogs);
    if (pruned.length !== data.amkaAccessLogs.length) {
      data.amkaAccessLogs = pruned;
      changed = true;
    }
  }
  if (!data.cashAccounts) data.cashAccounts = structuredClone(seedData.cashAccounts ?? []);
  if (!data.closedFinanceMonths) {
    data.closedFinanceMonths = structuredClone(seedData.closedFinanceMonths ?? []);
  }
  if (!data.matches) data.matches = structuredClone(seedData.matches ?? []);
  if (!data.rentalSettings) {
    data.rentalSettings = structuredClone(
      seedData.rentalSettings ?? { publicEnabled: false, notes: '', rules: [] },
    );
  }
  if (!data.rentalBookings) data.rentalBookings = structuredClone(seedData.rentalBookings ?? []);
  // Αποφυγή bugs `"8" === 8` σε φίλτρα μήνα/έτους/ποσού
  for (const t of data.transactions ?? []) {
    t.month = Number(t.month);
    t.year = Number(t.year);
    t.amount = Number(t.amount) || 0;
  }
  for (const student of data.students ?? []) {
    const fromList = Array.isArray(student.classIds) ? student.classIds : [];
    const ids = [
      ...fromList,
      ...(student.classId ? [student.classId] : []),
    ]
      .map((id) => String(id).trim())
      .filter(Boolean);
    const unique = [...new Set(ids)];
    const nextPrimary =
      student.classId && unique.includes(student.classId)
        ? student.classId
        : unique[0] ?? null;
    const sameList =
      unique.length === fromList.length &&
      unique.every((id, i) => id === fromList[i]);
    if (!sameList || student.classId !== nextPrimary) {
      student.classIds = unique;
      student.classId = nextPrimary;
      changed = true;
    }
    const fromSports = Array.isArray(student.sports) ? student.sports : [];
    const sportValues = [
      ...fromSports,
      ...(student.sport?.trim() ? [student.sport.trim()] : []),
    ]
      .map((s) => String(s).trim())
      .filter(Boolean);
    const uniqueSports: string[] = [];
    const seenSports = new Set<string>();
    for (const value of sportValues) {
      const key = value.toLowerCase();
      if (seenSports.has(key)) continue;
      seenSports.add(key);
      uniqueSports.push(value);
    }
    const nextSport =
      student.sport?.trim() &&
      uniqueSports.some((s) => s.toLowerCase() === student.sport!.trim().toLowerCase())
        ? uniqueSports.find(
            (s) => s.toLowerCase() === student.sport!.trim().toLowerCase(),
          )!
        : uniqueSports[0] ?? '';
    const sameSports =
      uniqueSports.length === fromSports.length &&
      uniqueSports.every((s, i) => s === fromSports[i]);
    if (!sameSports || (student.sport ?? '') !== nextSport) {
      student.sports = uniqueSports;
      student.sport = nextSport;
      changed = true;
    }
    const fromCoaches = Array.isArray(student.coachNames) ? student.coachNames : [];
    const coachValues = [
      ...fromCoaches,
      ...(student.coachName?.trim() ? [student.coachName.trim()] : []),
    ]
      .map((s) => String(s).trim())
      .filter(Boolean);
    const uniqueCoaches = [...new Set(coachValues)];
    const nextCoach =
      student.coachName?.trim() && uniqueCoaches.includes(student.coachName.trim())
        ? student.coachName.trim()
        : uniqueCoaches[0] ?? '';
    const sameCoaches =
      uniqueCoaches.length === fromCoaches.length &&
      uniqueCoaches.every((s, i) => s === fromCoaches[i]);
    if (!sameCoaches || (student.coachName ?? '') !== nextCoach) {
      student.coachNames = uniqueCoaches;
      student.coachName = nextCoach;
      changed = true;
    }
  }
  return changed;
}

function purgeRemovedAthletePayment(data: AppData): boolean {
  const beforeTxn = data.transactions.length;
  const beforeRev = data.revenues.length;
  data.transactions = data.transactions.filter((t) => t.id !== REMOVED_PAYMENT_TXN_ID);
  data.revenues = data.revenues.filter(
    (r) => !r.description.includes(`(${REMOVED_PAYMENT_TXN_ID})`),
  );
  return data.transactions.length !== beforeTxn || data.revenues.length !== beforeRev;
}

function purgeMirroredAthletePaymentRevenues(data: AppData): boolean {
  const before = data.revenues.length;
  data.revenues = data.revenues.filter(
    (r) => !/^Πληρωμή αθλητή \(/.test(r.description),
  );
  return data.revenues.length !== before;
}

function syncDemoLicenseUsage(clubId: string, data: AppData): void {
  const activeAthletes = data.students.filter((s) => s.status === 'active').length;
  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === clubId);
  if (index < 0) return;
  const limit = Math.max(clubs[index].athleteLicenseLimit, Math.max(20, activeAthletes));
  const used = Math.min(limit, activeAthletes);
  if (
    clubs[index].athleteLicenseUsed === used &&
    clubs[index].athleteLicenseLimit === limit
  ) {
    return;
  }
  clubs[index] = {
    ...clubs[index],
    athleteLicenseLimit: limit,
    athleteLicenseUsed: used,
  };
  saveClubs(clubs);
}

/** Fill club named DEMO with full presentation dataset (once per showcase version). */
function maybeApplyDemoShowcase(clubId: string): AppData | null {
  const club = getClubById(clubId);
  if (!club || !isDemoClubName(club.name)) return null;
  if (isDemoShowcaseApplied(clubId)) return null;

  const showcase = buildDemoShowcaseData();
  ensureCollections(showcase);
  saveStore(showcase);
  markDemoShowcaseApplied(clubId);
  syncDemoLicenseUsage(clubId, showcase);
  return showcase;
}

/** Drop in-memory cache so the next getData() loads the active club bucket. */
export function clearDataCache(): void {
  cache = null;
  cacheClubId = null;
  clearStoreMemory();
}

export function getData(): AppData {
  const clubId = resolveActiveClubId();
  if (!cache || cacheClubId !== clubId) {
    const seeded = maybeApplyDemoShowcase(clubId);
    if (seeded) {
      cache = seeded;
      cacheClubId = clubId;
      return cache;
    }

    const stored = loadStore();
    cache = stored ?? structuredClone(seedData);
    cacheClubId = clubId;
    const ensured = ensureCollections(cache);
    const cleaned =
      purgeRemovedAthletePayment(cache) || purgeMirroredAthletePaymentRevenues(cache);
    if (clubId !== '_default' && (!stored || cleaned || ensured)) {
      saveStore(cache);
    }
    return cache;
  }

  const ensured = ensureCollections(cache);
  const cleaned =
    purgeRemovedAthletePayment(cache) || purgeMirroredAthletePaymentRevenues(cache);
  if (cleaned || ensured) saveStore(cache);
  return cache;
}

export function mutateData(updater: (data: AppData) => void): AppData {
  const data = structuredClone(getData());
  updater(data);
  cache = data;
  cacheClubId = resolveActiveClubId();
  saveStore(data);
  notifyAppDataChanged();
  scheduleClubMirrorPush(cacheClubId);
  return data;
}

/** Read AppData for a specific club (public join / cross-club). */
export function getClubData(clubId: string): AppData {
  const map = loadAllClubStores();
  const data = structuredClone(map[clubId] ?? seedData);
  ensureCollections(data);
  return data;
}

export function clubHasStoredData(clubId: string): boolean {
  return Object.prototype.hasOwnProperty.call(loadAllClubStores(), clubId);
}

/** Mutate AppData for a specific clubId (works without session). */
export function mutateClubData(clubId: string, updater: (data: AppData) => void): AppData {
  const data = getClubData(clubId);
  updater(data);
  writeClubStoreExclusive(clubId, data);
  if (resolveActiveClubId() === clubId) {
    cache = structuredClone(data);
    cacheClubId = clubId;
  } else {
    clearDataCache();
  }
  notifyAppDataChanged();
  scheduleClubMirrorPush(clubId);
  return data;
}

export function resetData(): AppData {
  cache = structuredClone(seedData);
  cacheClubId = resolveActiveClubId();
  saveStore(cache);
  notifyAppDataChanged();
  return cache;
}

export function replaceData(next: AppData): AppData {
  cache = structuredClone(next);
  ensureCollections(cache);
  cacheClubId = resolveActiveClubId();
  saveStore(cache);
  notifyAppDataChanged();
  scheduleClubMirrorPush(cacheClubId);
  return cache;
}

/** Write AppData into a specific club (e.g. restore from another device). */
export function replaceClubData(
  clubId: string,
  next: AppData,
  opts?: { skipCloudPush?: boolean },
): AppData {
  const data = structuredClone(next);
  ensureCollections(data);
  writeClubStoreExclusive(clubId, data);
  if (resolveActiveClubId() === clubId) {
    cache = structuredClone(data);
    // re-read in case storage stripped media
    const stored = loadStore();
    if (stored) cache = stored;
    cacheClubId = clubId;
  } else {
    clearDataCache();
  }
  notifyAppDataChanged();
  if (!opts?.skipCloudPush) {
    scheduleClubMirrorPush(clubId);
  }
  return cache ?? data;
}

/** Restore multi-club map from backup (optional). */
export function replaceAllClubsData(map: Record<string, AppData>): void {
  replaceAllClubStores(map);
  clearDataCache();
  notifyAppDataChanged();
}

export function exportAllClubsData(): Record<string, AppData> {
  return loadAllClubStores();
}

/** Force-reload DEMO presentation data (e.g. after empty reset). */
export function reseedDemoShowcase(clubId: string): AppData | null {
  const club = getClubById(clubId);
  if (!club || !isDemoClubName(club.name)) return null;
  try {
    const raw = localStorage.getItem('academyhub-demo-showcase-applied-v1');
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, number>;
    delete map[clubId];
    localStorage.setItem('academyhub-demo-showcase-applied-v1', JSON.stringify(map));
  } catch {
    /* ignore */
  }
  const showcase = buildDemoShowcaseData();
  ensureCollections(showcase);
  replaceClubData(clubId, showcase);
  markDemoShowcaseApplied(clubId);
  syncDemoLicenseUsage(clubId, showcase);
  clearDataCache();
  return showcase;
}

export { createId, resolveActiveClubId };
