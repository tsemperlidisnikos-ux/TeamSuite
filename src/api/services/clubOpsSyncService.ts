import { getSession } from '../../auth/auth';
import { getClubData, getData } from '../../data/repository';
import { resolveActiveClubId, whenClubMapPersisted } from '../../data/store';
import { stripHeavyMedia } from '../../data/mediaStrip';
import { getPreviewClubId } from '../../platform/platformConfig';
import type { AppData } from '../../types';
import { syncAuthHeaders } from '../syncAuth';

/** Live club fields χωρίς roster/AMKA (αυτά πάνε στο encrypted full mirror). */
export type ClubOpsSlice = Omit<
  AppData,
  'students' | 'deletedStudentIds' | 'amkaAccessLogs' | 'gdprAuditLogs' | 'termsOfUseHtml' | 'dpaHtml' | 'retentionPolicyHtml'
>;

export function clubOpsSliceFromData(data: AppData): ClubOpsSlice {
  const safe = stripHeavyMedia(data);
  const slice: Record<string, unknown> = { ...safe };
  delete slice.students;
  delete slice.deletedStudentIds;
  delete slice.amkaAccessLogs;
  delete slice.gdprAuditLogs;
  delete slice.termsOfUseHtml;
  delete slice.dpaHtml;
  delete slice.retentionPolicyHtml;
  return slice as ClubOpsSlice;
}

export async function publishClubOpsSlice(clubId?: string | null) {
  const id = (clubId ?? getPreviewClubId() ?? getSession()?.clubId ?? resolveActiveClubId()).trim();
  if (!id || id === '_default') return;
  await whenClubMapPersisted();
  const data = resolveActiveClubId() === id ? getData() : getClubData(id);
  try {
    const response = await fetch('/api/sync/club-ops', {
      method: 'PUT',
      headers: syncAuthHeaders(),
      body: JSON.stringify({ clubId: id, slice: clubOpsSliceFromData(data) }),
    });
    if (response.status === 503) return;
    if (!response.ok) return;
    const json = (await response.json().catch(() => null)) as { updatedAt?: string } | null;
    if (json?.updatedAt) {
      const { noteClubMirrorRevision } = await import('../../data/clubSync');
      noteClubMirrorRevision(id, json.updatedAt);
    }
  } catch {
    /* το πλήρες mirror push καλύπτει το slice στο επόμενο sync */
  }
}
