import { apiClient } from '../apiClient';
import { createId, mutateData } from '../../data/repository';
import { associationSchema, type AssociationInput } from '../../schemas';
import type { Association } from '../../types';

export async function createAssociation(input: AssociationInput) {
  return apiClient(() => {
    const parsed = associationSchema.parse(input);
    const association: Association = {
      ...parsed,
      id: createId('assoc'),
    };
    mutateData((data) => {
      data.associations.push(association);
    });
    return association;
  });
}

export async function updateAssociation(id: string, input: AssociationInput) {
  return apiClient(() => {
    const parsed = associationSchema.parse(input);
    let updated: Association | undefined;
    mutateData((data) => {
      const index = data.associations.findIndex((a) => a.id === id);
      if (index === -1) throw new Error('Το σωματείο δεν βρέθηκε');
      updated = { ...data.associations[index], ...parsed };
      data.associations[index] = updated;
    });
    return updated!;
  });
}

export async function deleteAssociation(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.associations = data.associations.filter((a) => a.id !== id);
    });
    return { id };
  });
}
