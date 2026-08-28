import { apiClient } from '../apiClient';
import { createId, mutateData } from '../../data/repository';
import { clubSeasonSchema, type ClubSeasonInput } from '../../schemas';
import type { ClubSeason } from '../../types';
import { seasonDisplayName } from '../../utils/clubSeasons';

function normalizeSeason(input: ClubSeasonInput): Omit<ClubSeason, 'id'> {
  const parsed = clubSeasonSchema.parse(input);
  const startDate = parsed.startDate.trim();
  const endDate = parsed.endDate.trim();
  const name =
    parsed.name.trim() ||
    seasonDisplayName({ name: '', startDate, endDate });
  return { name, startDate, endDate };
}

export async function createClubSeason(input: ClubSeasonInput) {
  return apiClient(() => {
    const season: ClubSeason = {
      id: createId('season'),
      ...normalizeSeason(input),
    };
    mutateData((data) => {
      if (!data.clubSeasons) data.clubSeasons = [];
      data.clubSeasons.push(season);
      data.clubSeasons.sort((a, b) => b.startDate.localeCompare(a.startDate));
    });
    return season;
  });
}

export async function updateClubSeason(id: string, input: ClubSeasonInput) {
  return apiClient(() => {
    const next = normalizeSeason(input);
    let updated: ClubSeason | undefined;
    mutateData((data) => {
      if (!data.clubSeasons) data.clubSeasons = [];
      const index = data.clubSeasons.findIndex((s) => s.id === id);
      if (index < 0) throw new Error('Η σεζόν δεν βρέθηκε');
      updated = { ...data.clubSeasons[index], ...next };
      data.clubSeasons[index] = updated;
      data.clubSeasons.sort((a, b) => b.startDate.localeCompare(a.startDate));
    });
    return updated!;
  });
}

export async function deleteClubSeason(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      const linked = (data.classes ?? []).some((c) => c.seasonId === id);
      if (linked) {
        throw new Error(
          'Η σεζόν χρησιμοποιείται από τμήματα. Αλλάξτε ή διαγράψτε πρώτα τα τμήματα.',
        );
      }
      data.clubSeasons = (data.clubSeasons ?? []).filter((s) => s.id !== id);
    });
    return { id };
  });
}
