import { useMemo, useState } from 'react';
import { Banknote, Receipt, TriangleAlert, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppData } from '../hooks/useAppData';
import { localDateIso } from '../utils/dates';
import { formatCurrency, formatDate } from '../utils/labels';
import { buildDailyTill } from '../utils/dailyTill';
import { sessionSeesOnlyOwnFinance } from '../utils/financeOwnEntries';
import { Button } from './ui/Button';
import { StatCard } from './ui/StatCard';

export function DailyTillPanel() {
  const { data } = useAppData();
  const ownOnly = sessionSeesOnlyOwnFinance();
  const [date, setDate] = useState(localDateIso);
  const till = useMemo(() => buildDailyTill(data, date), [data, date]);
  const gap = Math.round((till.collectionsTotal - till.receiptsTotal) * 100) / 100;
  const incomeGap = Math.round((till.collectionsTotal - till.incomeTotal) * 100) / 100;

  return (
    <section className="panel daily-till">
      <div className="daily-till-head">
        <div>
          <h2>Ταμείο ημέρας</h2>
          <p className="lede">
            Εισπράξεις (μετρητά / POS / online), αποδείξεις που κόπηκαν και έσοδα στα Οικονομικά
            για την επιλεγμένη ημέρα.
          </p>
        </div>
        <label className="field daily-till-date">
          <span className="field-label">Ημερομηνία</span>
          <input
            className="field-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || localDateIso())}
          />
        </label>
      </div>

      {ownOnly ? (
        <p className="muted">
          Βλέπετε μόνο τα έσοδα που καταχωρήσατε εσείς. Οι εισπράξεις συνδρομών και ενοικιάσεων
          είναι του συλλόγου.
        </p>
      ) : null}

      <div className="stats-grid cols-4">
        <StatCard
          icon={Banknote}
          label="Εισπράξεις"
          value={formatCurrency(till.collectionsTotal)}
          hint={`${till.collectionCount} κινήσεις`}
          tone="positive"
        />
        <StatCard
          icon={Wallet}
          label="Έσοδα οικονομικών"
          value={formatCurrency(till.incomeTotal)}
          hint={`${till.incomeCount} εγγραφές`}
        />
        <StatCard
          icon={Receipt}
          label="Αποδείξεις"
          value={formatCurrency(till.receiptsTotal)}
          hint={`${till.receiptsCount} εκδοθείσες${till.receiptsVoided ? ` · ${till.receiptsVoided} ακυρ.` : ''}`}
        />
        <StatCard
          icon={TriangleAlert}
          label="Χωρίς απόδειξη"
          value={formatCurrency(Math.max(0, gap))}
          hint={gap > 0.05 ? 'Υπάρχουν εισπράξεις χωρίς κοπή' : 'Σε συμφωνία'}
          tone={gap > 0.05 ? 'warn' : 'positive'}
        />
      </div>

      {Math.abs(incomeGap) > 0.05 ? (
        <p className="form-error">
          Οι εισπράξεις διαφέρουν από τα έσοδα Οικονομικών κατά {formatCurrency(incomeGap)} (
          {formatDate(date)}).
        </p>
      ) : null}

      {till.methods.length > 0 ? (
        <div className="table-wrap">
          <table className="page-table">
            <thead>
              <tr>
                <th>Τρόπος</th>
                <th>Εισπράξεις</th>
                <th>Κινήσεις</th>
                <th>Έσοδα οικονομικών</th>
              </tr>
            </thead>
            <tbody>
              {till.methods.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>{formatCurrency(row.collections)}</td>
                  <td>{row.collectionCount || '—'}</td>
                  <td>{formatCurrency(row.income)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Δεν υπάρχουν εισπράξεις ή έσοδα για αυτή την ημέρα.</p>
      )}

      {till.uncollectedToday.length > 0 ? (
        <div className="daily-till-gaps">
          <h3>Ενοικιάσεις σήμερα χωρίς είσπραξη</h3>
          <ul>
            {till.uncollectedToday.map((row) => (
              <li key={row.id}>
                {row.label} · {formatCurrency(row.amount)}
              </li>
            ))}
          </ul>
          <p>
            <Link className="text-link" to="/rental?tab=bookings">
              Άνοιγμα κρατήσεων →
            </Link>
          </p>
        </div>
      ) : null}

      {till.missingReceipts.length > 0 ? (
        <div className="daily-till-gaps">
          <h3>Εισπράξεις χωρίς απόδειξη</h3>
          <ul>
            {till.missingReceipts.map((row) => (
              <li key={row.id}>
                {row.label} · {formatCurrency(row.amount)}
              </li>
            ))}
          </ul>
          <p className="muted">
            Κόψτε απόδειξη από Συναλλαγές ή Ενοικίαση → Απόδειξη. Μητρώο:{' '}
            <Link to="/settings?tab=receipts">Ρυθμίσεις → Αποδείξεις</Link>
          </p>
        </div>
      ) : null}

      <div className="daily-till-print">
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Εκτύπωση ταμείου
        </Button>
      </div>
    </section>
  );
}
