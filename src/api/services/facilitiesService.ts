import { apiClient } from '../apiClient';
import { createId, mutateData } from '../../data/repository';
import { getSession } from '../../auth/auth';
import { getPreviewClubId } from '../../platform/platformConfig';
import { persistClubImageDataUrl } from './sessionService';
import { facilitySchema, type FacilityInput } from '../../schemas';
import type { Facility } from '../../types';

async function persistPhoto(photoUrl: string | null | undefined, fileName: string) {
  const clubId = getPreviewClubId() ?? getSession()?.clubId ?? null;
  if (!photoUrl?.startsWith('data:')) return photoUrl ?? null;
  if (!clubId) return photoUrl;
  return persistClubImageDataUrl(clubId, photoUrl, fileName);
}

export async function createFacility(input: FacilityInput) {
  return apiClient(async () => {
    const parsed = facilitySchema.parse(input);
    const photoUrl = await persistPhoto(parsed.photoUrl ?? null, 'facility-photo.jpg');
    const facility: Facility = {
      ...parsed,
      id: createId('facility'),
      photoUrl,
    };
    mutateData((data) => {
      if (!data.facilities) data.facilities = [];
      data.facilities.push(facility);
    });
    return facility;
  });
}

export async function updateFacility(id: string, input: FacilityInput) {
  return apiClient(async () => {
    const parsed = facilitySchema.parse(input);
    const photoUrl =
      parsed.photoUrl === undefined
        ? undefined
        : await persistPhoto(parsed.photoUrl, `facility-${id}.jpg`);
    let updated: Facility | undefined;
    mutateData((data) => {
      if (!data.facilities) data.facilities = [];
      const index = data.facilities.findIndex((item) => item.id === id);
      if (index === -1) throw new Error('Η εγκατάσταση δεν βρέθηκε');
      updated = {
        ...data.facilities[index],
        ...parsed,
        photoUrl: photoUrl === undefined ? data.facilities[index].photoUrl ?? null : photoUrl,
      };
      data.facilities[index] = updated;
    });
    return updated!;
  });
}

export async function deleteFacility(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.facilities = (data.facilities ?? []).filter((item) => item.id !== id);
    });
    return { id };
  });
}
