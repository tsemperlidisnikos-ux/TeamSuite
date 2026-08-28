import { apiClient } from '../apiClient';
import { createId, mutateData } from '../../data/repository';
import { facilitySchema, type FacilityInput } from '../../schemas';
import type { Facility } from '../../types';

export async function createFacility(input: FacilityInput) {
  return apiClient(() => {
    const parsed = facilitySchema.parse(input);
    const facility: Facility = {
      ...parsed,
      id: createId('facility'),
    };
    mutateData((data) => {
      if (!data.facilities) data.facilities = [];
      data.facilities.push(facility);
    });
    return facility;
  });
}

export async function updateFacility(id: string, input: FacilityInput) {
  return apiClient(() => {
    const parsed = facilitySchema.parse(input);
    let updated: Facility | undefined;
    mutateData((data) => {
      if (!data.facilities) data.facilities = [];
      const index = data.facilities.findIndex((item) => item.id === id);
      if (index === -1) throw new Error('Η εγκατάσταση δεν βρέθηκε');
      updated = { ...data.facilities[index], ...parsed };
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
