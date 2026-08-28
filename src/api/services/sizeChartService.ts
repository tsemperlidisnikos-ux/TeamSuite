import { apiClient } from '../apiClient';
import { getData, mutateData } from '../../data/repository';
import type { SizeChart } from '../../types';
import {
  adultSizesFromChart,
  resolvedSizeChartGroupLabels,
} from '../../utils/sizeChartOptions';

export async function getSizeChart() {
  return apiClient(() => getData().sizeChart);
}

export async function saveSizeChart(chart: SizeChart) {
  return apiClient(() => {
    const adult = adultSizesFromChart(chart);
    mutateData((data) => {
      const labels = resolvedSizeChartGroupLabels(chart);
      data.sizeChart = {
        kids: [...chart.kids],
        men: [...adult],
        women: [...adult],
        groupLabels: { kids: labels.kids, adult: labels.adult },
      };
    });
    return getData().sizeChart;
  });
}
