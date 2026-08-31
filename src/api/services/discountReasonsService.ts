import { apiClient } from '../apiClient';
import { getData, mutateData } from '../../data/repository';
import type { DiscountReasonDef } from '../../types';
import { clubDiscountReasons } from '../../utils/discountReasons';

export async function saveDiscountReasons(reasons: DiscountReasonDef[]) {
  return apiClient(async () => {
    mutateData((data) => {
      data.discountReasons = clubDiscountReasons(reasons);
    });
    const { flushClubMirrorPush } = await import('../../data/clubSync');
    await flushClubMirrorPush();
    return getData().discountReasons ?? [];
  });
}
