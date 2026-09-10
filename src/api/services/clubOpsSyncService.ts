import { getSession } from '../../auth/auth';
import { getClubData, getData } from '../../data/repository';
import { resolveActiveClubId } from '../../data/store';
import { getPreviewClubId } from '../../platform/platformConfig';
import type { AppData } from '../../types';
import { syncAuthHeaders } from '../syncAuth';

export type ClubOpsSlice = Pick<
  AppData,
  | 'schedule'
  | 'trainings'
  | 'matches'
  | 'products'
  | 'stockMovements'
  | 'attendance'
  | 'classes'
  | 'announcements'
  | 'registrationApplications'
  | 'rentalBookings'
  | 'revenues'
  | 'coaches'
  | 'staff'
  | 'clubSeasons'
  | 'deletedScheduleIds'
  | 'deletedTrainingIds'
  | 'deletedMatchIds'
  | 'deletedProductIds'
  | 'deletedStockMovementIds'
  | 'deletedAttendanceIds'
  | 'deletedClassIds'
  | 'deletedAnnouncementIds'
  | 'deletedRegistrationApplicationIds'
  | 'deletedRentalBookingIds'
  | 'deletedRevenueIds'
  | 'deletedCoachIds'
  | 'deletedStaffIds'
  | 'deletedSeasonIds'
>;

export function clubOpsSliceFromData(data: AppData): ClubOpsSlice {
  return {
    schedule: data.schedule ?? [],
    trainings: data.trainings ?? [],
    matches: data.matches ?? [],
    products: data.products ?? [],
    stockMovements: data.stockMovements ?? [],
    attendance: data.attendance ?? [],
    classes: data.classes ?? [],
    announcements: data.announcements ?? [],
    registrationApplications: data.registrationApplications ?? [],
    rentalBookings: data.rentalBookings ?? [],
    revenues: data.revenues ?? [],
    coaches: data.coaches ?? [],
    staff: data.staff ?? [],
    clubSeasons: data.clubSeasons ?? [],
    deletedScheduleIds: data.deletedScheduleIds ?? [],
    deletedTrainingIds: data.deletedTrainingIds ?? [],
    deletedMatchIds: data.deletedMatchIds ?? [],
    deletedProductIds: data.deletedProductIds ?? [],
    deletedStockMovementIds: data.deletedStockMovementIds ?? [],
    deletedAttendanceIds: data.deletedAttendanceIds ?? [],
    deletedClassIds: data.deletedClassIds ?? [],
    deletedAnnouncementIds: data.deletedAnnouncementIds ?? [],
    deletedRegistrationApplicationIds: data.deletedRegistrationApplicationIds ?? [],
    deletedRentalBookingIds: data.deletedRentalBookingIds ?? [],
    deletedRevenueIds: data.deletedRevenueIds ?? [],
    deletedCoachIds: data.deletedCoachIds ?? [],
    deletedStaffIds: data.deletedStaffIds ?? [],
    deletedSeasonIds: data.deletedSeasonIds ?? [],
  };
}

export async function publishClubOpsSlice(clubId?: string | null) {
  const id = (clubId ?? getPreviewClubId() ?? getSession()?.clubId ?? resolveActiveClubId()).trim();
  if (!id || id === '_default') return;
  const data = resolveActiveClubId() === id ? getData() : getClubData(id);
  try {
    const response = await fetch('/api/sync/club-ops', {
      method: 'PUT',
      headers: syncAuthHeaders(),
      body: JSON.stringify({ clubId: id, slice: clubOpsSliceFromData(data) }),
    });
    if (response.status === 503) return;
    if (!response.ok) return;
    const json = (await response.json().catch(() => null)) as { updatedAt?: string } | null;
    if (json?.updatedAt) {
      const { noteClubMirrorRevision } = await import('../../data/clubSync');
      noteClubMirrorRevision(id, json.updatedAt);
    }
  } catch {
    /* το πλήρες mirror push καλύπτει το slice στο επόμενο sync */
  }
}
