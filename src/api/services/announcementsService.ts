import { apiClient } from '../apiClient';
import { createId, mutateData } from '../../data/repository';
import { announcementSchema, type AnnouncementInput } from '../../schemas';
import type { Announcement } from '../../types';
import { localDateTimeIso } from '../../utils/dates';

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
    audienceRoles: parsed.audienceRoles ?? [],
    classIds,
    recipientIds: parsed.recipientIds ?? [],
  };
}

export async function createAnnouncement(input: AnnouncementInput) {
  return apiClient(() => {
    const parsed = announcementSchema.parse(input);
    const announcement = toAnnouncement(
      parsed,
      createId('ann'),
      localDateTimeIso(),
    );
    mutateData((data) => {
      data.announcements.unshift(announcement);
    });
    return announcement;
  });
}

export async function updateAnnouncement(id: string, input: AnnouncementInput) {
  return apiClient(() => {
    const parsed = announcementSchema.parse(input);
    let updated: Announcement | undefined;
    mutateData((data) => {
      const index = data.announcements.findIndex((a) => a.id === id);
      if (index === -1) throw new Error('Η ανακοίνωση δεν βρέθηκε');
      updated = toAnnouncement(parsed, id, data.announcements[index].createdAt);
      data.announcements[index] = updated;
    });
    return updated!;
  });
}

export async function deleteAnnouncement(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.announcements = data.announcements.filter((a) => a.id !== id);
    });
    return { id };
  });
}
