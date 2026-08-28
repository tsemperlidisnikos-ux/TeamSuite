import { apiClient } from '../apiClient';
import { getData, mutateData } from '../../data/repository';
import type { SizeChart } from '../../types';
import { flattenSizeChart, normalizeSizeChart } from '../../utils/sizeChartOptions';

export async function getSizeChart() {
  return apiClient(() => getData().sizeChart);
}

export async function saveSizeChart(chart: SizeChart) {
  return apiClient(() => {
    mutateData((data) => {
      const sizes = flattenSizeChart(normalizeSizeChart(chart));
      data.sizeChart = { kids: sizes, men: [], women: [] };
    });
    return getData().sizeChart;
  });
}
