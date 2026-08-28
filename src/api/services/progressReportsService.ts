import { apiClient } from '../apiClient';
import { getSession } from '../../auth/auth';
import { createId, mutateData } from '../../data/repository';
import type { ProgressReport } from '../../types';
import { localDateIso, localDateTimeIso } from '../../utils/dates';

export type ProgressReportInput = {
  athleteId: string;
  date: string;
  title: string;
  notes: string;
  rating: number;
};

export async function createProgressReport(input: ProgressReportInput) {
  return apiClient(() => {
    const session = getSession();
    const athleteId = input.athleteId.trim();
    const title = input.title.trim();
    const notes = input.notes.trim();
    const date = input.date.trim() || localDateIso();
    const rating = Math.min(5, Math.max(1, Math.round(Number(input.rating) || 3)));

    if (!athleteId) throw new Error('Επιλέξτε αθλητή');
    if (title.length < 2) throw new Error('Συμπληρώστε τίτλο');

    const report: ProgressReport = {
      id: createId('prog'),
      athleteId,
      date,
      title,
      notes,
      rating,
      createdByName: session?.fullName || session?.email || 'Χρήστης',
      createdAt: localDateTimeIso(),
    };

    mutateData((data) => {
      if (!data.progressReports) data.progressReports = [];
      data.progressReports.unshift(report);
    });
    return report;
  });
}

export async function deleteProgressReport(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.progressReports = (data.progressReports ?? []).filter((r) => r.id !== id);
    });
    return { id };
  });
}
