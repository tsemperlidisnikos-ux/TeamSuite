import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { coachSchema, type CoachInput } from '../../schemas';
import type { Coach } from '../../types';
import { localDateIso } from '../../utils/dates';

export async function getCoaches() {
  return apiClient(() => getData().coaches);
}

export async function createCoach(input: CoachInput) {
  return apiClient(() => {
    const parsed = coachSchema.parse(input);
    const coach: Coach = {
      ...parsed,
      id: createId('coach'),
      hireDate: parsed.hireDate.trim() || localDateIso(),
    };
    mutateData((data) => {
      data.coaches.push(coach);
    });
    return coach;
  });
}

export async function updateCoach(id: string, input: CoachInput) {
  return apiClient(() => {
    const parsed = coachSchema.parse(input);
    let updated: Coach | undefined;
    mutateData((data) => {
      const index = data.coaches.findIndex((c) => c.id === id);
      if (index === -1) throw new Error('Ο προπονητής δεν βρέθηκε');
      const hireDate = parsed.hireDate.trim() || data.coaches[index].hireDate;
      updated = { ...data.coaches[index], ...parsed, hireDate };
      data.coaches[index] = updated;
    });
    return updated!;
  });
}

export async function deleteCoach(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.coaches = data.coaches.filter((c) => c.id !== id);
      data.classes = data.classes.map((c) =>
        c.coachId === id ? { ...c, coachId: null } : c,
      );
    });
    return { id };
  });
}
