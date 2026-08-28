import { apiClient } from '../apiClient';
import { getData, mutateData } from '../../data/repository';

export async function getTermsOfUse() {
  return apiClient(() => getData().termsOfUseHtml ?? '');
}

export async function saveTermsOfUse(html: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.termsOfUseHtml = html;
    });
    return getData().termsOfUseHtml ?? '';
  });
}
