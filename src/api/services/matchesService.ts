import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { rememberDeletedId } from '../../data/financeSyncMerge';
import { matchSchema, type MatchInput } from '../../schemas';
import type { Match } from '../../types';
import { publishClubOpsSlice } from './clubOpsSyncService';
import { localDateTimeIso } from '../../utils/dates';

export async function listMatches() {
  return apiClient(() =>
    [...(getData().matches ?? [])].sort((a, b) =>
      `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`),
    ),
  );
}

export async function createMatch(input: MatchInput) {
  return apiClient(() => {
    const parsed = matchSchema.parse(input);
    const match: Match = {
      id: createId('match'),
      date: parsed.date,
      time: parsed.time ?? '',
      opponent: parsed.opponent.trim(),
      sport: parsed.sport ?? '',
      classId: parsed.classId ?? null,
      venue: parsed.venue,
      location: parsed.location ?? '',
      status: parsed.status,
      ourScore: parsed.ourScore ?? null,
      opponentScore: parsed.opponentScore ?? null,
      notes: parsed.notes ?? '',
      createdAt: localDateTimeIso(),
      updatedAt: Date.now(),
    };
    mutateData((data) => {
      if (!data.matches) data.matches = [];
      data.matches.unshift(match);
    });
    void publishClubOpsSlice();
    return match;
  });
}

export async function updateMatch(id: string, input: MatchInput) {
  return apiClient(() => {
    const parsed = matchSchema.parse(input);
    let updated: Match | undefined;
    mutateData((data) => {
      if (!data.matches) data.matches = [];
      const index = data.matches.findIndex((m) => m.id === id);
      if (index < 0) throw new Error('Ο αγώνας δεν βρέθηκε');
      updated = {
        ...data.matches[index],
        ...parsed,
        classId: parsed.classId ?? null,
        ourScore: parsed.ourScore ?? null,
        opponentScore: parsed.opponentScore ?? null,
        updatedAt: Date.now(),
      };
      data.matches[index] = updated;
    });
    void publishClubOpsSlice();
    return updated!;
  });
}

export async function deleteMatch(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.matches = (data.matches ?? []).filter((m) => m.id !== id);
      data.deletedMatchIds = rememberDeletedId(data.deletedMatchIds, id);
    });
    void publishClubOpsSlice();
    return { id };
  });
}
