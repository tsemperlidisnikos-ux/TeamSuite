import { apiClient } from '../apiClient';
import { createId, mutateData } from '../../data/repository';
import { clubSeasonSchema, type ClubSeasonInput } from '../../schemas';
import type { ClubSeason, FeeChargeTemplate } from '../../types';
import { localDateTimeIso } from '../../utils/dates';
import { seasonDisplayName } from '../../utils/clubSeasons';
import { studentClassIds } from '../../utils/studentClasses';
import { publishClubOpsSlice } from './clubOpsSyncService';

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

export type SeasonRolloverInput = ClubSeasonInput & {
  sourceSeasonId: string | null;
  copyClasses: boolean;
  archiveSourceClasses: boolean;
  moveAthletes: boolean;
  generateCharges: boolean;
};

export async function rolloverToNewSeason(input: SeasonRolloverInput) {
  return apiClient(async () => {
    const seasonFields = normalizeSeason(input);
    const newTemplateIds: string[] = [];
    let copiedClasses = 0;
    let movedAthletes = 0;
    let archivedClasses = 0;
    let clonedTemplates = 0;

    mutateData((data) => {
      if (!data.clubSeasons) data.clubSeasons = [];
      const season: ClubSeason = {
        id: createId('season'),
        ...seasonFields,
      };
      data.clubSeasons.push(season);
      data.clubSeasons.sort((a, b) => b.startDate.localeCompare(a.startDate));

      const sourceId = input.sourceSeasonId;
      const source = sourceId
        ? data.clubSeasons.find((s) => s.id === sourceId)
        : null;
      const classMap = new Map<string, string>();
      const sourceClassIds = new Set<string>();

      if (input.copyClasses && sourceId) {
        const sourceClasses = (data.classes ?? []).filter((c) => c.seasonId === sourceId);
        for (const cls of sourceClasses) {
          sourceClassIds.add(cls.id);
          const nextId = createId('class');
          classMap.set(cls.id, nextId);
          data.classes.push({
            ...cls,
            id: nextId,
            seasonId: season.id,
            startDate: season.startDate,
            endDate: season.endDate,
            manualInactive: false,
          });
          copiedClasses += 1;
        }
        if (!data.schedule) data.schedule = [];
        const extraSlots = (data.schedule ?? [])
          .filter((slot) => classMap.has(slot.classId))
          .map((slot) => ({
            ...slot,
            id: createId('sch'),
            classId: classMap.get(slot.classId)!,
          }));
        data.schedule.push(...extraSlots);
      }

      if (input.archiveSourceClasses && sourceId) {
        for (const cls of data.classes ?? []) {
          if (cls.seasonId === sourceId) {
            cls.manualInactive = true;
            archivedClasses += 1;
          }
        }
      }

      if (input.moveAthletes && classMap.size > 0) {
        for (const student of data.students ?? []) {
          if (student.status === 'inactive') continue;
          const prev = studentClassIds(student);
          const nextIds = prev.flatMap((id) => {
            if (classMap.has(id)) return [classMap.get(id)!];
            if (input.archiveSourceClasses && sourceClassIds.has(id)) return [];
            return [id];
          });
          const unique = [...new Set(nextIds)];
          if (unique.join(',') === prev.join(',')) continue;
          student.classIds = unique;
          student.classId = unique[0] ?? null;
          movedAthletes += 1;
        }
      }

      if (input.generateCharges && source) {
        if (!data.feeChargeTemplates) data.feeChargeTemplates = [];
        const sourceLabel = source ? seasonDisplayName(source) : '';
        const candidates = data.feeChargeTemplates.filter((tpl) => {
          if (!sourceLabel) return true;
          return tpl.season.trim() === sourceLabel || tpl.season.trim() === (source?.name ?? '').trim();
        });
        const toClone = candidates.length ? candidates : data.feeChargeTemplates;
        const created: FeeChargeTemplate[] = [];
        for (const tpl of toClone) {
          const next: FeeChargeTemplate = {
            ...tpl,
            id: createId('feeTpl'),
            season: season.name,
            classId:
              tpl.classId && classMap.has(tpl.classId) ? classMap.get(tpl.classId)! : tpl.classId,
            createdAt: localDateTimeIso(),
            lastGeneratedAt: null,
          };
          created.push(next);
          newTemplateIds.push(next.id);
        }
        data.feeChargeTemplates.unshift(...created);
        clonedTemplates = created.length;
      }
    });

    let generatedCharges = 0;
    if (newTemplateIds.length) {
      const { generateChargesFromTemplate } = await import('./feeChargesService');
      for (const templateId of newTemplateIds) {
        const gen = await generateChargesFromTemplate(templateId);
        if (gen.success && gen.data) {
          generatedCharges += Number(gen.data.created ?? 0);
        }
      }
    }
    void publishClubOpsSlice();
    return {
      seasonName: seasonFields.name,
      copiedClasses,
      archivedClasses,
      movedAthletes,
      clonedTemplates,
      generatedCharges,
    };
  });
}
