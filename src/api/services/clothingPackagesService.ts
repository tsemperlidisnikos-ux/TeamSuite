import { apiClient } from '../apiClient';
import { getData, mutateData } from '../../data/repository';
import type { ClothingPackageDef } from '../../types';
import { normalizeClothingPackages } from '../../utils/clothingPackages';

export async function getClothingPackages() {
  return apiClient(() => getData().clothingPackages ?? []);
}

export async function saveClothingPackages(packages: ClothingPackageDef[]) {
  return apiClient(async () => {
    mutateData((data) => {
      data.clothingPackages = normalizeClothingPackages(packages);
    });
    const { flushClubMirrorPush } = await import('../../data/clubSync');
    await flushClubMirrorPush();
    return getData().clothingPackages ?? [];
  });
}
