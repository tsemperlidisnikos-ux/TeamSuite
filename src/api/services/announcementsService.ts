import { apiClient } from '../apiClient';
import { getSession } from '../../auth/auth';
import { createId, mutateData } from '../../data/repository';
import { rememberDeletedId } from '../../data/financeSyncMerge';
import { announcementSchema, type AnnouncementInput } from '../../schemas';
import type { Announcement } from '../../types';
import { localDateTimeIso } from '../../utils/dates';
import { scheduleClubOpsSlice } from './clubOpsSyncService';

function assertParentCannotSendAnnouncements(): void {
  if (getSession()?.role === 'parent') {
    throw new Error('Οι γονείς μπορούν μόνο να βλέπουν ανακοινώσεις.');
  }
}

function toAnnouncement(
  parsed: AnnouncementInput,
  id: string,
  createdAt: string,
): Announcement {
  const classIds = parsed.classIds ?? [];
  return {
    id,
    title: parsed.title,
    message: parsed.message,
    targetType: classIds.length === 1 ? 'team' : parsed.targetType,
    targetId: classIds.length === 1 ? classIds[0] : parsed.targetId || null,
    createdAt,
    highPriority:
      parsed.highPriority ||
      parsed.priority === 'high' ||
      parsed.priority === 'urgent',
    priority: parsed.priority ?? (parsed.highPriority ? 'high' : 'normal'),
    status: parsed.status ?? 'published',
    createdBy: parsed.createdBy ?? '',
    imageUrl: parsed.imageUrl ?? null,
    visibleFrom: parsed.visibleFrom ?? '',
    visibleUntil: parsed.visibleUntil ?? '',
    showTo: parsed.showTo ?? '',
    sportCategories: parsed.sportCategories ?? '',
    teamsLabel: parsed.teamsLabel ?? '',
    customChargeFilter: parsed.customChargeFilter ?? '',
    clothingPackageId: parsed.clothingPackageId ?? '',
    audienceRoles: parsed.audienceRoles ?? [],
    classIds,
    recipientIds: parsed.recipientIds ?? [],
    updatedAt: Date.now(),
  };
}

export async function createAnnouncement(input: AnnouncementInput) {
  return apiClient(() => {
    assertParentCannotSendAnnouncements();
    const parsed = announcementSchema.parse(input);
    const announcement = toAnnouncement(
      parsed,
      createId('ann'),
      localDateTimeIso(),
    );
    mutateData((data) => {
      data.announcements.unshift(announcement);
    });
    scheduleClubOpsSlice();
    return announcement;
  });
}

export async function updateAnnouncement(id: string, input: AnnouncementInput) {
  return apiClient(() => {
    assertParentCannotSendAnnouncements();
    const parsed = announcementSchema.parse(input);
    let updated: Announcement | undefined;
    mutateData((data) => {
      const index = data.announcements.findIndex((a) => a.id === id);
      if (index === -1) throw new Error('Η ανακοίνωση δεν βρέθηκε');
      const prev = data.announcements[index];
      updated = {
        ...toAnnouncement(parsed, id, prev.createdAt),
        emailStats: prev.emailStats,
      };
      data.announcements[index] = updated;
    });
    scheduleClubOpsSlice();
    return updated!;
  });
}

export async function saveAnnouncementEmailStats(
  id: string,
  emailStats: NonNullable<Announcement['emailStats']>,
) {
  return apiClient(() => {
    let updated: Announcement | undefined;
    mutateData((data) => {
      const index = data.announcements.findIndex((a) => a.id === id);
      if (index === -1) throw new Error('Η ανακοίνωση δεν βρέθηκε');
      updated = {
        ...data.announcements[index],
        emailStats: {
          ...emailStats,
          openedCount: emailStats.recipients.filter((r) => r.openedAt).length,
          updatedAt: new Date().toISOString(),
        },
        updatedAt: Date.now(),
      };
      data.announcements[index] = updated;
    });
    scheduleClubOpsSlice();
    return updated!;
  });
}

export async function deleteAnnouncement(id: string) {
  return apiClient(() => {
    assertParentCannotSendAnnouncements();
    mutateData((data) => {
      data.announcements = data.announcements.filter((a) => a.id !== id);
      data.deletedAnnouncementIds = rememberDeletedId(data.deletedAnnouncementIds, id);
    });
    scheduleClubOpsSlice();
    return { id };
  });
}
