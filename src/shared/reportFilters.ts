export type ReportFilters = {
  type: 'all' | 'income' | 'expense';
  subcategory: string;
  clubName: string;
  sport: string;
  dateFrom: string;
  dateTo: string;
  minAmount?: number;
  maxAmount?: number;
  search: string;
};
