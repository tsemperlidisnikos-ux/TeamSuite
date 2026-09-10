import type { AcademyClass, AttendanceRecord, ClubSeason, Training } from '../types';
import { getActiveSeason } from './clubSeasons';
import { localDateIso } from './dates';

export function classRequiresAttendance(cls: AcademyClass | undefined | null): boolean {
  if (!cls) return false;
  return cls.attendanceRequired !== false;
}

export function trainingEndMs(training: Pick<Training, 'date' | 'endTime'>): number | null {
  const date = training.date?.trim();
  if (!date) return null;
  const parts = (training.endTime || '00:00').split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1] ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const end = new Date(`${date}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  end.setHours(hours, minutes, 0, 0);
  return end.getTime();
}

export function trainingHasEnded(
  training: Pick<Training, 'date' | 'endTime'>,
  now = new Date(),
): boolean {
  const end = trainingEndMs(training);
  return end != null && end < now.getTime();
}

export type MissingAttendanceTraining = Training & { className: string };

export function listMissingAttendanceTrainings(options: {
  trainings: Training[] | undefined;
  classes: AcademyClass[] | undefined;
  attendance: AttendanceRecord[] | undefined;
  seasons?: ClubSeason[] | null;
  classIds?: Set<string>;
  now?: Date;
}): MissingAttendanceTraining[] {
  const now = options.now ?? new Date();
  const classById = new Map((options.classes ?? []).map((cls) => [cls.id, cls]));
  const attended = new Set<string>();
  for (const row of options.attendance ?? []) {
    if (!row.classId || !row.date) continue;
    attended.add(`${row.classId}|${row.date}`);
  }

  const season = getActiveSeason(options.seasons, localDateIso(now));
  const lookback = new Date(now);
  lookback.setDate(lookback.getDate() - 90);
  const lookbackIso = localDateIso(lookback);

  const missing: MissingAttendanceTraining[] = [];
  for (const training of options.trainings ?? []) {
    if (!training.classId) continue;
    if (options.classIds && !options.classIds.has(training.classId)) continue;
    if (season) {
      if (training.date < season.startDate || training.date > season.endDate) continue;
    } else if (training.date < lookbackIso) {
      continue;
    }
    const cls = classById.get(training.classId);
    if (!classRequiresAttendance(cls)) continue;
    if (!trainingHasEnded(training, now)) continue;
    if (attended.has(`${training.classId}|${training.date}`)) continue;
    missing.push({ ...training, className: cls?.name ?? 'Τμήμα' });
  }

  missing.sort((a, b) => `${a.date}${a.endTime}`.localeCompare(`${b.date}${b.endTime}`));
  return missing;
}
