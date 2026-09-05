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
  const jsonName = downloadBackupJson(
    buildClubBackupPayload(clubId),
    clubBackupFilenamePrefix(clubId),
  );
  const xlsxName = jsonName.replace(/\.json$/i, '.xlsx');
  const data = getData();
  window.setTimeout(() => {
    downloadXlsx(
      'Αθλητές',
      athleteSheetHeaders(),
      data.students.map((s) => studentToSheetRow(s, data.classes)),
      xlsxName,
    );
  }, 400);
}
