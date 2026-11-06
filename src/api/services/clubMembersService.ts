import { apiClient } from '../apiClient';
import { createId, mutateData } from '../../data/repository';
import { rememberDeletedId } from '../../data/financeSyncMerge';
import { scheduleClubOpsSlice } from './clubOpsSyncService';
import { clubMemberSchema, type ClubMemberInput } from '../../schemas';
import type { ClubMember } from '../../types';
import { localDateIso } from '../../utils/dates';

export async function createClubMember(input: ClubMemberInput) {
  return apiClient(() => {
    const parsed = clubMemberSchema.parse(input);
    const member: ClubMember = {
      ...parsed,
      id: createId('member'),
      createdAt: localDateIso(),
    };
    mutateData((data) => {
      if (!data.clubMembers) data.clubMembers = [];
      data.clubMembers.push(member);
    });
    scheduleClubOpsSlice();
    return member;
  });
}

export async function updateClubMember(id: string, input: ClubMemberInput) {
  return apiClient(() => {
    const parsed = clubMemberSchema.parse(input);
    let updated: ClubMember | undefined;
    mutateData((data) => {
      if (!data.clubMembers) data.clubMembers = [];
      const index = data.clubMembers.findIndex((row) => row.id === id);
      if (index === -1) throw new Error('Το μέλος δεν βρέθηκε');
      updated = { ...data.clubMembers[index], ...parsed };
      data.clubMembers[index] = updated;
    });
    scheduleClubOpsSlice();
    return updated!;
  });
}

export async function deleteClubMember(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.clubMembers = (data.clubMembers ?? []).filter((row) => row.id !== id);
      data.deletedClubMemberIds = rememberDeletedId(data.deletedClubMemberIds, id);
    });
    scheduleClubOpsSlice();
    return { id };
  });
}
