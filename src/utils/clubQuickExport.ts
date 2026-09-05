import { getData } from '../data/repository';
import { athleteSheetHeaders, studentToSheetRow } from './athleteSpreadsheet';
import {
  buildClubBackupPayload,
  clubBackupFilenamePrefix,
  downloadBackupJson,
} from './backupArchive';
import { downloadXlsx } from './xlsxDownload';

/** Λήψη JSON backup συλλόγου και Excel λίστας αθλητών (ίδια στήλη με Αθλητές). */
export function downloadClubBackupJsonAndAthletesXlsx(clubId: string): void {
  downloadBackupJson(buildClubBackupPayload(clubId), clubBackupFilenamePrefix(clubId));
  const data = getData();
  window.setTimeout(() => {
    downloadXlsx(
      'Αθλητές',
      athleteSheetHeaders(),
      data.students.map((s) => studentToSheetRow(s, data.classes)),
      `athlites-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }, 400);
}
