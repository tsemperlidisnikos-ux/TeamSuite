import { persistClubLogoToCloud, getSessionToken } from '../api/services/sessionService';
import { updateClubLogo } from '../auth/clubs';

const MAX_LOGO_BYTES = 2_000_000;
const MAX_LOGO_DATA_URL_LENGTH = 180_000;

export async function optimizeLogoDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Αποτυχία ανάγνωσης αρχείου.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });

  if (file.type === 'image/svg+xml' || dataUrl.length <= MAX_LOGO_DATA_URL_LENGTH) {
    if (dataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
      throw new Error('Το SVG λογότυπο είναι υπερβολικά μεγάλο. Χρησιμοποιήστε μικρότερο αρχείο.');
    }
    return dataUrl;
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Αποτυχία επεξεργασίας λογοτύπου.'));
    element.src = dataUrl;
  });
  const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Αδυναμία επεξεργασίας λογοτύπου.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const optimized = canvas.toDataURL('image/jpeg', 0.82);
  if (optimized.length > MAX_LOGO_DATA_URL_LENGTH) {
    throw new Error('Το λογότυπο παραμένει υπερβολικά μεγάλο. Χρησιμοποιήστε μικρότερο αρχείο.');
  }
  return optimized;
}

export async function saveClubLogoFromFile(
  clubId: string,
  file: File,
): Promise<{ success: boolean; error?: string; logoUrl?: string | null }> {
  if (!file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
    return { success: false, error: 'Επιλέξτε εικόνα (PNG, JPG ή SVG).' };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { success: false, error: 'Η εικόνα πρέπει να είναι έως 2MB.' };
  }
  try {
    let logoUrl = await optimizeLogoDataUrl(file);
    if (getSessionToken()) {
      const cloud = await persistClubLogoToCloud(clubId, logoUrl);
      if (!cloud.success) {
        return { success: false, error: cloud.error ?? 'Αποτυχία cloud αποθήκευσης λογοτύπου.' };
      }
      logoUrl = cloud.data?.logoUrl ?? logoUrl;
    }
    const result = updateClubLogo(clubId, logoUrl);
    if (!result.success) {
      return { success: false, error: result.error ?? 'Σφάλμα αποθήκευσης' };
    }
    return { success: true, logoUrl };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Αποτυχία αποθήκευσης λογοτύπου.',
    };
  }
}
