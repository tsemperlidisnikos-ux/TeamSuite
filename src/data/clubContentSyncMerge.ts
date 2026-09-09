import type { AppData, Facility } from '../types';
import { FINANCE_TOMBSTONE_CAP } from './financeSyncMerge';
import { mergeByIdPreferringUpdatedAt } from './entityFieldMerge';

function unionIdSet(...lists: Array<string[] | undefined>): Set<string> {
  const set = new Set<string>();
  for (const list of lists) {
    for (const id of list ?? []) {
      const trimmed = String(id).trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return set;
}

function pickNonEmpty(primary?: string | null, fallback?: string | null): string | null {
  const a = (primary ?? '').trim();
  if (a) return a;
  const b = (fallback ?? '').trim();
  return b || null;
}

function mergeFacilities(
  localRows: Facility[] | undefined,
  cloudRows: Facility[] | undefined,
  deleted: Set<string>,
  preferLocal: boolean,
): Facility[] {
  const merged = mergeByIdPreferringUpdatedAt(localRows, cloudRows, deleted, preferLocal);
  return merged.map((row) => {
    const local = (localRows ?? []).find((item) => item.id === row.id);
    const cloud = (cloudRows ?? []).find((item) => item.id === row.id);
    const primary = preferLocal ? local?.photoUrl : cloud?.photoUrl;
    const fallback = preferLocal ? cloud?.photoUrl : local?.photoUrl;
    return { ...row, photoUrl: pickNonEmpty(primary, fallback) };
  });
}

/** Μητρώο / ανακοινώσεις / αιτήσεις / γήπεδα κ.λπ. — ένωση ανά id + tombstones. */
export function applyContentCollections(
  target: AppData,
  local: AppData,
  cloud: AppData,
  preferLocal: boolean,
): void {
  const deletedCoaches = unionIdSet(local.deletedCoachIds, cloud.deletedCoachIds);
  const deletedStaff = unionIdSet(local.deletedStaffIds, cloud.deletedStaffIds);
  const deletedAssoc = unionIdSet(local.deletedAssociationIds, cloud.deletedAssociationIds);
  const deletedFacilities = unionIdSet(local.deletedFacilityIds, cloud.deletedFacilityIds);
  const deletedSports = unionIdSet(local.deletedSportIds, cloud.deletedSportIds);
  const deletedSeasons = unionIdSet(local.deletedSeasonIds, cloud.deletedSeasonIds);
  const deletedAnnouncements = unionIdSet(local.deletedAnnouncementIds, cloud.deletedAnnouncementIds);
  const deletedPartners = unionIdSet(local.deletedPartnerBusinessIds, cloud.deletedPartnerBusinessIds);
  const deletedOffers = unionIdSet(local.deletedPartnerOfferIds, cloud.deletedPartnerOfferIds);
  const deletedPhotos = unionIdSet(local.deletedPhotoIds, cloud.deletedPhotoIds);
  const deletedParents = unionIdSet(local.deletedParentLinkIds, cloud.deletedParentLinkIds);
  const deletedReports = unionIdSet(local.deletedProgressReportIds, cloud.deletedProgressReportIds);
  const deletedApps = unionIdSet(
    local.deletedRegistrationApplicationIds,
    cloud.deletedRegistrationApplicationIds,
  );
  const deletedProtocol = unionIdSet(local.deletedProtocolIds, cloud.deletedProtocolIds);
  const deletedRentals = unionIdSet(local.deletedRentalBookingIds, cloud.deletedRentalBookingIds);

  target.coaches = mergeByIdPreferringUpdatedAt(local.coaches, cloud.coaches, deletedCoaches, preferLocal);
  target.staff = mergeByIdPreferringUpdatedAt(local.staff, cloud.staff, deletedStaff, preferLocal);
  target.associations = mergeByIdPreferringUpdatedAt(
    local.associations,
    cloud.associations,
    deletedAssoc,
    preferLocal,
  );
  target.facilities = mergeFacilities(local.facilities, cloud.facilities, deletedFacilities, preferLocal);
  target.sports = mergeByIdPreferringUpdatedAt(local.sports, cloud.sports, deletedSports, preferLocal);
  target.clubSeasons = mergeByIdPreferringUpdatedAt(
    local.clubSeasons,
    cloud.clubSeasons,
    deletedSeasons,
    preferLocal,
  );
  target.announcements = mergeByIdPreferringUpdatedAt(
    local.announcements,
    cloud.announcements,
    deletedAnnouncements,
    preferLocal,
  );
  target.partnerBusinesses = mergeByIdPreferringUpdatedAt(
    local.partnerBusinesses,
    cloud.partnerBusinesses,
    deletedPartners,
    preferLocal,
  );
  target.partnerOffers = mergeByIdPreferringUpdatedAt(
    local.partnerOffers,
    cloud.partnerOffers,
    deletedOffers,
    preferLocal,
  );
  target.photos = mergeByIdPreferringUpdatedAt(local.photos, cloud.photos, deletedPhotos, preferLocal);
  target.parentLinks = mergeByIdPreferringUpdatedAt(
    local.parentLinks,
    cloud.parentLinks,
    deletedParents,
    preferLocal,
  );
  target.progressReports = mergeByIdPreferringUpdatedAt(
    local.progressReports,
    cloud.progressReports,
    deletedReports,
    preferLocal,
  );
  target.registrationApplications = mergeByIdPreferringUpdatedAt(
    local.registrationApplications,
    cloud.registrationApplications,
    deletedApps,
    preferLocal,
  );
  target.documentProtocolEntries = mergeByIdPreferringUpdatedAt(
    local.documentProtocolEntries,
    cloud.documentProtocolEntries,
    deletedProtocol,
    preferLocal,
  );
  target.rentalBookings = mergeByIdPreferringUpdatedAt(
    local.rentalBookings,
    cloud.rentalBookings,
    deletedRentals,
    preferLocal,
  );
  target.athleteChangeLogs = mergeByIdPreferringUpdatedAt(
    local.athleteChangeLogs ?? [],
    cloud.athleteChangeLogs ?? [],
    new Set(),
    preferLocal,
  );
  target.feeReminderLogs = mergeByIdPreferringUpdatedAt(
    local.feeReminderLogs,
    cloud.feeReminderLogs,
    new Set(),
    preferLocal,
  );
  target.amkaAccessLogs = mergeByIdPreferringUpdatedAt(
    local.amkaAccessLogs,
    cloud.amkaAccessLogs,
    new Set(),
    preferLocal,
  );
  target.gdprAuditLogs = mergeByIdPreferringUpdatedAt(
    local.gdprAuditLogs,
    cloud.gdprAuditLogs,
    new Set(),
    preferLocal,
  );

  const unsub = new Set([
    ...(local.emailUnsubscribes ?? []),
    ...(cloud.emailUnsubscribes ?? []),
  ]);
  target.emailUnsubscribes = [...unsub];

  const cap = FINANCE_TOMBSTONE_CAP;
  target.deletedCoachIds = [...deletedCoaches].slice(-cap);
  target.deletedStaffIds = [...deletedStaff].slice(-cap);
  target.deletedAssociationIds = [...deletedAssoc].slice(-cap);
  target.deletedFacilityIds = [...deletedFacilities].slice(-cap);
  target.deletedSportIds = [...deletedSports].slice(-cap);
  target.deletedSeasonIds = [...deletedSeasons].slice(-cap);
  target.deletedAnnouncementIds = [...deletedAnnouncements].slice(-cap);
  target.deletedPartnerBusinessIds = [...deletedPartners].slice(-cap);
  target.deletedPartnerOfferIds = [...deletedOffers].slice(-cap);
  target.deletedPhotoIds = [...deletedPhotos].slice(-cap);
  target.deletedParentLinkIds = [...deletedParents].slice(-cap);
  target.deletedProgressReportIds = [...deletedReports].slice(-cap);
  target.deletedRegistrationApplicationIds = [...deletedApps].slice(-cap);
  target.deletedProtocolIds = [...deletedProtocol].slice(-cap);
  target.deletedRentalBookingIds = [...deletedRentals].slice(-cap);
}

function hasLocalOnlyRows<T extends { id: string }>(
  localRows: T[] | undefined,
  cloudRows: T[] | undefined,
): boolean {
  const cloudIds = new Set((cloudRows ?? []).map((row) => row.id));
  return (localRows ?? []).some((row) => !cloudIds.has(row.id));
}

function hasLocalOnlyIds(localIds: string[] | undefined, cloudIds: string[] | undefined): boolean {
  const cloud = new Set(cloudIds ?? []);
  return (localIds ?? []).some((id) => !cloud.has(id));
}

export function localContentNeedsPush(local: AppData, cloud: AppData): boolean {
  if (hasLocalOnlyRows(local.coaches, cloud.coaches)) return true;
  if (hasLocalOnlyRows(local.staff, cloud.staff)) return true;
  if (hasLocalOnlyRows(local.associations, cloud.associations)) return true;
  if (hasLocalOnlyRows(local.facilities, cloud.facilities)) return true;
  if (hasLocalOnlyRows(local.sports, cloud.sports)) return true;
  if (hasLocalOnlyRows(local.clubSeasons, cloud.clubSeasons)) return true;
  if (hasLocalOnlyRows(local.announcements, cloud.announcements)) return true;
  if (hasLocalOnlyRows(local.registrationApplications, cloud.registrationApplications)) return true;
  if (hasLocalOnlyRows(local.photos, cloud.photos)) return true;
  if (hasLocalOnlyRows(local.parentLinks, cloud.parentLinks)) return true;
  if (hasLocalOnlyRows(local.progressReports, cloud.progressReports)) return true;
  if (hasLocalOnlyRows(local.rentalBookings, cloud.rentalBookings)) return true;
  if (hasLocalOnlyRows(local.documentProtocolEntries, cloud.documentProtocolEntries)) return true;
  if (hasLocalOnlyRows(local.partnerBusinesses, cloud.partnerBusinesses)) return true;
  if (hasLocalOnlyRows(local.partnerOffers, cloud.partnerOffers)) return true;
  if (hasLocalOnlyIds(local.deletedCoachIds, cloud.deletedCoachIds)) return true;
  if (hasLocalOnlyIds(local.deletedStaffIds, cloud.deletedStaffIds)) return true;
  if (hasLocalOnlyIds(local.deletedAnnouncementIds, cloud.deletedAnnouncementIds)) return true;
  if (hasLocalOnlyIds(local.deletedRegistrationApplicationIds, cloud.deletedRegistrationApplicationIds)) {
    return true;
  }
  if (hasLocalOnlyIds(local.deletedRentalBookingIds, cloud.deletedRentalBookingIds)) return true;
  if (hasLocalOnlyIds(local.deletedSeasonIds, cloud.deletedSeasonIds)) return true;
  if (hasLocalOnlyIds(local.deletedFacilityIds, cloud.deletedFacilityIds)) return true;
  if (hasLocalOnlyIds(local.deletedSportIds, cloud.deletedSportIds)) return true;
  if (hasLocalOnlyIds(local.deletedAssociationIds, cloud.deletedAssociationIds)) return true;
  if (hasLocalOnlyIds(local.deletedPhotoIds, cloud.deletedPhotoIds)) return true;
  if (hasLocalOnlyIds(local.deletedParentLinkIds, cloud.deletedParentLinkIds)) return true;
  if (hasLocalOnlyIds(local.deletedProgressReportIds, cloud.deletedProgressReportIds)) return true;
  if (hasLocalOnlyIds(local.deletedProtocolIds, cloud.deletedProtocolIds)) return true;
  if (hasLocalOnlyIds(local.deletedPartnerBusinessIds, cloud.deletedPartnerBusinessIds)) return true;
  if (hasLocalOnlyIds(local.deletedPartnerOfferIds, cloud.deletedPartnerOfferIds)) return true;
  return false;
}

function byIdJson(rows: Array<{ id: string }> | undefined): string {
  const map: Record<string, unknown> = {};
  for (const row of rows ?? []) map[row.id] = row;
  return JSON.stringify(map);
}

export function contentCollectionsChanged(a: AppData, b: AppData): boolean {
  if (byIdJson(a.coaches) !== byIdJson(b.coaches)) return true;
  if (byIdJson(a.staff) !== byIdJson(b.staff)) return true;
  if (byIdJson(a.announcements) !== byIdJson(b.announcements)) return true;
  if (byIdJson(a.registrationApplications) !== byIdJson(b.registrationApplications)) return true;
  if (byIdJson(a.facilities) !== byIdJson(b.facilities)) return true;
  if (byIdJson(a.sports) !== byIdJson(b.sports)) return true;
  if (byIdJson(a.clubSeasons) !== byIdJson(b.clubSeasons)) return true;
  if (byIdJson(a.photos) !== byIdJson(b.photos)) return true;
  if (byIdJson(a.parentLinks) !== byIdJson(b.parentLinks)) return true;
  if (byIdJson(a.progressReports) !== byIdJson(b.progressReports)) return true;
  if (byIdJson(a.rentalBookings) !== byIdJson(b.rentalBookings)) return true;
  if (byIdJson(a.documentProtocolEntries) !== byIdJson(b.documentProtocolEntries)) return true;
  if (byIdJson(a.associations) !== byIdJson(b.associations)) return true;
  if (byIdJson(a.partnerBusinesses) !== byIdJson(b.partnerBusinesses)) return true;
  if (byIdJson(a.partnerOffers) !== byIdJson(b.partnerOffers)) return true;
  return false;
}
