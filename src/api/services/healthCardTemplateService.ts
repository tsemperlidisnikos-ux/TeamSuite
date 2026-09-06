import { apiClient, type ApiResult } from '../apiClient';
import {
  loadPlatformConfig,
  updateHealthCardTemplatesBySport,
  type HealthCardLayout,
  type HealthCardSportTemplate,
  type PlatformConfig,
} from '../../platform/platformConfig';
import { resolveCatalogSportName } from '../../shared/sportsCatalog';
import { pushAccountBundle } from './accountSyncService';
import { uploadClubPhotoBlob } from './sessionService';

const PLATFORM_MEDIA_CLUB_ID = '_platform';
const MAX_PDF_BYTES = 1_800_000;

function sportKey(name: string): string {
  return resolveCatalogSportName(name) ?? name.trim();
}

function currentMap(): Record<string, HealthCardSportTemplate> {
  return { ...(loadPlatformConfig().healthCardTemplatesBySport ?? {}) };
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function saveHealthCardSportMapping(input: {
  sportName: string;
  layout: HealthCardLayout;
  pdfFile?: File | null;
  clearPdf?: boolean;
}): Promise<ApiResult<PlatformConfig>> {
  return apiClient(async () => {
    const name = sportKey(input.sportName);
    if (!name) throw new Error('Επιλέξτε άθλημα.');
    const map = currentMap();
    let pdfUrl = input.clearPdf ? '' : (map[name]?.pdfUrl ?? '');

    if (input.pdfFile) {
      if (input.pdfFile.type && input.pdfFile.type !== 'application/pdf') {
        throw new Error('Επιλέξτε αρχείο PDF.');
      }
      if (input.pdfFile.size > MAX_PDF_BYTES) {
        throw new Error('Το PDF είναι πολύ μεγάλο (μέγιστο ~1,8 MB).');
      }
      const dataBase64 = await fileToBase64(input.pdfFile);
      const uploaded = await uploadClubPhotoBlob({
        clubId: PLATFORM_MEDIA_CLUB_ID,
        fileName: `health-card-${name.slice(0, 40)}.pdf`,
        contentType: 'application/pdf',
        dataBase64,
      });
      if (!uploaded.success || !uploaded.data?.url) {
        throw new Error(uploaded.error ?? 'Αποτυχία ανεβάσματος PDF.');
      }
      pdfUrl = uploaded.data.url;
    }

    map[name] = { pdfUrl, layout: input.layout };

    const config = updateHealthCardTemplatesBySport(map);
    const pushed = await pushAccountBundle();
    if (!pushed.success) {
      throw new Error(
        pushed.error ??
          'Αποθηκεύτηκε τοπικά, αλλά όχι στο cloud. Κάντε Push από Backup.',
      );
    }
    return config;
  });
}

export async function clearHealthCardSportMapping(
  sportName: string,
): Promise<ApiResult<PlatformConfig>> {
  return apiClient(async () => {
    const name = sportKey(sportName);
    const map = currentMap();
    const want = name.trim().toLowerCase();
    for (const key of Object.keys(map)) {
      if (key.trim().toLowerCase() === want || sportKey(key) === name) {
        delete map[key];
      }
    }
    const config = updateHealthCardTemplatesBySport(map);
    const pushed = await pushAccountBundle();
    if (!pushed.success) {
      throw new Error(
        pushed.error ??
          'Αποθηκεύτηκε τοπικά, αλλά όχι στο cloud. Κάντε Push από Backup.',
      );
    }
    return config;
  });
}
