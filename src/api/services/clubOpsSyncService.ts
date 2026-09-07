import { getSession } from '../../auth/auth';
import { getClubData, getData } from '../../data/repository';
import { resolveActiveClubId } from '../../data/store';
import { getPreviewClubId } from '../../platform/platformConfig';
import type { AppData } from '../../types';
import { syncAuthHeaders } from '../syncAuth';

export type ClubOpsSlice = Pick<
  AppData,
  'schedule' | 'trainings' | 'matches' | 'products' | 'stockMovements'
>;

export function clubOpsSliceFromData(data: AppData): ClubOpsSlice {
  return {
    schedule: data.schedule ?? [],
    trainings: data.trainings ?? [],
    matches: data.matches ?? [],
    products: data.products ?? [],
    stockMovements: data.stockMovements ?? [],
  };
}

export async function publishClubOpsSlice(clubId?: string | null) {
  const id = (clubId ?? getPreviewClubId() ?? getSession()?.clubId ?? resolveActiveClubId()).trim();
  if (!id || id === '_default') return;
  const data = resolveActiveClubId() === id ? getData() : getClubData(id);
  try {
    const response = await fetch('/api/sync/club-ops', {
      method: 'PUT',
      headers: syncAuthHeaders(),
      body: JSON.stringify({ clubId: id, slice: clubOpsSliceFromData(data) }),
    });
    if (response.status === 503) return;
  } catch {
    /* το πλήρες mirror push καλύπτει το slice στο επόμενο sync */
  }
}
