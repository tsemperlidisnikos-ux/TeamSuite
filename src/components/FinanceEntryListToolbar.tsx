import { Printer } from 'lucide-react';
import { Button } from './ui/Button';
import { formatCurrency } from '../utils/labels';
import { printFinanceEntries } from '../utils/financeEntrySearch';

type FinanceEntryListToolbarProps = {
  kind: 'income' | 'expense';
  descriptions: string[];
  description: string;
  onDescriptionChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  resultCount: number;
  total: number;
};

export function FinanceEntryListToolbar({
  kind,
  descriptions,
  description,
  onDescriptionChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  resultCount,
  total,
}: FinanceEntryListToolbarProps) {
  const searchId = kind === 'income' ? 'income-entry-search' : 'expense-entry-search';
  return (
    <div className="finance-entry-toolbar no-print">
      <label className="finance-entry-search" htmlFor={searchId}>
        <span className="finance-entry-search-label">Περιγραφή</span>
        <select
          id={searchId}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
        >
          <option value="">Όλες οι περιγραφές</option>
          {descriptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label className="field finance-entry-date">
        <span className="field-label">Από</span>
        <input
          className="field-input"
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
        />
      </label>
      <label className="field finance-entry-date">
        <span className="field-label">Έως</span>
        <input
          className="field-input"
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => onDateToChange(e.target.value)}
        />
      </label>
      <div className="finance-entry-toolbar-meta">
        <span>
          {resultCount} εγγραφές · {formatCurrency(total)}
        </span>
        <Button type="button" variant="secondary" onClick={printFinanceEntries}>
          <Printer size={16} />
          Εκτύπωση
        </Button>
      </div>
    </div>
  );
}
