import { syncAuthHeaders } from '../syncAuth';
import { getSession, isPlatformAdmin } from '../../auth/auth';
import { getClubs } from '../../auth/clubs';
import { persistLocalStateToCloud } from '../../data/clubSync';
import { clubHasStoredData, getClubData, mutateClubData } from '../../data/repository';
import {
  countPublicJoinFormSnapshots,
  stripPublicJoinFormSnapshots,
} from '../../utils/publicJoinFormSnapshots';

async function stripRemoteClubSnapshots(clubId: string): Promise<void> {
  const response = await fetch('/api/public-join?op=strip-form-snapshots', {
    method: 'POST',
    headers: syncAuthHeaders(),
    body: JSON.stringify({ clubId }),
  });
  if (response.status === 404) return;
  const json = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok || !json.ok) {
    throw new Error(json.error || `Strip snapshots HTTP ${response.status}`);
  }
}

export function previewJoinFormSnapshotCounts(clubIds: string[]) {
  return clubIds.map((id) => {
    const club = getClubs().find((c) => c.id === id);
    const counts = clubHasStoredData(id)
      ? countPublicJoinFormSnapshots(getClubData(id))
      : { athletes: 0, applications: 0, total: 0 };
    return { clubId: id, clubName: club?.name ?? id, local: clubHasStoredData(id), ...counts };
  });
}

export async function stripJoinFormSnapshotsForClubs(clubIds: string[]) {
  if (!isPlatformAdmin() || getSession()?.role !== 'platform_admin') {
    throw new Error('Μόνο Platform Admin μπορεί να κάνει ομαδική διαγραφή φορμών εγγραφής.');
  }
  const unique = [...new Set(clubIds.filter((id) => id && id !== '_default'))];
  if (unique.length === 0) {
    throw new Error('Επιλέξτε τουλάχιστον έναν σύλλογο.');
  }

  let athletes = 0;
  let applications = 0;
  const localIds: string[] = [];
  for (const clubId of unique) {
    if (clubHasStoredData(clubId)) {
      localIds.push(clubId);
      mutateClubData(clubId, (data) => {
        const result = stripPublicJoinFormSnapshots(data);
        athletes += result.athletes;
        applications += result.applications;
      });
    }
    await stripRemoteClubSnapshots(clubId);
  }

  if (localIds.length) {
    const cloud = await persistLocalStateToCloud({ clubIds: localIds });
    if (!cloud.success) {
      throw new Error(cloud.error || 'Η τοπική διαγραφή έγινε, αλλά το cloud sync απέτυχε.');
    }
  }

  return { clubs: unique.length, athletes, applications };
}
