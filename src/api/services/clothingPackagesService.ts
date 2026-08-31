import { apiClient } from '../apiClient';
import { getData, mutateData } from '../../data/repository';
import type { ClothingPackageDef } from '../../types';
import { normalizeClothingPackages } from '../../utils/clothingPackages';

export async function getClothingPackages() {
  return apiClient(() => getData().clothingPackages ?? []);
}

export async function saveClothingPackages(packages: ClothingPackageDef[]) {
  return apiClient(() => {
    mutateData((data) => {
      data.clothingPackages = normalizeClothingPackages(packages);
    });
    return getData().clothingPackages ?? [];
  });
}
