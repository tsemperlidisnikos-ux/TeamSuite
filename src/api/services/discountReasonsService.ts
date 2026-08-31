import { apiClient } from '../apiClient';
import { getData, mutateData } from '../../data/repository';
import type { DiscountReasonDef } from '../../types';
import { normalizeDiscountReasons } from '../../utils/discountReasons';

export async function saveDiscountReasons(reasons: DiscountReasonDef[]) {
  return apiClient(() => {
    mutateData((data) => {
      data.discountReasons = normalizeDiscountReasons(reasons);
    });
    return getData().discountReasons ?? [];
  });
}
