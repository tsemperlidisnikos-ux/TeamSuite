import type { ClothingPackageDef, Student } from '../types';
import { CLOTHING_PACKAGE_OPTIONS } from '../shared/publicJoinExtras';

export function defaultClothingPackages(): ClothingPackageDef[] {
  return CLOTHING_PACKAGE_OPTIONS.map((option) => ({
    id: option.value,
    name: option.label,
  }));
}

export function normalizeClothingPackages(
  list: ClothingPackageDef[] | undefined | null,
): ClothingPackageDef[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const next: ClothingPackageDef[] = [];
  for (const row of list) {
    const id = String(row?.id ?? '').trim();
    const name = String(row?.name ?? '').trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    next.push({ id, name });
  }
  return next;
}

export function studentClothingPackageIds(
  student: Pick<Student, 'clothingPackageIds' | 'joinExtras'>,
): string[] {
  const fromList = (student.clothingPackageIds ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);
  if (fromList.length > 0) return [...new Set(fromList)];
  const fromJoin = student.joinExtras?.clothingPackage;
  return fromJoin ? [fromJoin] : [];
}

export function clothingPackageSummary(
  ids: string[],
  packages: ClothingPackageDef[],
): string {
  return ids
    .map((id) => packages.find((p) => p.id === id)?.name ?? id)
    .filter(Boolean)
    .join(', ');
}
