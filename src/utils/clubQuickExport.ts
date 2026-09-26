import { refreshUsersForClubBackup } from '../api/services/accountSyncService';
import { getData } from '../data/repository';
import { athleteSheetHeaders, studentToSheetRow } from './athleteSpreadsheet';
import {
  buildClubBackupPayload,
  clubBackupFilenamePrefix,
  downloadBackupJson,
} from './backupArchive';
import { downloadXlsx } from './xlsxDownload';

export async function downloadClubBackupJson(clubId: string): Promise<{
  filename: string;
  userCount: number;
}> {
  await refreshUsersForClubBackup();
  const payload = buildClubBackupPayload(clubId);
  return {
    filename: downloadBackupJson(payload, clubBackupFilenamePrefix(clubId)),
    userCount: payload.users?.length ?? 0,
  };
}

/** Λήψη JSON backup συλλόγου και Excel λίστας αθλητών (ίδια στήλη με Αθλητές). */
export async function downloadClubBackupJsonAndAthletesXlsx(clubId: string): Promise<void> {
  const { filename: jsonName } = await downloadClubBackupJson(clubId);
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
