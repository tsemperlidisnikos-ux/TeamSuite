import { apiClient, type ApiResult } from '../apiClient';
import {
  loadPlatformConfig,
  updateAppLogo,
  type PlatformConfig,
} from '../../platform/platformConfig';
import { pushAccountBundle } from './accountSyncService';
import { uploadClubPhotoBlob } from './sessionService';

const PLATFORM_MEDIA_CLUB_ID = '_platform';

function parseDataUrl(dataUrl: string): { contentType: string; dataBase64: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  let contentType = match[1].trim().toLowerCase();
  if (contentType === 'image/jpg') contentType = 'image/jpeg';
  return { contentType, dataBase64: dataUrl.trim() };
}

/**
 * Saves the platform app logo and publishes it to cloud so every user sees the same branding.
 * Prefers Vercel Blob URL (stable, shared); falls back to data-URL in account bundle if upload fails.
 */
export async function publishAppLogo(
  dataUrlOrNull: string | null,
): Promise<ApiResult<PlatformConfig>> {
  return apiClient(async () => {
    let logoUrl: string | null = dataUrlOrNull;

    if (dataUrlOrNull && dataUrlOrNull.startsWith('data:')) {
      const parsed = parseDataUrl(dataUrlOrNull);
      if (!parsed) throw new Error('Μη έγκυρη εικόνα logo.');
      if (
        !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(parsed.contentType)
      ) {
        throw new Error('Υποστηρίζονται JPG, PNG, WEBP, GIF.');
      }

      const uploaded = await uploadClubPhotoBlob({
        clubId: PLATFORM_MEDIA_CLUB_ID,
        fileName: 'club-logo-app',
        contentType: parsed.contentType,
        dataBase64: parsed.dataBase64,
      });
      if (uploaded.success && uploaded.data?.url) {
        logoUrl = uploaded.data.url;
      }
      // else keep data URL and still push account bundle
    }

    const config = updateAppLogo(logoUrl);
    const pushed = await pushAccountBundle();
    if (!pushed.success) {
      throw new Error(
        pushed.error ??
          'Το logo αποθηκεύτηκε τοπικά, αλλά όχι στο cloud. Κάντε Push από Backup.',
      );
    }
    return config;
  });
}

/** Re-publish current local platform branding (logo/name/theme) to cloud. */
export async function publishCurrentPlatformBranding(): Promise<ApiResult<PlatformConfig>> {
  return apiClient(async () => {
    const config = loadPlatformConfig();
    const pushed = await pushAccountBundle();
    if (!pushed.success) {
      throw new Error(pushed.error ?? 'Αποτυχία cloud push branding');
    }
    return config;
  });
}
